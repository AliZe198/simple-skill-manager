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

/** Compact row for an imported skill in My Library. */
export function SkillListRow({
  skill,
  agents,
  onChanged,
  update,
}: {
  skill: SkillRow;
  agents: DetectedAgent[];
  onChanged: () => void;
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
      onChanged();
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
    setSourceOpen(true);
  }

  async function submitSource() {
    if (!sourceUrl.trim()) return;
    setBusy(true);
    try {
      await apiPost("/api/skills/action", {
        action: "linkSource",
        hash: skill.contentHash,
        gitUrl: sourceUrl.trim(),
        sourceSubdir: sourceSubdir.trim(),
      });
      setSourceOpen(false);
      toast(t("source_linked"), "success");
      onChanged();
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

  return (
    <div
      onClick={onRowClick}
      className={cn(
        "group relative flex min-h-[52px] cursor-pointer flex-wrap items-center gap-3 rounded-bubble border-2 bg-content/60 px-3 py-2 transition-colors hover:border-line/60 hover:bg-content sm:flex-nowrap",
        bundled ? "border-l-4 border-l-amber-400" : "border-l-4 border-l-mint"
      )}
    >
      {/* Main info */}
      <div className="flex min-w-0 w-full flex-col gap-0.5 sm:w-auto sm:flex-1">
        <div className="flex min-w-0 items-center gap-2">
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
      {!bundled && <CompactTagBar hash={skill.contentHash} tags={skill.tags} onChanged={onChanged} />}

      {/* Agent toggles / belongs-to */}
      <div className="ml-auto flex max-w-full shrink items-center gap-1.5 overflow-x-auto">
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
                  "relative rounded-full transition-all disabled:opacity-50",
                  active
                    ? "ring-2 ring-mint ring-offset-1"
                    : "opacity-40 grayscale hover:opacity-80 hover:grayscale-0"
                )}
              >
                <AgentLogo agentId={a.id} label={a.label} size="sm" />
                {active && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-mint text-[8px] font-bold text-white ring-1 ring-white">
                    ✓
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* More actions */}
      <div className="relative shrink-0">
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
        <Modal title={t("source_title")} onClose={() => setSourceOpen(false)}>
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-bold text-ink-body">
              {t("source_repo_label")}
              <input
                className="input w-full font-mono text-sm"
                autoFocus
                value={sourceUrl}
                placeholder={t("source_repo_ph")}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-bold text-ink-body">
              {t("source_subdir_label")}
              <input
                className="input w-full font-mono text-sm"
                value={sourceSubdir}
                placeholder={t("source_subdir_ph")}
                onChange={(e) => setSourceSubdir(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitSource();
                }}
              />
            </label>
            <p className="text-xs leading-relaxed text-ink-muted">
              {t("source_subdir_hint")}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSourceOpen(false)}>
                {t("act_cancel")}
              </Button>
              <Button
                variant="primary"
                disabled={busy || !sourceUrl.trim()}
                onClick={submitSource}
              >
                {busy ? t("upd_checking") : t("act_confirm")}
              </Button>
            </div>
          </div>
        </Modal>
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

/** Inline tag chips + a compact add/remove popover. */
function CompactTagBar({
  hash,
  tags,
  onChanged,
}: {
  hash: string;
  tags: string[];
  onChanged: () => void;
}) {
  const { t, lang } = useLang();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  const { data: universe } = useSWR<TagUniverse>(
    open ? "/api/tags" : null,
    fetcher,
    swrOpts
  );
  const known = orderTagNames(
    (universe?.tags ?? []).map((u) => u.tag),
    universe?.order ?? []
  );
  const pool = universe ? (known.length ? known : PRESETS[lang]) : [];
  const suggestions = pool.filter((p) => !tags.includes(p));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: globalThis.MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function save(next: string[]) {
    setBusy(true);
    try {
      await apiPost("/api/skills/action", { action: "setTags", hash, tags: next });
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  function add(tag: string) {
    const tg = tag.trim();
    if (!tg || tags.includes(tg)) return;
    save([...tags, tg]);
    setCustom("");
  }

  const visible = tags.slice(0, 3);
  const hidden = tags.length - visible.length;

  return (
    <div
      ref={popRef}
      className="relative shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex max-w-[180px] items-center gap-1 overflow-hidden">
        {visible.map((tg) => (
          <span
            key={tg}
            className="badge shrink-0 bg-mint-light text-mint-active"
          >
            #{tg}
            <button
              disabled={busy}
              onClick={() => save(tags.filter((x) => x !== tg))}
              className="ml-0.5 opacity-60 hover:opacity-100"
              aria-label={`remove ${tg}`}
            >
              ×
            </button>
          </span>
        ))}
        {hidden > 0 && (
          <button
            disabled={busy}
            onClick={() => setOpen((v) => !v)}
            className="badge shrink-0 border border-dashed border-line/60 text-ink-secondary hover:bg-mint-light"
          >
            +{hidden}
          </button>
        )}
        {visible.length < 3 && (
          <button
            disabled={busy}
            onClick={() => setOpen((v) => !v)}
            className="badge shrink-0 border border-dashed border-line/60 text-ink-secondary hover:bg-mint-light"
          >
            ＋
          </button>
        )}
      </div>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-bubble border-2 border-line/40 bg-content p-2 shadow-feature">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold text-ink-secondary">{t("tag_add")}</span>
            <button
              onClick={() => setOpen(false)}
              className="text-ink-disabled hover:text-ink-body"
              aria-label="close"
            >
              ×
            </button>
          </div>
          <div className="mb-2 flex flex-wrap gap-1">
            {suggestions.map((p) => (
              <button
                key={p}
                disabled={busy}
                onClick={() => add(p)}
                className="badge bg-white/70 text-ink-body hover:bg-mint-light"
              >
                {p}
              </button>
            ))}
          </div>
          <input
            className="input w-full text-xs"
            placeholder={t("tag_custom_ph")}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add(custom);
            }}
          />
        </div>
      )}
    </div>
  );
}
