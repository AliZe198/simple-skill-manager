"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import cn from "classnames";
import { useSkills, useAgents, useTrash, fetcher, apiPost } from "@/lib/client";
import { useLang } from "@/components/LangProvider";
import { useToast } from "@/components/Toast";
import { SkillListRow, type UpdateHint } from "@/components/SkillListRow";
import { TrashPanel } from "@/components/TrashPanel";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DedupPanel } from "@/components/DedupPanel";
import { Button, EmptyState, ErrorState, Spinner } from "@/components/ui";
import type { DetectedAgent, SkillRow } from "@/lib/types";

type Status = "all" | "active" | "idle";
type Layout = "top" | "side";
type Zone = "mine" | "builtin" | "trash";
const UNCAT = "__uncat__";

export default function LibraryPage() {
  const { t } = useLang();
  const { data: skills, error, isLoading, mutate } = useSkills();
  const { data: agents } = useAgents();
  const { data: trash, mutate: mutateTrash } = useTrash();
  const [status, setStatus] = useState<Status>("all");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("all"); // "all" | UNCAT | tag
  const [layout, setLayout] = useState<Layout>("top");
  const [zone, setZone] = useState<Zone>("mine"); // 我的技能 vs Agent 内置
  const [openSuites, setOpenSuites] = useState<Set<string>>(new Set());
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const [updates, setUpdates] = useState<Map<string, UpdateHint> | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);

  async function checkUpdates() {
    setChecking(true);
    try {
      const list = await fetcher<
        ({ hash: string } & UpdateHint)[]
      >("/api/skills/updates");
      const map = new Map(list.map((u) => [u.hash, u]));
      setUpdates(map);
      const counts = {
        update: list.filter((u) => u.status === "update").length,
        current: list.filter((u) => u.status === "current").length,
        noSource: list.filter((u) => u.status === "no-source").length,
        error: list.filter((u) => u.status === "error").length,
      };
      const summary = t("upd_summary")
        .replace("{u}", String(counts.update))
        .replace("{c}", String(counts.current))
        .replace("{n}", String(counts.noSource))
        .replace("{e}", String(counts.error));
      toast(summary, counts.error ? "error" : "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem("ssm-lib-layout") as Layout | null;
    if (saved === "top" || saved === "side") setLayout(saved);
  }, []);
  const changeLayout = (l: Layout) => {
    setLayout(l);
    localStorage.setItem("ssm-lib-layout", l);
  };

  // My Library = imported skills, split into two zones: my own skills vs
  // agent-bundled (quarantined) skills. The active zone feeds the rest.
  const importedAll = useMemo(
    () => (skills ?? []).filter((r) => r.adopted),
    [skills]
  );
  const mineCount = useMemo(
    () => importedAll.filter((r) => r.provenance !== "bundled").length,
    [importedAll]
  );
  const builtinCount = importedAll.length - mineCount;
  const imported = useMemo(
    () => {
      if (zone === "trash") return [];
      return importedAll.filter((r) =>
        zone === "builtin" ? r.provenance === "bundled" : r.provenance !== "bundled"
      );
    },
    [importedAll, zone]
  );

  function handleChanged() {
    // Any mutation can invalidate a hash-keyed update result. Source linking is
    // the important case: the old "no source" badge must disappear immediately.
    setUpdates(null);
    void Promise.all([mutate(), mutateTrash()]);
  }

  // Bulk one-click targets. Both count the current zone only; the builtin
  // zone never has local edits or updates, so the buttons vanish there.
  const unsynced = useMemo(
    () => imported.filter((r) => r.localChanged),
    [imported]
  );
  const updatable = useMemo(
    () =>
      updates
        ? imported.filter((r) => updates.get(r.contentHash)?.hasUpdate)
        : [],
    [imported, updates]
  );

  // Sequential on purpose: each action rewrites library state on disk, and
  // partial failure shouldn't abort the rest.
  async function runBulk(
    hashes: string[],
    action: "syncLocalChange" | "updateSkill"
  ) {
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    for (const hash of hashes) {
      try {
        await apiPost("/api/skills/action", { action, hash });
        ok++;
      } catch {
        fail++;
      }
    }
    setBulkBusy(false);
    // Updating changes content hashes, so the stale update map can't be
    // trusted afterwards — clear it and let the user re-check.
    if (action === "updateSkill") setUpdates(null);
    const msg =
      t("bulk_ok_n").replace("{n}", String(ok)) +
      (fail ? " · " + t("bulk_fail_n").replace("{n}", String(fail)) : "");
    toast(msg, fail ? "error" : "success");
    mutate();
  }

  // Search applies first; categories + status filter the search results.
  const searched = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return imported;
    return imported.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        r.description.toLowerCase().includes(s)
    );
  }, [imported, q]);

  // Tag = category. One skill can be in many. Untagged → "未分类".
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    let uncat = 0;
    for (const r of searched) {
      if (r.tags.length === 0) uncat++;
      for (const tg of r.tags) counts.set(tg, (counts.get(tg) ?? 0) + 1);
    }
    const tags = [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, n]) => ({ key, label: key, n }));
    const list = [{ key: "all", label: t("lbl_all"), n: searched.length }, ...tags];
    if (uncat > 0)
      list.push({ key: UNCAT, label: t("lbl_uncategorized"), n: uncat });
    return list;
  }, [searched, t]);

  const visible = useMemo(() => {
    let rows = searched;
    // The builtin zone hides the 使用中/闲置 filter (those skills are always
    // quarantined), so don't let a leftover status from the mine zone apply.
    if (zone !== "builtin") {
      if (status === "active") rows = rows.filter((r) => !r.parked);
      else if (status === "idle") rows = rows.filter((r) => r.parked);
    }
    if (category === UNCAT) rows = rows.filter((r) => r.tags.length === 0);
    else if (category !== "all")
      rows = rows.filter((r) => r.tags.includes(category));
    return rows;
  }, [searched, status, category, zone]);

  // Suite grouping mirrors Discover: adopted skills installed together from
  // one repo (row.source) collapse into one section instead of scattering
  // through the flat grid. A single-skill source stays a loose card.
  const { suites, loose } = useMemo(() => {
    const bySource = new Map<string, SkillRow[]>();
    const loose: SkillRow[] = [];
    for (const r of visible) {
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
    loose.sort((a, b) => a.name.localeCompare(b.name));
    return { suites, loose };
  }, [visible]);

  // An active search / tag / status filter means the user is LOOKING for
  // something — matching suite members must not hide behind a collapsed
  // header, so filters force every suite open.
  const filtersActive =
    q.trim() !== "" || category !== "all" || status !== "all";

  function toggleSuiteOpen(source: string) {
    setOpenSuites((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }

  const statusTabs: { key: Status; label: string }[] = [
    { key: "all", label: t("lbl_all") },
    { key: "active", label: t("lbl_active") },
    { key: "idle", label: t("lbl_idle") },
  ];

  const grid =
    error ? (
      <ErrorState message={(error as Error).message} onRetry={() => mutate()} />
    ) : isLoading ? (
      <Spinner />
    ) : visible.length === 0 ? (
      <div className="flex flex-col items-center gap-4 py-8">
        <EmptyState text={zone === "builtin" ? t("lbl_no_builtin") : t("lbl_no_skills")} />
        <Link href="/discover">
          <Button variant="primary">🔍 {t("nav_discover")}</Button>
        </Link>
      </div>
    ) : (
      <div className="flex flex-col gap-4">
        {suites.map(({ source, rows }) => (
          <LibrarySuite
            key={source}
            source={source}
            rows={rows}
            agents={agents ?? []}
            open={filtersActive || openSuites.has(source)}
            lockedOpen={filtersActive}
            onToggleOpen={() => toggleSuiteOpen(source)}
            onChanged={handleChanged}
            updates={updates}
          />
        ))}
        {suites.length > 0 && loose.length > 0 && (
          <h2 className="text-sm font-extrabold text-ink-secondary">
            {t("suite_loose_title")}{" "}
            <span className="opacity-70">{loose.length}</span>
          </h2>
        )}
        <div className="flex flex-col gap-2">
          {loose.map((skill) => (
            <SkillListRow
              key={skill.contentHash}
              skill={skill}
              agents={agents ?? []}
              onChanged={handleChanged}
              update={updates?.get(skill.contentHash)}
            />
          ))}
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col items-start gap-3 xl:flex-row xl:items-center xl:justify-between">
        <h1 className="text-2xl font-extrabold text-ink-header">
          📚 {t("nav_library")}
        </h1>
        <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
          {zone !== "trash" && (
            <>
          {/* Layout toggle: B (top pills) vs C (side rail) */}
          <div className="flex rounded-pill border-2 border-line/40 bg-content p-0.5">
            {(["top", "side"] as const).map((l) => (
              <button
                key={l}
                onClick={() => changeLayout(l)}
                title={l === "top" ? t("layout_top") : t("layout_side")}
                className={cn(
                  "rounded-pill px-3 py-1 text-sm font-bold transition-colors",
                  layout === l ? "bg-mint text-white" : "text-ink-secondary"
                )}
              >
                {l === "top" ? "▭" : "▥"}
              </button>
            ))}
          </div>
          {unsynced.length > 0 && (
            <Button
              variant="default"
              disabled={bulkBusy}
              onClick={() =>
                runBulk(
                  unsynced.map((r) => r.contentHash),
                  "syncLocalChange"
                )
              }
            >
              ⟳ {t("sync_all")} ({unsynced.length})
            </Button>
          )}
          {updatable.length > 0 && (
            <Button
              variant="primary"
              disabled={bulkBusy}
              onClick={() => {
                if (updatable.some((r) => r.localChanged)) setBulkConfirm(true);
                else
                  runBulk(
                    updatable.map((r) => r.contentHash),
                    "updateSkill"
                  );
              }}
            >
              ⬆ {t("upd_all")} ({updatable.length})
            </Button>
          )}
          <Button variant="default" disabled={checking} onClick={checkUpdates}>
            {checking ? t("upd_checking") : `⬆ ${t("upd_check")}`}
          </Button>
            </>
          )}
          <Button variant="default" onClick={handleChanged}>
            🔄 {t("act_refresh")}
          </Button>
        </div>
      </header>

      {/* Primary split: my own skills vs agent-bundled (quarantined) */}
      <div className="flex flex-wrap gap-2">
        {([
          { key: "mine", label: t("zone_mine"), n: mineCount },
          { key: "builtin", label: t("builtin_tab"), n: builtinCount },
          { key: "trash", label: t("zone_trash"), n: trash?.length ?? 0 },
        ] as const).map((z) => (
          <button
            key={z.key}
            onClick={() => {
              setZone(z.key);
              setCategory("all");
            }}
            className={cn(
              "rounded-pill border-2 px-4 py-1.5 text-sm font-bold transition-colors",
              zone === z.key
                ? "border-mint-active bg-mint text-white"
                : "border-line/40 bg-content text-ink-secondary hover:bg-mint-light"
            )}
          >
            {z.label} <span className="opacity-70">{z.n}</span>
          </button>
        ))}
      </div>

      {zone === "builtin" && (
        <p className="rounded-bubble bg-amber-50 p-3 text-xs text-amber-700">
          ℹ️ {t("zone_builtin_hint")}
        </p>
      )}

      {zone === "mine" && (
        <DedupPanel agents={agents ?? []} onChanged={handleChanged} />
      )}

      {zone === "trash" && (
        <TrashPanel
          items={trash ?? []}
          agents={agents ?? []}
          onChanged={handleChanged}
        />
      )}

      {zone !== "trash" && (
        <>
      {/* Toolbar: status (secondary) + search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {zone === "builtin" ? (
          <div />
        ) : (
          <div className="flex gap-1 rounded-pill border-2 border-line/40 bg-content p-0.5">
            {statusTabs.map((s) => (
              <button
                key={s.key}
                onClick={() => setStatus(s.key)}
                className={cn(
                  "rounded-pill px-4 py-1 text-sm font-bold transition-colors",
                  status === s.key ? "bg-mint text-white" : "text-ink-secondary"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <input
          className="input w-64"
          placeholder={t("lbl_search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* B: top category pills */}
      {layout === "top" && (
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <CatPill
              key={c.key}
              active={category === c.key}
              onClick={() => setCategory(c.key)}
              label={c.label}
              n={c.n}
              isAll={c.key === "all"}
              isUncat={c.key === UNCAT}
            />
          ))}
        </div>
      )}

      {/* C: side tag rail (secondary in-content panel, not a second nav) */}
      {layout === "side" ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          <aside className="w-full shrink-0 sm:w-44">
            <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-ink-secondary">
              🏷️ {t("lbl_tags")}
            </div>
            <div className="flex flex-col gap-0.5">
              {categories.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={cn(
                    "flex items-center justify-between rounded-[12px] px-3 py-2 text-sm font-bold transition-colors",
                    category === c.key
                      ? "bg-mint text-white"
                      : "text-ink-body hover:bg-mint-light"
                  )}
                >
                  <span className="truncate">
                    {c.key === "all"
                      ? `🏷️ ${c.label}`
                      : c.key === UNCAT
                        ? c.label
                        : `#${c.label}`}
                  </span>
                  <span className="ml-2 text-xs opacity-70">{c.n}</span>
                </button>
              ))}
            </div>
          </aside>
          <div className="min-w-0 flex-1">{grid}</div>
        </div>
      ) : (
        grid
      )}
        </>
      )}

      {bulkConfirm && (
        <ConfirmDialog
          title={`⬆ ${t("upd_all")}`}
          body={t("upd_all_confirm_body")
            .replace("{n}", String(updatable.length))
            .replace(
              "{m}",
              String(updatable.filter((r) => r.localChanged).length)
            )}
          confirmLabel={t("upd_all")}
          danger={false}
          onCancel={() => setBulkConfirm(false)}
          onConfirm={() => {
            setBulkConfirm(false);
            runBulk(
              updatable.map((r) => r.contentHash),
              "updateSkill"
            );
          }}
        />
      )}
    </div>
  );
}

