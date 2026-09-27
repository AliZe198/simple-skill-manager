"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import cn from "classnames";
import useSWR from "swr";
import type { DetectedAgent, SkillRow } from "@/lib/types";
import { apiPost, fetcher, swrOpts, orderTagNames } from "@/lib/client";
import { useLang } from "./LangProvider";
import { useToast } from "./Toast";
import { Button, ProvenanceBadge, HashTag } from "./ui";
import { AgentLogo } from "./AgentLogo";
import { ConfirmDialog } from "./ConfirmDialog";
import { Modal } from "./Modal";
import { SkillDetailModal } from "./SkillDetailModal";

export interface UpdateHint {
  hasUpdate: boolean;
  source: string | null;
  status: "update" | "current" | "no-source" | "error";
  error?: string;
}

/** One guessed update-source candidate (subset of lib/marketplace MarketSkill). */
interface SourceCandidate {
  id: string;
  name: string;
  source: string; // owner/repo
  installs: number;
  gitUrl: string;
  subpath: string;
}

type SourceMode = "search" | "manual" | "none";

/** Compact row for an imported skill in My Library. */
export function SkillListRow({
  skill,
  agents,
  onChanged,
  onCheckUpdates,
  checkingUpdates = false,
  update,
}: {
  skill: SkillRow;
  agents: DetectedAgent[];
  onChanged: (evictHashes?: string[]) => void | Promise<unknown>;
  onCheckUpdates?: () => void;
  checkingUpdates?: boolean;
  update?: UpdateHint;
}) {
  const { t } = useLang();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | "remove" | "trash" | "update">(
    null
  );
  const [showDetail, setShowDetail] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceSubdir, setSourceSubdir] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode | null>(null);
  const [guessing, setGuessing] = useState(false);
  const [candidates, setCandidates] = useState<SourceCandidate[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [tagEditorOrigin, setTagEditorOrigin] = useState<
    "row" | "detail" | null
  >(null);

  const detected = agents.filter((a) => a.detected && !a.ignored);
  const activeSet = new Set(skill.activeAgentIds);
  const bundled = skill.provenance === "bundled";
  const builtInAgentIds = [
    ...new Set(skill.occurrences.filter((o) => o.bundled).map((o) => o.agentId)),
  ];

  async function run(body: Record<string, unknown>, okMsg?: string) {
    setBusy(true);
    try {
      await apiPost("/api/skills/action", body);
      toast(okMsg ?? t("toast_done"), "success");
      // updateSkill rewrites the library copy, so this skill's content hash
      // changes — its entry in the update-check map is stale and must be
      // evicted. Other actions (enable/rename/tags/…) leave it valid.
      onChanged(body.action === "updateSkill" ? [skill.contentHash] : undefined);
    } catch (e) {
      toast((e as Error).message || t("toast_error"), "error");
    } finally {
      setBusy(false);
    }
  }

  function submitRename() {
    const name = renameVal.trim();
    setRenaming(false);
    // Don't skip on an unchanged name: rename also repairs a folder still sitting
    // on a hash-suffixed slug (what a merge leaves behind — clean name, ugly dir).
    // renameSkill() has its own no-op check that covers the folder too, so let the
    // server decide whether there is anything to do.
    if (!name) return;
    run({ action: "rename", hash: skill.contentHash, name }, t("rename_done"));
  }

  function openSource() {
    setSourceUrl(skill.gitUrl ?? "");
    setSourceSubdir(skill.sourceSubdir ?? "");
    setCandidates(null);
    setPicked(null);
    setSourceMode(null);
    setSourceOpen(true);
  }

  // linkSkillSource clones the repo and verifies the skill's dir exists before
  // saving, so both the manual form and a guessed candidate go through here.
  // Re-linking is the same path: the fields open prefilled with the current
  // source, and picking another candidate just overwrites them.
  async function linkSource(gitUrl: string, sourceSubdir: string) {
    setBusy(true);
    try {
      const r = await apiPost<{ hasUpdate?: boolean }>("/api/skills/action", {
        action: "linkSource",
        hash: skill.contentHash,
        gitUrl,
        sourceSubdir,
      });
      setSourceOpen(false);
      toast(t(r?.hasUpdate ? "source_linked_update" : "source_linked"), "success");
      // Source linked: the old "no source" update entry is now wrong — evict
      // just this skill's entry so the badge disappears immediately.
      onChanged([skill.contentHash]);
    } catch (e) {
      toast((e as Error).message || t("toast_error"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitSource() {
    if (!sourceUrl.trim()) return;
    await linkSource(sourceUrl.trim(), sourceSubdir.trim());
  }

  // Selecting a candidate only fills the form — nothing is linked until the
  // user confirms, so they can open the repo in a new tab and verify first.
  function pickCandidate(c: SourceCandidate) {
    setSourceUrl(c.gitUrl);
    setSourceSubdir(c.subpath);
    setPicked(c.id);
  }

  // Name-based source candidates. Guessing only ever happens on this explicit
  // click, and linking a picked candidate still goes through linkSkillSource's
  // clone-and-verify — a wrong pick fails loudly instead of mis-linking.
  async function guessSource() {
    setGuessing(true);
    try {
      const list = await apiPost<SourceCandidate[]>("/api/skills/action", {
        action: "guessSource",
        name: skill.name,
      });
      setCandidates(list);
    } catch (e) {
      toast((e as Error).message || t("toast_error"), "error");
    } finally {
      setGuessing(false);
    }
  }

  function chooseSourceMode(mode: SourceMode) {
    setSourceMode(mode);
    if (mode === "search" && candidates === null && !guessing) {
      void guessSource();
    }
  }

  // "不关联" is a real disconnect, not just a label: clear the recorded
  // repository and mark the skill as self-maintained so future checks skip it.
  async function disconnectSource() {
    setBusy(true);
    try {
      await apiPost("/api/skills/action", {
        action: "disconnectSource",
        hash: skill.contentHash,
      });
      setSourceOpen(false);
      toast(t("source_disconnected"), "success");
      onChanged([skill.contentHash]);
    } catch (e) {
      toast((e as Error).message || t("toast_error"), "error");
    } finally {
      setBusy(false);
    }
  }

  const onRowClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input, a, label, [role='menuitem']"))
      return;
    setShowDetail(true);
  };

  const canLinkSource =
    sourceUrl.trim() !== "" &&
    (sourceMode === "manual" || (sourceMode === "search" && picked !== null));

  return (
    <div
      onClick={onRowClick}
      className={cn(
        // hover/focus-within z-20: the hover lift (-translate-y-0.5) makes the
        // row a stacking context, which would otherwise trap the in-row ⋯ menu
        // under the next row. Tag editing is intentionally body-level now.
        "group relative flex min-h-[68px] cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 rounded-[18px] border-2 px-4 py-3 shadow-soft transition-[background-color,border-color,box-shadow,transform] duration-200 hover:z-20 focus-within:z-20 hover:-translate-y-0.5 hover:shadow-soft-hover xl:flex-nowrap",
        bundled
          ? "border-amber-200/80 bg-amber-50/55 hover:border-amber-300"
          : skill.parked
            ? "border-line/25 bg-content/55 hover:border-line/45 hover:bg-content/75"
            : "border-mint/25 bg-content/75 hover:border-mint/50 hover:bg-content"
      )}
    >
      {/* Main info */}
      <div className="flex min-w-0 w-full flex-col gap-1 pr-9 xl:w-auto xl:flex-1 xl:pr-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            onClick={() => setShowDetail(true)}
            title={t("lbl_view_detail")}
            className="truncate text-sm font-extrabold text-ink-header hover:text-mint-active hover:underline"
          >
            {skill.name}
          </button>
          {!bundled && (
            <span
              className={cn(
                "badge shrink-0",
                skill.parked
                  ? "bg-stone-100 text-ink-muted"
                  : "bg-mint text-white"
              )}
            >
              {skill.parked ? t("lbl_idle") : t("lbl_active")}
            </span>
          )}
          {update?.hasUpdate && (
            <button
              disabled={busy}
              onClick={() => {
                // Same rule as the menu item: overwriting unsynced local
                // edits needs a confirm (a snapshot is taken first).
                if (skill.localChanged) setConfirm("update");
                else
                  run(
                    { action: "updateSkill", hash: skill.contentHash },
                    t("upd_done")
                  );
              }}
              className="badge shrink-0 bg-amber-100 text-amber-700 transition-colors hover:bg-amber-200 disabled:opacity-50"
              title={
                t("upd_badge_click") +
                (update.source ? ` · ${t("upd_from")} ${update.source}` : "")
              }
            >
              ⬆ {t("upd_available")}
            </button>
          )}
          {update?.status === "no-source" && !bundled && (
            <button
              onClick={openSource}
              className="badge shrink-0 bg-stone-100 text-ink-muted transition-colors hover:bg-stone-200"
              title={t("source_link")}
            >
              {t("upd_no_source")}
            </button>
          )}
          {update?.status === "error" && !bundled && (
            <button
              onClick={openSource}
              className="badge shrink-0 bg-red-50 text-status-error-active transition-colors hover:bg-red-100"
              title={update.error ?? t("upd_check_error")}
            >
              {t("upd_check_error")}
            </button>
          )}
          {!bundled && skill.localChanged && (
            <button
              disabled={busy}
              onClick={() =>
                run(
                  { action: "syncLocalChange", hash: skill.contentHash },
                  t("sync_local_done")
                )
              }
              className="badge shrink-0 bg-orange-100 text-orange-700 transition-colors hover:bg-orange-200 disabled:opacity-50"
              title={t("sync_local_hint")}
            >
              ⟳ {t("sync_local_badge")}
            </button>
          )}
        </div>
        <p className="truncate text-xs text-ink-body">
          {skill.description || "—"}
        </p>
      </div>

      {/* Tags */}
      {!bundled && (
        <CompactTagBar
          tags={skill.tags}
          onOpen={() => setTagEditorOrigin("row")}
        />
      )}

      {/* Agent toggles / belongs-to */}
      <div
        className="ml-0 flex max-w-full flex-wrap items-center gap-1 py-0.5 xl:ml-auto xl:justify-end"
        aria-label={bundled ? t("lbl_builtin_of") : t("lbl_agent_switches")}
        title={bundled ? t("lbl_builtin_of") : t("lbl_agent_switches")}
      >
        {bundled ? (
          (builtInAgentIds.length ? builtInAgentIds : skill.occurrences.map((o) => o.agentId))
            .filter((v, i, a) => a.indexOf(v) === i)
            .map((id) => {
              const a = agents.find((x) => x.id === id);
              return (
                <AgentLogo key={id} agentId={id} label={a?.label ?? id} size="sm" />
              );
            })
        ) : (
          detected.map((a) => {
            const active = activeSet.has(a.id);
            return (
              <button
                key={a.id}
                disabled={busy}
                onClick={() =>
                  run(
                    {
                      action: active ? "disable" : "enable",
                      hash: skill.contentHash,
                      agentId: a.id,
                    },
                    `${a.label}: ${active ? t("act_disable") : t("act_enable")}`
                  )
                }
                title={`${a.label} · ${active ? t("act_disable") : t("act_enable")}`}
                className={cn(
                  "relative flex h-8 w-8 items-center justify-center rounded-full border transition-[background-color,border-color,box-shadow,filter,opacity] disabled:opacity-50",
                  active
                    ? "border-mint/60 bg-mint-light shadow-soft"
                    : "border-transparent opacity-45 grayscale hover:border-line/25 hover:bg-content hover:opacity-85 hover:grayscale-0"
                )}
              >
                <AgentLogo agentId={a.id} label={a.label} size="sm" />
                {active && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-mint text-[9px] font-extrabold text-white ring-2 ring-white">
                    ✓
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* More actions */}
      <div className="absolute right-3 top-3 shrink-0 sm:relative sm:right-auto sm:top-auto">
        <button
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full text-lg font-bold text-ink-secondary transition-colors hover:bg-line/20 hover:text-ink-body"
          aria-haspopup="true"
          aria-expanded={menuOpen}
        >
          ⋯
        </button>
        {menuOpen && (
          <ActionMenu onClose={() => setMenuOpen(false)}>
            {bundled ? (
              <>
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    run(
                      { action: "moveToLibrary", hash: skill.contentHash },
                      t("act_move_to_library")
                    );
                  }}
                >
                  → {t("act_move_to_library")}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirm("remove");
                  }}
                >
                  {t("act_remove_lib")}
                </MenuItem>
              </>
            ) : (
              <>
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    setRenameVal(skill.name);
                    setRenaming(true);
                  }}
                >
                  ✏️ {t("act_rename")}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    openSource();
                  }}
                >
                  {t("source_link")}
                </MenuItem>
                {skill.localChanged && (
                  <MenuItem
                    onClick={() => {
                      setMenuOpen(false);
                      run(
                        { action: "syncLocalChange", hash: skill.contentHash },
                        t("sync_local_done")
                      );
                    }}
                  >
                    ⟳ {t("sync_local_btn")}
                  </MenuItem>
                )}
                {update?.hasUpdate && (
                  <MenuItem
                    onClick={() => {
                      setMenuOpen(false);
                      // Updating replaces the library copy — with unsynced
                      // local edits in it, that's a destructive overwrite the
                      // user must confirm (a git snapshot is taken first).
                      if (skill.localChanged) setConfirm("update");
                      else
                        run(
                          { action: "updateSkill", hash: skill.contentHash },
                          t("upd_done")
                        );
                    }}
                  >
                    ⬆ {t("upd_update")}
                  </MenuItem>
                )}
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirm("remove");
                  }}
                >
                  {t("act_remove_lib")}
                </MenuItem>
                <MenuItem
                  danger
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirm("trash");
                  }}
                >
                  {t("act_move_trash")}
                </MenuItem>
              </>
            )}
          </ActionMenu>
        )}
      </div>

      {/* Hash hint — decorative; yield the space to name/description below xl */}
      <span className="hidden xl:inline">
        <HashTag hash={skill.contentHash} />
      </span>

      {/* Rename modal */}
      {renaming && (
        <Modal title={`✏️ ${t("act_rename")}`} onClose={() => setRenaming(false)}>
          <input
            className="input w-full"
            autoFocus
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
            }}
          />
          <p className="mt-2 text-xs text-ink-muted">{t("rename_hint")}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRenaming(false)}>
              {t("act_cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={busy || !renameVal.trim()}
              onClick={submitRename}
            >
              {t("act_confirm")}
            </Button>
          </div>
        </Modal>
      )}

      {sourceOpen && (
        <Modal
          title={`${t("source_title")} · ${skill.name}`}
          onClose={() => setSourceOpen(false)}
          size="lg"
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div
                className={cn(
                  "flex flex-col gap-2 rounded-bubble px-4 py-3 sm:flex-row sm:items-center",
                  skill.gitUrl ? "bg-mint-light" : "bg-stone-100"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-ink-secondary">
                    {t("source_current")}
                  </p>
                  {skill.gitUrl ? (
                    <p className="mt-0.5 truncate font-mono text-xs text-ink-body">
                      {skill.gitUrl.replace(/\.git$/i, "")}
                      {skill.sourceSubdir ? ` · ${skill.sourceSubdir}` : ""}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {t("source_none")}
                    </p>
                  )}
                </div>
                {skill.gitUrl && (
                  <a
                    href={skill.gitUrl.replace(/\.git$/i, "")}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-xs font-bold text-mint-active underline-offset-2 hover:underline"
                  >
                    {t("source_view_repo")} ↗
                  </a>
                )}
              </div>

              <fieldset className="space-y-3">
                <legend className="text-base font-extrabold text-ink-header">
                  {t("source_question")}
                </legend>
                <div
                  className="grid gap-2 sm:grid-cols-3"
                  role="radiogroup"
                  aria-label={t("source_question")}
                >
                  <SourceModeCard
                    selected={sourceMode === "search"}
                    title={t("source_mode_search")}
                    description={t("source_mode_search_desc")}
                    onSelect={() => chooseSourceMode("search")}
                  />
                  <SourceModeCard
                    selected={sourceMode === "manual"}
                    title={t("source_mode_manual")}
                    description={t("source_mode_manual_desc")}
                    onSelect={() => chooseSourceMode("manual")}
                  />
                  <SourceModeCard
                    selected={sourceMode === "none"}
                    title={t("source_mode_none")}
                    description={t("source_mode_none_desc")}
                    onSelect={() => chooseSourceMode("none")}
                  />
                </div>
              </fieldset>

              {sourceMode === "search" && (
                <div className="rounded-bubble bg-white/55 p-4">
                  <h3 className="font-extrabold text-ink-header">
                    {t("source_search_results")}
                  </h3>
                  {guessing && (
                    <p className="mt-2 text-sm text-ink-muted">
                      {t("source_guessing")}
                    </p>
                  )}
                  {!guessing && candidates !== null && candidates.length === 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <p className="text-sm text-ink-muted">
                        {t("source_guess_none")}
                      </p>
                      <button
                        type="button"
                        onClick={() => void guessSource()}
                        className="text-xs font-bold text-mint-active underline-offset-2 hover:underline"
                      >
                        {t("source_retry")}
                      </button>
                    </div>
                  )}
                  {!guessing && candidates !== null && candidates.length > 0 && (
                    <div
                      className="mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto pr-1"
                      role="radiogroup"
                      aria-label={t("source_search_results")}
                    >
                      {candidates.map((c) => (
                        <div
                          key={c.id}
                          className={cn(
                            "flex items-center gap-3 rounded-bubble border-2 px-3 py-3 transition-colors",
                            picked === c.id
                              ? "border-mint bg-mint-light"
                              : "border-line/30 bg-content hover:border-mint/60"
                          )}
                        >
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                            <input
                              type="radio"
                              name={`source-${skill.contentHash}`}
                              className="h-5 w-5 shrink-0 accent-[#1bb7a7]"
                              checked={picked === c.id}
                              onChange={() => pickCandidate(c)}
                            />
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="font-extrabold text-ink-header">
                                  {c.name}
                                </span>
                                {c.installs > 0 && (
                                  <span className="text-xs text-ink-muted">
                                    {c.installs.toLocaleString()} installs
                                  </span>
                                )}
                              </span>
                              <span className="mt-0.5 block truncate font-mono text-xs text-ink-muted">
                                {c.source}
                                {c.subpath ? ` · ${c.subpath}` : ""}
                              </span>
                            </span>
                          </label>
                          <a
                            href={c.gitUrl.replace(/\.git$/i, "")}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 rounded-pill border border-line/40 bg-white px-3 py-1.5 text-xs font-bold text-mint-active transition-colors hover:border-mint"
                          >
                            {t("source_view_repo")} ↗
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {sourceMode === "manual" && (
                <div className="flex flex-col gap-3 rounded-bubble bg-white/55 p-4">
                  <label className="flex flex-col gap-1.5 text-sm font-bold text-ink-body">
                    {t("source_repo_label")}
                    <input
                      className="input w-full font-mono text-sm"
                      autoFocus
                      value={sourceUrl}
                      placeholder={t("source_repo_ph")}
                      onChange={(e) => {
                        setSourceUrl(e.target.value);
                        setPicked(null);
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-bold text-ink-body">
                    {t("source_subdir_label")}
                    <input
                      className="input w-full font-mono text-sm"
                      value={sourceSubdir}
                      placeholder={t("source_subdir_ph")}
                      onChange={(e) => {
                        setSourceSubdir(e.target.value);
                        setPicked(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && canLinkSource) submitSource();
                      }}
                    />
                  </label>
                  <p className="text-xs leading-relaxed text-ink-muted">
                    {t("source_subdir_hint")}
                  </p>
                </div>
              )}

              {sourceMode === "none" && (
                <div className="rounded-bubble bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-700">
                  <strong>{t("source_mode_none")}</strong>
                  <p className="mt-1">{t("source_none_explain")}</p>
                </div>
              )}
            </div>

            {canLinkSource && (
              <div className="rounded-bubble bg-amber-50 px-4 py-3">
                <p className="text-xs font-bold text-amber-700">
                  {t("source_pending")}
                </p>
                <p className="mt-0.5 truncate font-mono text-xs text-ink-body">
                  {sourceUrl.replace(/\.git$/i, "")}
                  {sourceSubdir ? ` · ${sourceSubdir}` : ""}
                </p>
              </div>
            )}

            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line/20 pt-4">
              <Button variant="ghost" onClick={() => setSourceOpen(false)}>
                {t("act_cancel")}
              </Button>
              {sourceMode === "none" ? (
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={disconnectSource}
                >
                  {busy ? t("source_disconnect_busy") : t("source_disconnect_confirm")}
                </Button>
              ) : sourceMode !== null ? (
                <Button
                  variant="primary"
                  disabled={busy || !canLinkSource}
                  onClick={submitSource}
                >
                  {busy
                    ? t("source_verify_busy")
                    : skill.gitUrl
                      ? t("source_verify_relink")
                      : t("source_verify_link")}
                </Button>
              ) : null}
            </div>
          </div>
        </Modal>
      )}

      {tagEditorOrigin && (
        <TagEditorModal
          hash={skill.contentHash}
          name={skill.name}
          tags={skill.tags}
          onSaved={() => onChanged()}
          onClose={() => {
            const returnToDetail = tagEditorOrigin === "detail";
            setTagEditorOrigin(null);
            if (returnToDetail) setShowDetail(true);
          }}
        />
      )}

      {confirm === "remove" && (
        <ConfirmDialog
          title={`${t("confirm_remove_title")} · ${skill.name}`}
          body={t("confirm_remove_body")}
          confirmLabel={t("act_remove_lib")}
          danger={false}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            run(
              { action: "removeFromLibrary", hash: skill.contentHash },
              t("act_remove_lib")
            );
          }}
        />
      )}
      {confirm === "update" && (
        <ConfirmDialog
          title={`⬆ ${t("upd_update")} · ${skill.name}`}
          body={t("upd_overwrite_local_body")}
          confirmLabel={t("upd_update")}
          danger={false}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            run(
              { action: "updateSkill", hash: skill.contentHash },
              t("upd_done")
            );
          }}
        />
      )}
      {confirm === "trash" && (
        <ConfirmDialog
          title={`${t("confirm_trash_title")} · ${skill.name}`}
          body={t("confirm_trash_body")}
          confirmLabel={t("act_move_trash")}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            run({ action: "trash", hash: skill.contentHash }, t("trash_moved"));
          }}
        />
      )}
      {showDetail && (
        <SkillDetailModal
          hash={skill.contentHash}
          skill={skill}
          update={update}
          checkingUpdates={checkingUpdates}
          onManageTags={
            !bundled
              ? () => {
                  setShowDetail(false);
                  setTagEditorOrigin("detail");
                }
              : undefined
          }
          onManageSource={
            !bundled
              ? () => {
                  setShowDetail(false);
                  openSource();
                }
              : undefined
          }
          onCheckUpdates={onCheckUpdates}
          onUpdate={
            update?.hasUpdate
              ? () => {
                  setShowDetail(false);
                  if (skill.localChanged) setConfirm("update");
                  else
                    void run(
                      { action: "updateSkill", hash: skill.contentHash },
                      t("upd_done")
                    );
                }
              : undefined
          }
          onSync={
            skill.localChanged
              ? () => {
                  setShowDetail(false);
                  void run(
                    { action: "syncLocalChange", hash: skill.contentHash },
                    t("sync_local_done")
                  );
                }
              : undefined
          }
          onTrash={
            !bundled
              ? () => {
                  setShowDetail(false);
                  setConfirm("trash");
                }
              : undefined
          }
          onClose={() => setShowDetail(false)}
        />
      )}
    </div>
  );
}

function SourceModeCard({
  selected,
  title,
  description,
  onSelect,
}: {
  selected: boolean;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-28 flex-col items-start rounded-bubble border-2 px-4 py-3 text-left transition-[background-color,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focusYellow/30",
        selected
          ? "border-mint-active bg-mint-light shadow-soft"
          : "border-line/35 bg-white/60 hover:border-mint hover:bg-white"
      )}
    >
      <span className="flex w-full items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
            selected
              ? "border-mint-active bg-mint"
              : "border-line-input bg-white"
          )}
        >
          {selected && <span className="h-2 w-2 rounded-full bg-white" />}
        </span>
        <span className="font-extrabold text-ink-header">{title}</span>
      </span>
      <span className="mt-2 text-xs leading-relaxed text-ink-muted">
        {description}
      </span>
    </button>
  );
}

