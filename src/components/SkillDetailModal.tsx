"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import cn from "classnames";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetcher, swrOpts } from "@/lib/client";
import { Modal } from "./Modal";
import { Button, Spinner, ProvenanceBadge } from "./ui";
import { useLang } from "./LangProvider";
import { useToast } from "./Toast";
import type { Provenance, SkillRow } from "@/lib/types";

interface Detail {
  name: string;
  description: string;
  provenance: Provenance;
  path: string | null;
  tags: string[];
  readme: string | null;
  readmeFile: string | null;
  files: { rel: string; size: number }[];
}

/**
 * Strip a leading YAML frontmatter block. The meta it carries (name,
 * description) is already shown in the sidebar, so the rendered reading view
 * starts at the real content; the 原文 view keeps the full raw file.
 */
function stripFrontmatter(md: string): string {
  const m = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? md.slice(m[0].length) : md;
}

type View = "rendered" | "raw";

/**
 * Read-only skill preview, laid out as a reading surface: one large scrollable
 * markdown pane (the point of opening the dialog is to READ the skill), with
 * meta + file list in a sidebar instead of stacked scroll traps.
 */
export function SkillDetailModal({
  hash,
  skill,
  update,
  checkingUpdates = false,
  onManageTags,
  onManageSource,
  onCheckUpdates,
  onUpdate,
  onSync,
  onTrash,
  onClose,
}: {
  hash: string;
  skill?: SkillRow;
  update?: {
    hasUpdate: boolean;
    source: string | null;
    status: "update" | "current" | "no-source" | "error";
    error?: string;
  };
  checkingUpdates?: boolean;
  onManageTags?: () => void;
  onManageSource?: () => void;
  onCheckUpdates?: () => void;
  onUpdate?: () => void;
  onSync?: () => void;
  onTrash?: () => void;
  onClose: () => void;
}) {
  const { t } = useLang();
  const toast = useToast();
  const [view, setView] = useState<View>("rendered");
  const { data, isLoading } = useSWR<Detail>(
    `/api/skills/detail?hash=${encodeURIComponent(hash)}`,
    fetcher,
    swrOpts
  );

  const body = useMemo(
    () => (data?.readme ? stripFrontmatter(data.readme) : ""),
    [data?.readme]
  );
  const hasManagement = Boolean(
    skill &&
      (onManageTags ||
        onManageSource ||
        onCheckUpdates ||
        onUpdate ||
        onSync)
  );

  function copyPath(p: string) {
    navigator.clipboard
      .writeText(p)
      .then(() => toast(t("act_copied"), "success"))
      .catch(() => toast(t("toast_error"), "error"));
  }

  return (
    <Modal title={data ? data.name : "…"} onClose={onClose} size="full">
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <div className="flex h-[72vh] min-h-0 flex-col gap-5 md:flex-row">
          {/* Reading pane — THE scroll region. */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
              <span className="truncate font-mono text-xs font-bold text-ink-secondary">
                {data.readmeFile ?? "SKILL.md"}
              </span>
              {data.readme && (
                <div className="flex rounded-pill border-2 border-line/40 bg-content p-0.5">
                  {(
                    [
                      { key: "rendered", label: t("detail_rendered") },
                      { key: "raw", label: t("detail_raw") },
                    ] as const
                  ).map((v) => (
                    <button
                      key={v.key}
                      onClick={() => setView(v.key)}
                      className={cn(
                        "rounded-pill px-3 py-0.5 text-xs font-bold transition-colors",
                        view === v.key
                          ? "bg-mint text-white"
                          : "text-ink-secondary hover:text-ink-body"
                      )}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-bubble border border-line/30 bg-white/70">
              {!data.readme ? (
                <p className="p-6 text-sm text-ink-disabled">
                  {t("lbl_no_preview")}
                </p>
              ) : view === "rendered" ? (
                <div className="md-body max-w-[72ch] px-6 py-5">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {body}
                  </ReactMarkdown>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap px-6 py-5 font-mono text-[13px] leading-relaxed text-ink-body">
                  {data.readme}
                </pre>
              )}
            </div>
          </div>

          {/* Meta sidebar — scrolls as one unit. */}
          <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto md:w-72 md:border-l-2 md:border-dashed md:border-line/30 md:pl-5">
            <div className="flex flex-wrap items-center gap-1.5">
              <ProvenanceBadge provenance={data.provenance} />
              {skill && skill.provenance !== "bundled" && (
                <span
                  className={cn(
                    "badge",
                    skill.parked
                      ? "bg-stone-100 text-ink-muted"
                      : "bg-mint text-white"
                  )}
                >
                  {skill.parked ? t("lbl_idle") : t("lbl_active")}
                </span>
              )}
            </div>

            {data.description && <ClampedText text={data.description} />}

            {!hasManagement && skill && skill.source && (
              <MetaBlock label={t("detail_source")}>
                {skill.gitUrl ? (
                  <a
                    href={skill.gitUrl.replace(/\.git$/, "")}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all font-mono text-xs font-bold text-mint-active hover:underline"
                  >
                    {skill.source} ↗
                  </a>
                ) : skill.source ? (
                  <span className="break-all font-mono text-xs">
                    {skill.source}
                  </span>
                ) : (
                  <span className="text-xs text-ink-muted">
                    {t("source_none")}
                  </span>
                )}
              </MetaBlock>
            )}

            {!hasManagement && data.tags.length > 0 && (
              <MetaBlock label={t("lbl_tags")}>
                <div className="flex flex-wrap gap-1">
                  {data.tags.map((tg) => (
                    <span
                      key={tg}
                      className="badge bg-mint-light text-mint-active"
                    >
                      #{tg}
                    </span>
                  ))}
                </div>
              </MetaBlock>
            )}

            {hasManagement && skill && (
              <section className="shrink-0 overflow-hidden rounded-bubble border-2 border-line/35 bg-white/55">
                <div className="border-b border-line/25 bg-content/70 px-3 py-2.5">
                  <h3 className="text-sm font-extrabold text-ink-header">
                    {t("detail_manage")}
                  </h3>
                </div>

                {(skill.source || onManageSource) && (
                  <ManagementRow
                    label={t("detail_source")}
                    action={
                      onManageSource ? (
                        <PanelAction onClick={onManageSource}>
                          {skill.gitUrl ? t("source_relink") : t("source_link")}
                        </PanelAction>
                      ) : null
                    }
                  >
                    {skill.gitUrl ? (
                      <a
                        href={skill.gitUrl.replace(/\.git$/, "")}
                        target="_blank"
                        rel="noreferrer"
                        title={skill.source ?? skill.gitUrl}
                        className="block truncate font-mono text-xs font-bold text-mint-active underline-offset-2 hover:underline"
                      >
                        {skill.source ?? skill.gitUrl}
                      </a>
                    ) : skill.source ? (
                      <span className="block truncate font-mono text-xs text-ink-body">
                        {skill.source}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-muted">
                        {t("source_none")}
                      </span>
                    )}
                  </ManagementRow>
                )}

                {(data.tags.length > 0 || onManageTags) && (
                  <ManagementRow
                    label={t("lbl_tags")}
                    action={
                      onManageTags ? (
                        <PanelAction onClick={onManageTags}>
                          {t("tag_edit")}
                        </PanelAction>
                      ) : null
                    }
                  >
                    {data.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {data.tags.map((tg) => (
                          <span
                            key={tg}
                            className="badge bg-mint-light text-mint-active"
                          >
                            #{tg}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-ink-muted">
                        {t("tag_none")}
                      </span>
                    )}
                  </ManagementRow>
                )}

                {(onCheckUpdates || onUpdate) && (
                  <ManagementRow
                    label={t("detail_update_status")}
                    action={
                      update?.hasUpdate && onUpdate ? (
                        <PanelAction tone="primary" onClick={onUpdate}>
                          {t("upd_update")}
                        </PanelAction>
                      ) : update?.status === "no-source" && onManageSource ? (
                        <PanelAction onClick={onManageSource}>
                          {t("source_link")}
                        </PanelAction>
                      ) : onCheckUpdates ? (
                        <PanelAction
                          disabled={checkingUpdates}
                          onClick={onCheckUpdates}
                        >
                          {checkingUpdates
                            ? t("upd_checking")
                            : update
                              ? t("update_center_recheck")
                              : t("upd_check")}
                        </PanelAction>
                      ) : null
                    }
                  >
                    <UpdateStatus
                      checking={checkingUpdates}
                      update={update}
                    />
                  </ManagementRow>
                )}

                {skill.localChanged && onSync && (
                  <ManagementRow
                    label={t("update_center_local")}
                    action={
                      <PanelAction onClick={onSync}>
                        {t("sync_local_btn")}
                      </PanelAction>
                    }
                  >
                    <span className="inline-flex rounded-chip bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">
                      {t("sync_local_badge")}
                    </span>
                  </ManagementRow>
                )}
              </section>
            )}

            {data.path && (
              <MetaBlock label={t("lbl_path")}>
                <div className="flex items-start gap-1.5">
                  <span className="min-w-0 break-all font-mono text-[11px] leading-relaxed text-ink-muted">
                    {data.path}
                  </span>
                  <button
                    onClick={() => copyPath(data.path as string)}
                    title={t("act_copy")}
                    className="shrink-0 rounded-chip px-1.5 py-0.5 text-xs text-ink-secondary transition-colors hover:bg-line/20 hover:text-ink-body"
                  >
                    ⧉
                  </button>
                </div>
              </MetaBlock>
            )}

            {data.files.length > 0 && (
              <MetaBlock label={`${t("lbl_files")} (${data.files.length})`}>
                <ul className="flex flex-col">
                  {data.files.map((f) => (
                    <li
                      key={f.rel}
                      className="flex items-baseline justify-between gap-2 rounded-chip px-1.5 py-1 font-mono text-[11px] text-ink-body odd:bg-ink-header/[0.03]"
                    >
                      <span className="min-w-0 truncate" title={f.rel}>
                        {f.rel}
                      </span>
                      <span className="shrink-0 text-ink-muted">
                        {fmtSize(f.size)}
                      </span>
                    </li>
                  ))}
                </ul>
              </MetaBlock>
            )}

            {onTrash && (
              <Button variant="danger" className="mt-auto" onClick={onTrash}>
                {t("act_move_trash")}
              </Button>
            )}
          </aside>
        </div>
      )}
    </Modal>
  );
}

/**
 * Long skill descriptions (often the full trigger-phrase list) would push the
 * file list below the fold — clamp to a few lines, click to expand.
 */
function ClampedText({ text }: { text: string }) {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 160;
  return (
    <div className="flex flex-col items-start gap-1">
      <p
        className={cn(
          "text-sm leading-relaxed text-ink-body",
          !expanded && "line-clamp-4"
        )}
      >
        {text}
      </p>
      {long && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-bold text-mint-active hover:underline"
        >
          {expanded ? t("lbl_collapse") : t("lbl_expand")}
        </button>
      )}
    </div>
  );
}

function MetaBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">
        {label}
      </div>
      {children}
    </div>
  );
}

function ManagementRow({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-line/20 px-3 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-[11px] font-extrabold text-ink-secondary">
          {label}
        </div>
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function PanelAction({
  children,
  tone = "default",
  ...props
}: {
  children: React.ReactNode;
  tone?: "default" | "primary";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-8 max-w-[7.5rem] items-center justify-center rounded-pill border-2 px-3 py-1 text-center text-xs font-extrabold leading-tight transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focusYellow/30 disabled:cursor-not-allowed disabled:opacity-50",
        tone === "primary"
          ? "border-mint-active bg-mint text-white shadow-soft hover:-translate-y-px hover:bg-mint-hover"
          : "border-line/45 bg-content text-ink-body shadow-soft hover:-translate-y-px hover:border-mint hover:text-mint-active"
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function UpdateStatus({
  checking,
  update,
}: {
  checking: boolean;
  update?: {
    hasUpdate: boolean;
    source: string | null;
    status: "update" | "current" | "no-source" | "error";
    error?: string;
  };
}) {
  const { t } = useLang();

  let label = t("detail_not_checked");
  let tone = "bg-stone-100 text-ink-muted";

  if (checking) {
    label = t("upd_checking");
  } else if (update?.hasUpdate) {
    label = t("upd_available");
    tone = "bg-amber-50 text-amber-700";
  } else if (update?.status === "error") {
    label = update.error || t("upd_check_error");
    tone = "bg-red-50 text-status-error-active";
  } else if (update?.status === "no-source") {
    label = t("update_center_no_source");
  } else if (update?.status === "current") {
    label = t("upd_none");
    tone = "bg-mint-light text-mint-active";
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-full rounded-chip px-2 py-1 text-xs font-bold leading-snug",
        tone
      )}
      title={label}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
