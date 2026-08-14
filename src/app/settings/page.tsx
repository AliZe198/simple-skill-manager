"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { fetcher, swrOpts, useAgents, apiPost } from "@/lib/client";
import { useLang } from "@/components/LangProvider";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import {
  SyncChoiceDialog,
  type SyncChoice,
} from "@/components/SyncChoiceDialog";
import { TagManager } from "@/components/TagManager";
import type { AppConfig, DetectedAgent, TargetMode } from "@/lib/types";
import type {
  SyncStatus,
  ConnectPreview,
  GhLoginState,
  SyncCheck,
} from "@/lib/sync";

type PathCheck = { isDir: boolean; isFile: boolean; absolute: string };

/** MCP config shapes we can parse — keep in sync with mcp.ts / library.ts. */
const MCP_FORMATS = [
  "json-claude",
  "toml-codex",
  "json-gemini",
  "json-kimi",
  "json-openclaw-mcporter",
  "yaml-hermes",
] as const;

/** Turn a git remote (https or git@ ssh, with/without .git) into a browsable
 *  https repo URL for the "open on GitHub" link. */
function webUrlFromRemote(url: string): string {
  const ssh = url.match(/^git@([^:]+):(.+?)(?:\.git)?\/?$/);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  return url.replace(/\.git$/, "").replace(/\/$/, "");
}