function ActionMenu({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Native event type — this listener sits on document, not on a React node.
    const onDown = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className="absolute right-0 top-full z-30 mt-1 w-44 rounded-bubble border-2 border-line/40 bg-content p-1 shadow-feature"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function MenuItem({
  children,
  danger,
  onClick,
}: {
  children: ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "w-full rounded-[10px] px-3 py-2 text-left text-xs font-bold transition-colors",
        danger
          ? "text-status-error hover:bg-status-error/10"
          : "text-ink-body hover:bg-mint-light hover:text-mint-active"
      )}
    >
      {children}
    </button>
  );
}

const PRESETS: Record<"en" | "zh", string[]> = {
  en: [
    "frontend",
    "backend",
    "UI",
    "DevOps",
    "data",
    "AI",
    "coding",
    "writing",
    "office",
    "research",
    "planning",
    "daily",
    "experiment",
  ],
  zh: [
    "前端",
    "后端",
    "UI",
    "DevOps",
    "数据",
    "AI",
    "编程",
    "写作",
    "办公",
    "研究",
    "规划",
    "日常",
    "实验",
  ],
};

interface TagUniverse {
  tags: { tag: string }[];
  order: string[];
}

/** Inline tag summary. Editing happens in a body-level modal, never inside a row. */
function CompactTagBar({
  tags,
  onOpen,
}: {
  tags: string[];
  onOpen: () => void;
}) {
  const { t } = useLang();
  const visible = tags.slice(0, 3);
  const hidden = tags.length - visible.length;

  return (
    <button
      type="button"
      className="flex max-w-[180px] shrink-0 items-center gap-1 overflow-hidden rounded-pill outline-none focus-visible:ring-4 focus-visible:ring-focusYellow/30"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={t("tag_edit")}
    >
      {visible.map((tg) => (
        <span key={tg} className="badge shrink-0 bg-mint-light text-mint-active">
          #{tg}
        </span>
      ))}
      {hidden > 0 && (
        <span className="badge shrink-0 border border-dashed border-line/60 text-ink-secondary">
          +{hidden}
        </span>
      )}
      {visible.length < 3 && (
        <span className="badge shrink-0 border border-dashed border-line/60 text-ink-secondary transition-colors hover:bg-mint-light">
          ＋
        </span>
      )}
    </button>
  );
}

