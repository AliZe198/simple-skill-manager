"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher, swrOpts, apiPost } from "@/lib/client";
import { useLang } from "./LangProvider";
import { useToast } from "./Toast";
import { Button } from "./ui";
import { AgentLogo } from "./AgentLogo";
import type { DetectedAgent } from "@/lib/types";

interface DupCopy {
  hash: string;
  dir: string;
  path: string;
  fileCount: number;
  sizeKb: number;
  createdAt: number;
  agentIds: string[];
}
interface DupGroup {
  name: string;
  copies: DupCopy[];
}

/**
 * Surfaces same-named, different-content library copies and lets the user keep
 * one — re-pointing every agent on the others to the kept version, then
 * deleting them. Collapsed to nothing when there are no duplicates.
 */
export function DedupPanel({
  agents,
  onChanged,
}: {
  agents: DetectedAgent[];
  onChanged: () => void;
}) {
  const { t } = useLang();
  const { data, mutate, isLoading } = useSWR<DupGroup[]>(
    "/api/skills/dups",
    fetcher,
    swrOpts
  );
  const [open, setOpen] = useState(false);
  const groups = data ?? [];

  if (isLoading || groups.length === 0) return null;

  return (
    <div className="rounded-card border-2 border-amber-200 bg-amber-50/60">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-[18px] px-4 py-2.5 text-sm font-bold text-amber-800 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focusYellow"
      >
        <span>
          ⚠️ {t("dedup_title")}（{groups.length}）
        </span>
        <span className="opacity-60">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 px-4 pb-4">
          <p className="text-xs text-amber-700">{t("dedup_hint")}</p>
          {groups.map((g) => (
            <DupGroupRow
              key={g.name}
              group={g}
              agents={agents}
              onMerged={() => {
                mutate();
                onChanged();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DupGroupRow({
  group,
  agents,
  onMerged,
}: {
  group: DupGroup;
  agents: DetectedAgent[];
  onMerged: () => void;
}) {
  const { t } = useLang();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // Default keep = first copy (duplicateGroups sorts most-complete first).
  const [keep, setKeep] = useState(group.copies[0]?.hash ?? "");

  const label = useMemo(
    () => new Map(agents.map((a) => [a.id, a.label] as const)),
    [agents]
  );

  async function reveal(hash: string) {
    try {
      await apiPost("/api/skills/action", { action: "reveal", hash });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function merge() {
    const dropHashes = group.copies.map((c) => c.hash).filter((h) => h !== keep);
    if (!dropHashes.length) return;
    setBusy(true);
    try {
      await apiPost("/api/skills/action", {
        action: "mergeDuplicates",
        keepHash: keep,
        dropHashes,
      });
      toast(`${t("dedup_merged")}: ${group.name}`, "success");
      onMerged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  // "Fullest" is only a file-count hint, and file count is a poor proxy for
  // "better": an older version that still ships a dropped extra file outranks
  // the current one. Surface the adopted date and flag the newest copy so the
  // choice isn't made on file count alone.
  const newestHash = group.copies.reduce((a, b) =>
    a.createdAt >= b.createdAt ? a : b
  ).hash;

  return (
    <div className="rounded-bubble border border-amber-200 bg-content/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-extrabold text-ink-header">
          {group.name}
        </span>
        <Button variant="primary" disabled={busy} onClick={merge}>
          {busy ? "…" : `⤵ ${t("dedup_merge")}`}
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {group.copies.map((c, i) => (
          <div
            key={c.hash}
            className={
              "rounded-bubble px-2 py-1.5 " +
              (keep === c.hash ? "bg-mint-light" : "hover:bg-stone-50")
            }
          >
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="radio"
                name={`keep-${group.name}`}
                checked={keep === c.hash}
                onChange={() => setKeep(c.hash)}
                className="h-3.5 w-3.5 accent-[#19c8b9]"
              />
              <span className="font-mono text-ink-secondary">#{c.hash.slice(0, 8)}</span>
              <span className="text-ink-body">
                {c.fileCount} {t("dedup_files")} · {c.sizeKb}KB
              </span>
              <span className="text-ink-muted">
                {new Date(c.createdAt).toLocaleDateString()}
              </span>
              {i === 0 && (
                <span className="rounded-pill bg-mint/15 px-1.5 text-[10px] font-bold text-mint-active">
                  {t("dedup_fullest")}
                </span>
              )}
              {c.hash === newestHash && (
                <span className="rounded-pill bg-amber-100 px-1.5 text-[10px] font-bold text-amber-700">
                  {t("dedup_newest")}
                </span>
              )}
              <span className="ml-auto flex items-center gap-1">
                {c.agentIds.length === 0 ? (
                  <span className="text-ink-muted">{t("lbl_idle")}</span>
                ) : (
                  c.agentIds.map((id) => (
                    <AgentLogo key={id} agentId={id} label={label.get(id) ?? id} size="sm" />
                  ))
                )}
              </span>
            </label>
            <div className="mt-1 flex items-center gap-2 pl-6">
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-ink-muted" title={c.path}>
                {c.path}
              </span>
              <button
                onClick={() => reveal(c.hash)}
                className="shrink-0 rounded-pill border border-line/50 px-2 py-0.5 text-[11px] font-bold text-ink-secondary hover:border-mint hover:bg-mint-light hover:text-mint-active"
              >
                📂 {t("dedup_open_finder")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
