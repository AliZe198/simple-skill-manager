"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { useSkills, useAgents, apiPost } from "@/lib/client";
import { useLang } from "@/components/LangProvider";
import { useToast } from "@/components/Toast";
import {
  Button,
  EmptyState,
  ErrorState,
  Spinner,
} from "@/components/ui";
import { DiscoverListRow } from "@/components/DiscoverListRow";
import type { DetectedAgent, SkillRow } from "@/lib/types";

type Tab = "fresh" | "bundled";

export default function DiscoverPage() {
  const { t } = useLang();
  const toast = useToast();
  const { data: skills, error, isLoading, mutate } = useSkills();
  const { data: agents } = useAgents();
  const [tab, setTab] = useState<Tab>("fresh");
  const [q, setQ] = useState("");
  const [bundledAgent, setBundledAgent] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [openSuites, setOpenSuites] = useState<Set<string>>(new Set());

  const unimported = useMemo(
    () => (skills ?? []).filter((r) => !r.adopted),
    [skills]
  );
  const fresh = unimported.filter((r) => r.provenance !== "bundled");
  const bundled = unimported.filter((r) => r.provenance === "bundled");

  // Which agent bundles each built-in skill (the agentId of a bundled
  // occurrence) → lets us filter "show only Hermes built-ins" etc.
  const bundlingAgentIds = (r: SkillRow): string[] => [
    ...new Set(r.occurrences.filter((o) => o.bundled).map((o) => o.agentId)),
  ];
  const bundledAgentCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of bundled)
      for (const id of bundlingAgentIds(r)) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [bundled]);

  const list = useMemo(() => {
    let rows = tab === "fresh" ? fresh : bundled;
    if (tab === "bundled" && bundledAgent !== "all")
      rows = rows.filter((r) => bundlingAgentIds(r).includes(bundledAgent));
    if (q.trim()) {
      const s = q.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(s) ||
          r.description.toLowerCase().includes(s)
      );
    }
    return rows;
  }, [tab, fresh, bundled, q, bundledAgent]);

  // Suite grouping (fresh tab): skills installed together from one repo
  // (row.source from the skills-CLI lock file) collapse into one section —
  // e.g. heygen-com/hyperframes is 19 skills, not 19 loose rows. A source with
  // a single skill stays a loose row; grouping it would just add chrome.
  const { suites, loose } = useMemo(() => {
    if (tab !== "fresh") return { suites: [], loose: list };
    const bySource = new Map<string, SkillRow[]>();
    const loose: SkillRow[] = [];
    for (const r of list) {
      if (!r.source) {
        loose.push(r);
        continue;
      }
      const arr = bySource.get(r.source) ?? [];
      arr.push(r);
      bySource.set(r.source, arr);
    }
    const suites: { source: string; rows: SkillRow[] }[] = [];
    for (const [source, rows] of bySource) {
      if (rows.length >= 2) suites.push({ source, rows });
      else loose.push(...rows);
    }
    suites.sort(
      (a, b) => b.rows.length - a.rows.length || a.source.localeCompare(b.source)
    );
    return { suites, loose };
  }, [tab, list]);

  function toggleSuiteOpen(source: string) {
    setOpenSuites((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }

  function toggleSuiteSelected(rows: SkillRow[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = rows.every((r) => next.has(r.contentHash));
      for (const r of rows)
        if (allSelected) next.delete(r.contentHash);
        else next.add(r.contentHash);
      return next;
    });
  }

  function toggle(hash: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = list.every((r) => next.has(r.contentHash));
      for (const r of list)
        if (allSelected) next.delete(r.contentHash);
        else next.add(r.contentHash);
      return next;
    });
  }

  async function importHashes(hashes: string[], label: string) {
    if (!hashes.length) return;
    setBusy(true);
    try {
      const res = await apiPost<{ imported: number; failed: unknown[] }>(
        "/api/skills/action",
        { action: "importMany", hashes }
      );
      toast(`${label}: ${res.imported} ✓`, "success");
      setSelected(new Set());
      mutate();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: "fresh", label: t("lbl_not_imported"), n: fresh.length },
    { key: "bundled", label: t("builtin_tab"), n: bundled.length },
  ];

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-extrabold text-ink-header">
          🔍 {t("nav_discover")}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-secondary">
          {t("discover_intro")}
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={
                "rounded-pill border-2 px-4 py-1.5 text-sm font-bold transition-colors " +
                (tab === tb.key
                  ? "border-mint-active bg-mint text-white"
                  : "border-line/40 bg-content text-ink-secondary hover:bg-mint-light")
              }
            >
              {tb.label} <span className="opacity-70">{tb.n}</span>
            </button>
          ))}
        </div>
        <input
          className="input w-64"
          placeholder={t("lbl_search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* Built-in tab: filter by which agent bundles the skill. */}
      {tab === "bundled" && bundledAgentCounts.size > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-ink-secondary">
            {t("lbl_builtin_of")}:
          </span>
          {[
            { id: "all", label: t("lbl_all"), n: bundled.length },
            ...[...bundledAgentCounts.entries()].map(([id, n]) => ({
              id,
              label: agents?.find((a) => a.id === id)?.label ?? id,
              n,
            })),
          ].map((chip) => (
            <button
              key={chip.id}
              onClick={() => setBundledAgent(chip.id)}
              className={
                "rounded-pill border px-3 py-1 text-xs font-bold transition-colors " +
                (bundledAgent === chip.id
                  ? "border-mint-active bg-mint text-white"
                  : "border-line/40 bg-content text-ink-secondary hover:bg-mint-light")
              }
            >
              {chip.label} <span className="opacity-70">{chip.n}</span>
            </button>
          ))}
        </div>
      )}

      {/* Bulk action bar */}
      {list.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border-2 border-line/30 bg-content/60 px-4 py-2">
          <button
            onClick={selectAllVisible}
            className="text-sm font-bold text-ink-body hover:text-mint-active"
          >
            {list.every((r) => selected.has(r.contentHash)) ? "☑" : "☐"}{" "}
            {t("lbl_select_all")}
          </button>
          <span className="text-sm text-ink-secondary">
            {t("lbl_selected")} {selected.size}
          </span>
          <div className="ml-auto">
            <Button
              variant="primary"
              disabled={busy || selected.size === 0}
              onClick={() =>
                importHashes([...selected], t("act_import_selected"))
              }
            >
              {busy ? "…" : `${t("act_import_selected")} (${selected.size})`}
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <ErrorState message={(error as Error).message} onRetry={() => mutate()} />
      ) : isLoading ? (
        <Spinner />
      ) : (skills ?? []).length === 0 ? (
        <EmptyState text={t("lbl_discover_empty_machine")} />
      ) : unimported.length === 0 ? (
        <EmptyState text={t("lbl_no_discover")} />
      ) : list.length === 0 ? (
        <EmptyState text={t("lbl_no_skills")} />
      ) : (
        <>
          {suites.map(({ source, rows }) => (
            <SuiteSection
              key={source}
              source={source}
              rows={rows}
              agents={agents ?? []}
              open={openSuites.has(source)}
              selected={selected}
              busy={busy}
              onToggleOpen={() => toggleSuiteOpen(source)}
              onToggleAll={() => toggleSuiteSelected(rows)}
              onImportAll={() =>
                importHashes(
                  rows.map((r) => r.contentHash),
                  t("act_import_suite")
                )
              }
              onToggle={toggle}
              onImport={(hash) => importHashes([hash], t("act_import"))}
            />
          ))}
          {loose.length > 0 && (
            <>
              {suites.length > 0 && (
                <h2 className="text-sm font-extrabold text-ink-secondary">
                  {t("suite_loose_title")}{" "}
                  <span className="opacity-70">{loose.length}</span>
                </h2>
              )}
              <div className="flex flex-col gap-2">
                {loose.map((skill) => (
                  <DiscoverListRow
                    key={skill.contentHash}
                    skill={skill}
                    agents={agents ?? []}
                    selected={selected.has(skill.contentHash)}
                    busy={busy}
                    onToggle={() => toggle(skill.contentHash)}
                    onImport={() =>
                      importHashes([skill.contentHash], t("act_import"))
                    }
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function SuiteSection({
  source,
  rows,
  agents,
  open,
  selected,
  busy,
  onToggleOpen,
  onToggleAll,
  onImportAll,
  onToggle,
  onImport,
}: {
  source: string;
  rows: SkillRow[];
  agents: DetectedAgent[];
  open: boolean;
  selected: Set<string>;
  busy: boolean;
  onToggleOpen: () => void;
  onToggleAll: () => void;
  onImportAll: () => void;
  onToggle: (hash: string) => void;
  onImport: (hash: string) => void;
}) {
  const { t } = useLang();
  const allSelected = rows.every((r) => selected.has(r.contentHash));
  const nSelected = rows.filter((r) => selected.has(r.contentHash)).length;

  // Header toggles expand, except on its interactive controls.
  const onHeaderClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input, a, label")) return;
    onToggleOpen();
  };

  return (
    <section className="rounded-card border-2 border-line/40 bg-content/70">
      <div
        onClick={onHeaderClick}
        className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3"
      >
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          className="h-4 w-4 accent-[#19c8b9]"
          aria-label={`${t("suite_select_all")}: ${source}`}
        />
        <span className="text-lg">📦</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-base font-extrabold text-ink-header">
              {source}
            </span>
            <span className="rounded-pill border border-mint-active/40 bg-mint-light px-2 py-0.5 text-xs font-bold text-mint-active">
              {t("suite_badge")} · {rows.length}
            </span>
            {nSelected > 0 && !allSelected && (
              <span className="text-xs text-ink-muted">
                {t("lbl_selected")} {nSelected}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-ink-secondary">{t("suite_sub")}</p>
        </div>
        <Button variant="primary" disabled={busy} onClick={onImportAll}>
          {t("act_import_suite")} ({rows.length})
        </Button>
        <button
          onClick={onToggleOpen}
          className="text-sm font-bold text-ink-secondary hover:text-mint-active"
          aria-expanded={open}
          aria-label={source}
        >
          {open ? "▲" : "▼"}
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-2 border-t-2 border-dashed border-line/30 p-3 pl-5">
          {rows.map((skill) => (
            <DiscoverListRow
              key={skill.contentHash}
              skill={skill}
              agents={agents}
              selected={selected.has(skill.contentHash)}
              busy={busy}
              onToggle={() => onToggle(skill.contentHash)}
              onImport={() => onImport(skill.contentHash)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