function TagEditorModal({
  hash,
  name,
  tags,
  onSaved,
  onClose,
}: {
  hash: string;
  name: string;
  tags: string[];
  onSaved: () => void | Promise<unknown>;
  onClose: () => void;
}) {
  const { t, lang } = useLang();
  const toast = useToast();
  const [draft, setDraft] = useState(tags);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: universe } = useSWR<TagUniverse>("/api/tags", fetcher, swrOpts);
  const known = orderTagNames(
    (universe?.tags ?? []).map((u) => u.tag),
    universe?.order ?? []
  );
  const pool = [...new Set([...(known.length ? known : PRESETS[lang]), ...draft])];

  function toggle(tag: string) {
    setDraft((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]
    );
  }

  function addCustom() {
    const tag = custom.trim();
    if (!tag) return;
    setDraft((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setCustom("");
  }

  async function save() {
    setBusy(true);
    try {
      await apiPost("/api/skills/action", { action: "setTags", hash, tags: draft });
      toast(t("tag_saved"), "success");
      await onSaved();
      onClose();
    } catch (e) {
      toast((e as Error).message || t("toast_error"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`${t("tag_edit")} · ${name}`} onClose={onClose} size="md">
      <div className="flex min-h-0 flex-col gap-4">
        <p className="text-sm leading-relaxed text-ink-muted">
          {t("tag_edit_hint")}
        </p>

        <div className="flex max-h-64 flex-wrap content-start gap-2 overflow-y-auto rounded-bubble bg-white/55 p-3">
          {pool.map((tag) => {
            const selected = draft.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                disabled={busy}
                onClick={() => toggle(tag)}
                className={cn(
                  "rounded-pill border-2 px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-50",
                  selected
                    ? "border-mint-active bg-mint text-white"
                    : "border-line/40 bg-content text-ink-body hover:border-mint hover:bg-mint-light"
                )}
                aria-pressed={selected}
              >
                {selected ? "✓ " : ""}#{tag}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2">
          <input
            className="input min-w-0 flex-1 text-sm"
            value={custom}
            placeholder={t("tag_custom_ph")}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addCustom();
            }}
          />
          <Button
            variant="default"
            disabled={busy || !custom.trim()}
            onClick={addCustom}
          >
            {t("tag_add")}
          </Button>
        </div>

        <div className="flex justify-end gap-2 border-t border-line/20 pt-4">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t("act_cancel")}
          </Button>
          <Button variant="primary" disabled={busy} onClick={save}>
            {busy ? t("upd_checking") : t("act_confirm")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