export default function SettingsPage() {
  const { t, lang, setLang } = useLang();
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const [syncBusy, setSyncBusy] = useState("");
  const [syncError, setSyncError] = useState("");
  const [preview, setPreview] = useState<ConnectPreview | null>(null);
  const [syncConfirm, setSyncConfirm] = useState<
    | "backup"
    | "pull"
    | "overwriteCloudWithLocal"
    | "restoreFromCloud"
    | "undoCloudOverwrite"
    | null
  >(null);
  const [syncChoiceOpen, setSyncChoiceOpen] = useState(false);
  const [ignoreTarget, setIgnoreTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [dirEdit, setDirEdit] = useState<{
    id: string;
    label: string;
    dir: string;
    dir0: string;
    hasDirOverride: boolean;
    mcpPath: string;
    mcpPath0: string;
    mcpFormat: string;
    mcpFormat0: string;
    hasMcpOverride: boolean;
  } | null>(null);
  const [dirCheck, setDirCheck] = useState<PathCheck | null>(null);
  const [mcpCheck, setMcpCheck] = useState<PathCheck | null>(null);
  const [repoInput, setRepoInput] = useState("");
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);
  const [ghLogin, setGhLogin] = useState<GhLoginState | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [connectOpts, setConnectOpts] = useState<{
    repoUrl?: string;
    create?: boolean;
    repoName?: string;
    repoPrivate?: boolean;
  }>({});
  const { data: config, mutate: mutateConfig } = useSWR<AppConfig>(
    "/api/config",
    fetcher,
    swrOpts
  );
  const { data: agents, mutate: mutateAgents } = useAgents();
  const { data: sync, mutate: mutateSync } = useSWR<SyncStatus>(
    "/api/sync",
    fetcher,
    swrOpts
  );
  const {
    data: checkResult,
    error: checkError,
    isLoading: checkLoading,
    mutate: mutateCheck,
  } = useSWR<SyncCheck>(
    sync?.connected ? "sync:checkChanges" : null,
    () => apiPost<SyncCheck>("/api/sync", { action: "checkChanges" }),
    swrOpts
  );

  // Stop polling on unmount.
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // OAuth-like browser login: start gh device flow, show the code, poll.
  async function startGhLogin() {
    setSyncBusy("ghlogin");
    setCopied(false);
    try {
      const s = await apiPost<GhLoginState>("/api/sync", {
        action: "ghLoginStart",
      });
      setGhLogin(s);
      if (s.status === "success") {
        finishGhLogin(true);
        return;
      }
      if (s.status === "error") {
        // gh missing / spawn failed → don't open a browser tab or poll.
        finishGhLogin(false);
        return;
      }
      if (s.verificationUrl) window.open(s.verificationUrl, "_blank", "noopener");
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const p = await apiPost<GhLoginState>("/api/sync", {
            action: "ghLoginStatus",
          });
          // Dropped if the user cancelled / it finished while this was in flight
          // (stopPolling nulls pollRef), so no stale toast or UI flip.
          if (!pollRef.current) return;
          setGhLogin(p);
          if (p.status === "success") finishGhLogin(true);
          else if (p.status === "error") finishGhLogin(false);
        } catch {
          /* keep polling */
        }
      }, 2000);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSyncBusy("");
    }
  }

  function finishGhLogin(ok: boolean) {
    stopPolling();
    setGhLogin(null);
    toast(ok ? t("sync_gh_success") : t("sync_gh_failed"), ok ? "success" : "error");
    mutateSync();
  }

  async function cancelGhLogin() {
    stopPolling();
    setGhLogin(null);
    try {
      await apiPost("/api/sync", { action: "ghLoginCancel" });
    } catch {
      /* ignore */
    }
  }

  async function runSync(
    action: string,
    okMsg: (d: Record<string, unknown>) => string
  ) {
    setSyncBusy(action);
    setSyncError("");
    try {
      const d = await apiPost<Record<string, unknown>>("/api/sync", { action });
      if (d.flow === "refused") toast(String(d.message ?? ""), "error");
      else toast(okMsg(d), "success");
    } catch (e) {
      setSyncError((e as Error).message);
    } finally {
      await Promise.allSettled([mutateSync(), mutateCheck()]);
      setSyncBusy("");
    }
  }

  // Step 1: dry-run preview → open confirm dialog. Step 2 (confirm) runs connect.
  type COpts = {
    repoUrl?: string;
    create?: boolean;
    repoName?: string;
    repoPrivate?: boolean;
  };
  async function openConnect(opts: COpts) {
    setSyncBusy(opts.create ? "create" : "connect");
    setConnectOpts(opts);
    try {
      const p = await apiPost<ConnectPreview>("/api/sync", {
        action: "connectPreview",
        ...opts,
      });
      setPreview(p);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSyncBusy("");
    }
  }

  async function doConnect() {
    setSyncBusy("connect");
    try {
      const d = await apiPost<{ flow: string; imported?: number }>(
        "/api/sync",
        { action: "connect", ...connectOpts }
      );
      const msg =
        d.flow === "cloned" || d.flow === "merge"
          ? `⬇ ${t("sync_imported_n")} ${d.imported ?? 0}`
          : t("toast_done");
      toast(msg, "success");
      mutateSync();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSyncBusy("");
    }
  }

  function chooseSyncAction(choice: SyncChoice) {
    setSyncChoiceOpen(false);
    setSyncConfirm(choice);
  }

  const localChangeCount = checkResult
    ? Math.max(checkResult.changedCount, checkResult.ahead)
    : 0;
  const hasLocalChanges = !!checkResult?.needsBackup;
  const hasCloudChanges = (checkResult?.behind ?? 0) > 0;
  const hasDifferentChanges = hasLocalChanges && hasCloudChanges;

  const syncStateTitle = syncError
    ? t("sync_action_failed")
    : checkError
    ? t("sync_state_check_failed")
    : checkLoading || !checkResult
      ? t("sync_state_checking")
      : hasDifferentChanges
        ? t("sync_state_diverged")
        : hasLocalChanges
          ? t("sync_state_local").replace("{n}", String(localChangeCount))
          : hasCloudChanges
            ? t("sync_state_cloud").replace(
                "{n}",
                String(checkResult.behind)
              )
            : t("sync_check_uptodate");

  const syncStateBody = syncError
    ? syncError
    : checkError
    ? String((checkError as Error).message || "")
    : checkLoading || !checkResult
      ? ""
      : hasDifferentChanges
        ? t("sync_state_diverged_desc")
            .replace("{local}", String(localChangeCount))
            .replace("{cloud}", String(checkResult.behind))
        : hasLocalChanges
          ? t("sync_state_local_desc")
          : hasCloudChanges
            ? t("sync_state_cloud_desc")
            : t("sync_state_uptodate_desc");

  function runPrimarySyncAction() {
    setSyncError("");
    if (checkError) {
      void mutateCheck();
    } else if (hasDifferentChanges) {
      setSyncChoiceOpen(true);
    } else if (hasLocalChanges) {
      setSyncConfirm("backup");
    } else if (hasCloudChanges) {
      setSyncConfirm("pull");
    }
  }

  const primarySyncLabel = checkError
    ? t("sync_action_retry")
    : checkLoading || !checkResult
      ? t("sync_state_checking")
      : hasDifferentChanges
        ? t("sync_action_choose")
        : hasLocalChanges
          ? t("sync_action_backup_local")
          : hasCloudChanges
            ? t("sync_action_get_cloud")
            : t("sync_check_uptodate");

  function previewBody(p: ConnectPreview): string {
    const repo = `${p.repoFull}${p.isPublic ? `\n${t("sync_repo_public_warn")}` : ""}`;
    if (p.flow === "error") return p.message ?? "";
    if (p.flow === "cloned")
      return `${t("sync_confirm_clone")} ${repo}`;
    if (p.flow === "pushToEmpty")
      return `${t("sync_confirm_push_empty")} ${p.repoFull}（${t("sync_repo_empty")}）· ${t("sync_will_backup")} ${p.skillCount} ${t("sync_skills_unit")}\n${p.isPublic ? t("sync_repo_public_warn") : ""}`;
    if (p.flow === "merge")
      return `${t("sync_confirm_merge")} ${repo}`;
    return `${t("sync_confirm_create")} ${p.repoFull}（${t("sync_repo_new")}）· ${t("sync_will_backup")} ${p.skillCount} ${t("sync_skills_unit")}${p.isPublic ? `\n${t("sync_repo_public_warn")}` : ""}`;
  }

  async function toggleLinkMode(agentId: string, current: TargetMode) {
    const mode: TargetMode = current === "copy" ? "symlink" : "copy";
    setBusy(agentId);
    try {
      await apiPost("/api/config", { action: "setLinkMode", agentId, mode });
      await Promise.all([mutateConfig(), mutateAgents()]);
      toast(t("toast_done"), "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  }

  async function runAgentConfig(
    body: Record<string, unknown>,
    okMsg: string
  ) {
    setBusy(String(body.agentId));
    try {
      await apiPost("/api/config", body);
      await Promise.all([mutateConfig(), mutateAgents()]);
      toast(okMsg, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy("");
      setIgnoreTarget(null);
    }
  }

  function openDirEdit(a: DetectedAgent) {
    const ov = config?.overrides?.[a.id];
    setDirCheck(null);
    setMcpCheck(null);
    setDirEdit({
      id: a.id,
      label: a.label,
      dir: a.skillsDirs[0] ?? "",
      dir0: a.skillsDirs[0] ?? "",
      hasDirOverride: Array.isArray(ov?.skillsDirs) && ov.skillsDirs.length > 0,
      mcpPath: a.mcpConfigPath ?? "",
      mcpPath0: a.mcpConfigPath ?? "",
      mcpFormat: a.mcpConfigFormat ?? "json-claude",
      mcpFormat0: a.mcpConfigFormat ?? "json-claude",
      hasMcpOverride: !!ov?.mcpConfigPath,
    });
  }

  function closeDirEdit() {
    setDirEdit(null);
    setDirCheck(null);
    setMcpCheck(null);
  }

  async function checkPath(which: "dir" | "mcp") {
    if (!dirEdit) return;
    const p = which === "dir" ? dirEdit.dir : dirEdit.mcpPath;
    setBusy(dirEdit.id);
    try {
      const r = await apiPost<PathCheck>("/api/config", {
        action: "checkAgentPath",
        path: p,
      });
      if (which === "dir") setDirCheck(r);
      else setMcpCheck(r);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  }

  // Persist one config action, then refresh and close the editor.
  async function applyDirEdit(
    body: Record<string, unknown>,
    okMsg: string
  ) {
    if (!dirEdit) return;
    setBusy(dirEdit.id);
    try {
      await apiPost("/api/config", body);
      await Promise.all([mutateConfig(), mutateAgents()]);
      toast(okMsg, "success");
      closeDirEdit();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  }

  // Save both sections in one go, but only the ones the user actually changed
  // (so untouched defaults don't get pinned as redundant overrides).
  async function saveDirEdit() {
    if (!dirEdit) return;
    const d = dirEdit;
    const dirChanged = d.dir.trim() !== d.dir0.trim();
    const mcpChanged =
      d.mcpPath.trim() !== d.mcpPath0.trim() || d.mcpFormat !== d.mcpFormat0;
    if (!dirChanged && !mcpChanged) {
      closeDirEdit();
      return;
    }
    setBusy(d.id);
    try {
      if (dirChanged)
        await apiPost("/api/config", {
          action: "setAgentSkillsDir",
          agentId: d.id,
          dir: d.dir,
        });
      if (mcpChanged)
        await apiPost("/api/config", {
          action: "setAgentMcpConfig",
          agentId: d.id,
          configPath: d.mcpPath,
          format: d.mcpFormat,
        });
      await Promise.all([mutateConfig(), mutateAgents()]);
      toast(t("toast_done"), "success");
      closeDirEdit();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-extrabold text-ink-header">
        ⚙️ {t("nav_settings")}
      </h1>

      <section className="card flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-extrabold text-ink-header">
            ☁️ {t("sync_title")}
          </h2>
          <span
            className={
              "badge " +
              (sync?.connected
                ? "bg-mint text-white"
                : "bg-stone-100 text-ink-muted")
            }
          >
            {sync?.connected ? t("sync_connected") : t("sync_not_connected")}
          </span>
        </div>
        <p className="text-sm text-ink-secondary">{t("sync_desc")}</p>

        {sync && !sync.ghReady && (
          <div className="flex flex-col gap-3 rounded-bubble bg-amber-50 p-3">
            <p className="text-xs text-amber-700">ℹ️ {t("sync_gh_missing")}</p>
            {!ghLogin ? (
              <Button
                variant="primary"
                disabled={syncBusy === "ghlogin"}
                onClick={startGhLogin}
              >
                {syncBusy === "ghlogin"
                  ? t("sync_gh_login_busy")
                  : `🌐 ${t("sync_gh_login")}`}
              </Button>
            ) : (
              <div className="flex flex-col gap-2 rounded-card border-2 border-amber-200 bg-white/70 p-3">
                <span className="text-xs font-bold text-ink-secondary">
                  {t("sync_gh_code")}
                </span>
                <div className="flex items-center gap-2">
                  <code className="rounded-bubble bg-stone-100 px-3 py-1.5 font-mono text-lg font-extrabold tracking-widest text-ink-header">
                    {ghLogin.code ?? "····-····"}
                  </code>
                  <button
                    onClick={() => {
                      if (ghLogin.code) {
                        navigator.clipboard?.writeText(ghLogin.code);
                        setCopied(true);
                      }
                    }}
                    className="text-xs font-bold text-mint-active hover:underline"
                  >
                    {copied ? `✓ ${t("sync_gh_copied")}` : t("sync_gh_copy")}
                  </button>
                </div>
                <p className="text-xs text-ink-secondary">{t("sync_gh_code_hint")}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={ghLogin.verificationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-mint-active hover:underline"
                  >
                    🔗 {t("sync_gh_open")}
                  </a>
                  <span className="flex items-center gap-1 text-xs text-ink-muted">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-mint" />
                    {t("sync_gh_waiting")}
                  </span>
                  <button
                    onClick={cancelGhLogin}
                    className="ml-auto text-xs text-ink-muted hover:text-ink-body hover:underline"
                  >
                    {t("sync_gh_cancel")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {!sync?.connected ? (
          <div className="flex flex-wrap gap-2">
            <div className="flex w-full flex-col gap-2">
              {/* Primary: connect to an existing repo */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="input min-w-0 flex-1"
                  placeholder={t("sync_repo_input_ph")}
                  value={repoInput}
                  disabled={!!syncBusy || (sync && !sync.ghReady)}
                  onChange={(e) => setRepoInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && repoInput.trim())
                      openConnect({ repoUrl: repoInput.trim() });
                  }}
                />
                <Button
                  variant="primary"
                  disabled={
                    !!syncBusy || !repoInput.trim() || (sync && !sync.ghReady)
                  }
                  onClick={() => openConnect({ repoUrl: repoInput.trim() })}
                >
                  {syncBusy === "connect" ? "…" : `🔗 ${t("sync_connect")}`}
                </Button>
              </div>
              {/* Secondary: create a new repo (name + visibility) */}
              <details className="rounded-card border-2 border-line/30 bg-content/40 px-3 py-2">
                <summary className="cursor-pointer text-xs font-bold text-ink-secondary hover:text-mint-active">
                  ＋ {t("sync_create_new")}
                </summary>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    className="input min-w-0 flex-1"
                    placeholder={t("sync_repo_name_ph")}
                    value={newRepoName}
                    disabled={!!syncBusy || (sync && !sync.ghReady)}
                    onChange={(e) => setNewRepoName(e.target.value)}
                  />
                  <div className="flex overflow-hidden rounded-pill border-2 border-line/40">
                    {([true, false] as const).map((priv) => (
                      <button
                        key={String(priv)}
                        onClick={() => setNewRepoPrivate(priv)}
                        disabled={!!syncBusy || (sync && !sync.ghReady)}
                        className={
                          "px-3 py-1.5 text-xs font-bold transition-colors " +
                          (newRepoPrivate === priv
                            ? "bg-mint text-white"
                            : "bg-content text-ink-secondary hover:bg-mint-light")
                        }
                      >
                        {priv
                          ? `🔒 ${t("sync_repo_private")}`
                          : `🌐 ${t("sync_repo_public")}`}
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="default"
                    disabled={!!syncBusy || (sync && !sync.ghReady)}
                    onClick={() =>
                      openConnect({
                        create: true,
                        repoName: newRepoName.trim() || undefined,
                        repoPrivate: newRepoPrivate,
                      })
                    }
                  >
                    {syncBusy === "create" ? "…" : t("sync_create_btn")}
                  </Button>
                </div>
              </details>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div
              aria-live="polite"
              className={
                "rounded-card border-2 p-4 " +
                (syncError || checkError || hasDifferentChanges
                  ? "border-status-warning/60 bg-status-warning/10"
                  : hasLocalChanges || hasCloudChanges
                    ? "border-line/40 bg-white/45"
                    : "border-mint/50 bg-mint-light")
              }
            >
              <div className="flex items-start gap-3">
                <span
                  className={
                    "mt-1 h-3 w-3 shrink-0 rounded-full " +
                    (syncError || checkError || hasDifferentChanges
                      ? "bg-status-warning"
                      : checkLoading || !checkResult
                        ? "animate-pulse bg-line"
                        : "bg-mint")
                  }
                />
                <div className="min-w-0">
                  <p className="font-extrabold text-ink-header">{syncStateTitle}</p>
                  {syncStateBody ? (
                    <p className="mt-1 text-sm leading-relaxed text-ink-secondary">
                      {syncStateBody}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div>
              <Button
                variant={
                  !checkError && checkResult && !hasLocalChanges && !hasCloudChanges
                    ? "default"
                    : "primary"
                }
                className="w-full sm:w-auto"
                disabled={
                  !!syncBusy ||
                  checkLoading ||
                  (!checkError && !!checkResult && !hasLocalChanges && !hasCloudChanges)
                }
                onClick={runPrimarySyncAction}
              >
                {syncBusy ? "…" : primarySyncLabel}
              </Button>
            </div>

            <details className="rounded-card border-2 border-line/25 bg-white/25 px-3 py-2">
              <summary className="cursor-pointer text-xs font-bold text-ink-secondary hover:text-mint-active">
                {t("sync_more")}
              </summary>
              <div className="mt-3 flex flex-col gap-3 border-t border-line/20 pt-3">
                <div className="text-xs leading-relaxed text-ink-muted">
                  {sync.lastSync ? (
                    <span>
                      {t("sync_last")}: {new Date(sync.lastSync).toLocaleString()} ·{" "}
                    </span>
                  ) : null}
                  {sync.skillCount} {t("sync_skills_n")}
                </div>
                {sync.remoteUrl ? (
                  <a
                    href={webUrlFromRemote(sync.remoteUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-xs font-bold text-mint-active underline decoration-dotted underline-offset-2"
                  >
                    {webUrlFromRemote(sync.remoteUrl)} ↗
                  </a>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {hasCloudChanges ? (
                    <Button
                      variant="default"
                      disabled={!!syncBusy}
                      onClick={() => setSyncConfirm("overwriteCloudWithLocal")}
                    >
                      {t("sync_overwrite_local_action")}
                    </Button>
                  ) : null}
                  {checkResult?.canUndoCloudOverwrite ? (
                    <Button
                      variant="default"
                      disabled={!!syncBusy}
                      title={t("sync_undo_overwrite_hint")}
                      onClick={() => setSyncConfirm("undoCloudOverwrite")}
                    >
                      {t("sync_undo_overwrite")}
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    disabled={!!syncBusy}
                    title={t("sync_restore_hint")}
                    onClick={() => setSyncConfirm("restoreFromCloud")}
                  >
                    {t("sync_choice_cloud")}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!!syncBusy}
                    title={t("sync_disconnect_hint")}
                    onClick={() => runSync("disconnect", () => t("toast_done"))}
                  >
                    {t("sync_disconnect")}
                  </Button>
                </div>
              </div>
            </details>
          </div>
        )}
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="font-extrabold text-ink-header">{t("set_lang")}</h2>
        <div className="flex gap-2">
          {(["zh", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={
                "rounded-pill border-2 px-5 py-2 text-sm font-bold " +
                (lang === l
                  ? "border-mint-active bg-mint text-white"
                  : "border-line/40 bg-content text-ink-secondary")
              }
            >
              {l === "zh" ? "中文" : "English"}
            </button>
          ))}
        </div>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="font-extrabold text-ink-header">{t("tagmgr_title")}</h2>
        <p className="text-sm text-ink-muted">{t("tagmgr_desc")}</p>
        <TagManager />
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="font-extrabold text-ink-header">{t("set_paths")}</h2>
        <div className="flex flex-col gap-1 font-mono text-xs text-ink-body">
          <div className="break-all">
            <span className="text-ink-secondary">{t("set_agent_root")}:</span>{" "}
            {config?.agentRoot}
          </div>
          <div className="break-all">
            <span className="text-ink-secondary">{t("set_data_dir")}:</span>{" "}
            {config?.libraryDir}
          </div>
        </div>
        <p className="rounded-bubble bg-mint-light p-3 text-xs text-mint-active">
          💡 {t("set_env_hint")}
        </p>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="font-extrabold text-ink-header">{t("set_probe")}</h2>
        <p className="text-sm text-ink-body">{t("set_linkmode_hint")}</p>
        <p className="rounded-bubble bg-amber-50 p-3 text-xs text-amber-700">
          ⚠️ {t("set_probe_hint")}
        </p>
        <p className="text-xs text-ink-muted">💡 {t("linkmode_note")}</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-secondary">
              <th className="py-1">Agent</th>
              <th>{t("lbl_link_mode")}</th>
              <th>{t("lbl_detected")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(agents ?? [])
              .filter((a) => !a.ignored)
              .map((a) => (
                <tr key={a.id} className="border-t border-line/30">
                  <td className="py-1.5">
                    <div className="font-bold text-ink-header">{a.label}</div>
                    <button
                      onClick={() => openDirEdit(a)}
                      title={t("agent_dir_edit_hint")}
                      className="mt-0.5 max-w-[16rem] truncate font-mono text-[11px] text-ink-muted transition-colors hover:text-mint-active"
                    >
                      📁 {a.skillsDirs[0]} ✎
                    </button>
                  </td>
                  <td className="py-1.5">
                    <button
                      disabled={busy === a.id}
                      onClick={() => toggleLinkMode(a.id, a.linkMode)}
                      className="badge border border-line/50 bg-white/70 text-ink-body transition-colors hover:border-mint hover:bg-mint-light disabled:opacity-50"
                      title={t("linkmode_note")}
                    >
                      {busy === a.id
                        ? "…"
                        : a.linkMode === "copy"
                        ? t("lbl_copy")
                        : t("lbl_symlink")}
                      <span className="ml-1 opacity-50">⇄</span>
                    </button>
                  </td>
                  <td>
                    {a.detected ? (
                      <span className="text-status-success">
                        ✓ {t("lbl_detected")}
                      </span>
                    ) : (
                      <span className="text-ink-disabled">
                        — {t("lbl_not_detected")}
                      </span>
                    )}
                  </td>
                  <td className="text-right">
                    <button
                      disabled={busy === a.id}
                      onClick={() => setIgnoreTarget({ id: a.id, label: a.label })}
                      className="text-xs text-ink-muted hover:text-status-error disabled:opacity-50"
                      title={t("agent_ignore_hint")}
                    >
                      🚫 {t("agent_ignore")}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        {(agents ?? []).some((a) => a.ignored) && (
          <div className="mt-1 rounded-card border-2 border-line/20 bg-content/40 p-3">
            <p className="mb-1.5 text-xs font-bold text-ink-secondary">
              {t("agent_ignored_title")}
            </p>
            <div className="flex flex-wrap gap-2">
              {(agents ?? [])
                .filter((a) => a.ignored)
                .map((a) => (
                  <span
                    key={a.id}
                    className="badge bg-white/70 text-ink-muted"
                  >
                    {a.label}
                    <button
                      disabled={busy === a.id}
                      onClick={() =>
                        runAgentConfig(
                          { action: "unignoreAgent", agentId: a.id },
                          t("agent_unignored")
                        )
                      }
                      className="ml-1 font-bold text-mint-active hover:underline disabled:opacity-50"
                    >
                      {busy === a.id ? "…" : `↩ ${t("agent_unignore")}`}
                    </button>
                  </span>
                ))}
            </div>
          </div>
        )}
      </section>

      {preview && (
        <ConfirmDialog
          title={`☁️ ${t("sync_confirm_title")}`}
          body={previewBody(preview)}
          confirmLabel={
            preview.flow === "error" ? t("act_confirm") : t("sync_connect")
          }
          danger={preview.flow === "merge"}
          onCancel={() => setPreview(null)}
          onConfirm={() => {
            const flow = preview.flow;
            setPreview(null);
            if (flow === "error") return; // acknowledge only
            doConnect();
          }}
        />
      )}

      {syncChoiceOpen && (
        <SyncChoiceDialog
          localCount={localChangeCount}
          cloudCount={checkResult?.behind ?? 0}
          onCancel={() => setSyncChoiceOpen(false)}
          onChoose={chooseSyncAction}
        />
      )}

      {syncConfirm && (
        <ConfirmDialog
          title={
            syncConfirm === "backup"
              ? t("sync_action_backup_local")
              : syncConfirm === "pull"
                ? t("sync_action_get_cloud")
                : syncConfirm === "overwriteCloudWithLocal"
                  ? t("sync_choice_local")
                  : syncConfirm === "undoCloudOverwrite"
                    ? t("sync_undo_overwrite")
                    : t("sync_choice_cloud")
          }
          body={
            syncConfirm === "backup"
              ? t("sync_backup_confirm")
              : syncConfirm === "pull"
                ? t("sync_pull_confirm")
                : syncConfirm === "overwriteCloudWithLocal"
                  ? t("sync_overwrite_local_confirm")
                  : syncConfirm === "undoCloudOverwrite"
                    ? t("sync_undo_overwrite_confirm")
                    : t("sync_restore_confirm")
          }
          confirmLabel={
            syncConfirm === "overwriteCloudWithLocal"
              ? t("sync_overwrite_local_action")
              : syncConfirm === "restoreFromCloud"
                ? t("sync_choice_cloud")
                : syncConfirm === "undoCloudOverwrite"
                  ? t("sync_undo_overwrite")
                  : undefined
          }
          danger={
            syncConfirm === "restoreFromCloud" ||
            syncConfirm === "overwriteCloudWithLocal"
          }
          onCancel={() => setSyncConfirm(null)}
          onConfirm={() => {
            const a = syncConfirm;
            setSyncConfirm(null);
            if (a === "backup") runSync("backup", () => t("toast_done"));
            else if (a === "pull")
              runSync(
                "pull",
                (d) => `${t("sync_imported_n")} ${d.imported ?? 0}`
              );
            else if (a === "overwriteCloudWithLocal")
              runSync("overwriteCloudWithLocal", () => t("sync_overwrite_done"));
            else if (a === "undoCloudOverwrite")
              runSync("undoCloudOverwrite", () => t("sync_undo_done"));
            else runSync("restoreFromCloud", () => t("sync_restored"));
          }}
        />
      )}

      {dirEdit && (
        <Modal
          title={`📁 ${t("agent_cfg_title")} · ${dirEdit.label}`}
          onClose={closeDirEdit}
          size="lg"
        >
          <div className="flex flex-col gap-5 overflow-y-auto">
            <div className="font-mono text-xs text-ink-muted">
              <span className="text-ink-secondary">{t("set_agent_root")}:</span>{" "}
              {config?.agentRoot}
            </div>

            {/* Skills dir */}
            <div className="flex flex-col gap-2 rounded-card border-2 border-line/30 bg-content/40 p-3">
              <h3 className="text-sm font-extrabold text-ink-header">
                📁 {t("agent_dir_title")}
              </h3>
              <p className="text-xs text-ink-body">{t("agent_dir_desc")}</p>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-ink-secondary">
                  {t("agent_dir_input_label")}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    className="input min-w-0 flex-1 font-mono text-sm"
                    value={dirEdit.dir}
                    placeholder=".kimi-code/skills"
                    spellCheck={false}
                    onChange={(e) => {
                      setDirEdit({ ...dirEdit, dir: e.target.value });
                      setDirCheck(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") checkPath("dir");
                    }}
                  />
                  <Button
                    variant="default"
                    disabled={busy === dirEdit.id || !dirEdit.dir.trim()}
                    onClick={() => checkPath("dir")}
                  >
                    {busy === dirEdit.id ? "…" : `🔍 ${t("agent_dir_check")}`}
                  </Button>
                </div>
              </label>
              {dirCheck && (
                <div
                  className={
                    "rounded-bubble px-3 py-2 text-xs " +
                    (dirCheck.isDir
                      ? "bg-mint-light text-mint-active"
                      : "bg-amber-50 text-amber-700")
                  }
                >
                  <div className="font-bold">
                    {dirCheck.isDir
                      ? t("agent_dir_found")
                      : t("agent_dir_notfound")}
                  </div>
                  <div className="mt-0.5 break-all font-mono opacity-80">
                    {dirCheck.absolute}
                  </div>
                </div>
              )}
              <p className="text-xs text-ink-muted">{t("agent_dir_save_note")}</p>
              {dirEdit.hasDirOverride && (
                <button
                  disabled={busy === dirEdit.id}
                  onClick={() =>
                    applyDirEdit(
                      {
                        action: "setAgentSkillsDir",
                        agentId: dirEdit.id,
                        dir: "",
                      },
                      t("agent_dir_saved")
                    )
                  }
                  className="self-start text-xs font-bold text-ink-muted hover:text-mint-active disabled:opacity-50"
                >
                  ↩ {t("agent_dir_reset")}
                </button>
              )}
            </div>

            {/* MCP config */}
            <div className="flex flex-col gap-2 rounded-card border-2 border-line/30 bg-content/40 p-3">
              <h3 className="text-sm font-extrabold text-ink-header">
                🔌 {t("agent_mcp_section")}
              </h3>
              <p className="text-xs text-ink-body">{t("agent_mcp_desc")}</p>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-ink-secondary">
                  {t("agent_mcp_path_label")}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    className="input min-w-0 flex-1 font-mono text-sm"
                    value={dirEdit.mcpPath}
                    placeholder=".kimi-code/mcp.json"
                    spellCheck={false}
                    onChange={(e) => {
                      setDirEdit({ ...dirEdit, mcpPath: e.target.value });
                      setMcpCheck(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") checkPath("mcp");
                    }}
                  />
                  <Button
                    variant="default"
                    disabled={busy === dirEdit.id || !dirEdit.mcpPath.trim()}
                    onClick={() => checkPath("mcp")}
                  >
                    {busy === dirEdit.id ? "…" : `🔍 ${t("agent_dir_check")}`}
                  </Button>
                </div>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-ink-secondary">
                  {t("agent_mcp_format_label")}
                </span>
                <select
                  className="input font-mono text-sm"
                  value={dirEdit.mcpFormat}
                  onChange={(e) =>
                    setDirEdit({ ...dirEdit, mcpFormat: e.target.value })
                  }
                >
                  {MCP_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              {mcpCheck && (
                <div
                  className={
                    "rounded-bubble px-3 py-2 text-xs " +
                    (mcpCheck.isFile
                      ? "bg-mint-light text-mint-active"
                      : "bg-amber-50 text-amber-700")
                  }
                >
                  <div className="font-bold">
                    {mcpCheck.isFile
                      ? t("agent_mcp_found")
                      : t("agent_mcp_notfound")}
                  </div>
                  <div className="mt-0.5 break-all font-mono opacity-80">
                    {mcpCheck.absolute}
                  </div>
                </div>
              )}
              <p className="text-xs text-ink-muted">{t("agent_mcp_note")}</p>
              {dirEdit.hasMcpOverride && (
                <button
                  disabled={busy === dirEdit.id}
                  onClick={() =>
                    applyDirEdit(
                      {
                        action: "setAgentMcpConfig",
                        agentId: dirEdit.id,
                        configPath: "",
                        format: "",
                      },
                      t("agent_mcp_saved")
                    )
                  }
                  className="self-start text-xs font-bold text-ink-muted hover:text-mint-active disabled:opacity-50"
                >
                  ↩ {t("agent_dir_reset")}
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={closeDirEdit}>
              {t("act_cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={busy === dirEdit.id}
              onClick={saveDirEdit}
            >
              {busy === dirEdit.id ? "…" : t("act_confirm")}
            </Button>
          </div>
        </Modal>
      )}

      {ignoreTarget && (
        <Modal
          title={`🚫 ${t("agent_ignore")} · ${ignoreTarget.label}`}
          onClose={() => setIgnoreTarget(null)}
        >
          <p className="mb-5 whitespace-pre-line text-sm text-ink-body">
            {t("agent_ignore_body").replace("{name}", ignoreTarget.label)}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setIgnoreTarget(null)}>
              {t("act_cancel")}
            </Button>
            <Button
              variant="default"
              onClick={() =>
                runAgentConfig(
                  {
                    action: "ignoreAgent",
                    agentId: ignoreTarget.id,
                    cleanup: false,
                  },
                  t("agent_ignored")
                )
              }
            >
              {t("agent_ignore_hide_only")}
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                runAgentConfig(
                  {
                    action: "ignoreAgent",
                    agentId: ignoreTarget.id,
                    cleanup: true,
                  },
                  t("agent_ignored")
                )
              }
            >
              {t("agent_ignore_clean")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
