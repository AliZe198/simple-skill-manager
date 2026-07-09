"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import cn from "classnames";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetcher, swrOpts } from "@/lib/client";
import { Modal } from "./Modal";
import { Spinner, ProvenanceBadge } from "./ui";
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
  onClose,
}: {
  hash: string;
  skill?: SkillRow;
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

            {skill?.source && (
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
                ) : (
                  <span className="break-all font-mono text-xs">
                    {skill.source}
                  </span>
                )}
              </MetaBlock>
            )}

            {data.tags.length > 0 && (
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

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