function LibrarySuite({
  source,
  rows,
  agents,
  open,
  lockedOpen,
  onToggleOpen,
  onChanged,
  updates,
}: {
  source: string;
  rows: SkillRow[];
  agents: DetectedAgent[];
  open: boolean;
  lockedOpen: boolean;
  onToggleOpen: () => void;
  onChanged: () => void;
  updates: Map<string, UpdateHint> | null;
}) {
  const { t } = useLang();
  const nActive = rows.filter((r) => !r.parked).length;
  const nUpd = rows.filter(
    (r) => updates?.get(r.contentHash)?.hasUpdate
  ).length;

  return (
    <section className="rounded-card border-2 border-line/40 bg-content/70">
      <div
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button, input, a, label"))
            return;
          if (!lockedOpen) onToggleOpen();
        }}
        className={cn(
          "flex flex-wrap items-center gap-3 px-4 py-3",
          !lockedOpen && "cursor-pointer"
        )}
      >
        <span className="text-lg">📦</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-base font-extrabold text-ink-header">
              {source}
            </span>
            <span className="rounded-pill border border-mint-active/40 bg-mint-light px-2 py-0.5 text-xs font-bold text-mint-active">
              {t("suite_badge")} · {rows.length}
            </span>
            {nActive > 0 && (
              <span className="rounded-pill bg-mint-light px-2 py-0.5 text-xs font-bold text-mint-active">
                {t("lbl_active")} {nActive}
              </span>
            )}
            {nUpd > 0 && (
              <span className="rounded-pill bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                {t("upd_available")} {nUpd}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-ink-secondary">{t("suite_sub")}</p>
        </div>
        {!lockedOpen && (
          <button
            onClick={onToggleOpen}
            className="text-sm font-bold text-ink-secondary hover:text-mint-active"
            aria-expanded={open}
            aria-label={source}
          >
            {open ? "▲" : "▼"}
          </button>
        )}
      </div>
      {open && (
        <div className="flex flex-col gap-2 border-t-2 border-dashed border-line/30 p-3 pl-5"
        >
          {rows.map((skill) => (
            <SkillListRow
              key={skill.contentHash}
              skill={skill}
              agents={agents}
              onChanged={onChanged}
              update={updates?.get(skill.contentHash)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CatPill({
  active,
  onClick,
  label,
  n,
  isAll,
  isUncat,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  n: number;
  isAll: boolean;
  isUncat: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-pill border-2 px-4 py-1.5 text-sm font-bold transition-colors",
        active
          ? "border-mint-active bg-mint text-white"
          : "border-line/40 bg-content text-ink-secondary hover:bg-mint-light"
      )}
    >
      {isAll || isUncat ? label : `#${label}`}{" "}
      <span className="opacity-70">{n}</span>
    </button>
  );
}
