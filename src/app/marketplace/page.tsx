"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import cn from "classnames";
import { fetcher, apiPost, swrOpts } from "@/lib/client";
import { useLang } from "@/components/LangProvider";
import { useToast } from "@/components/Toast";
import { Button, Spinner, EmptyState, ErrorState } from "@/components/ui";
import type { MarketSkill } from "@/lib/marketplace";

type Tab = "browse" | "git" | "local";

interface BrowseResult {
  skills: MarketSkill[];
  favorites: string[];
  source: "skillssh" | "github" | "starter" | "ratelimited";
}

export default function MarketplacePage() {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>("browse");

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-extrabold text-ink-header">
          🛒 {t("nav_marketplace")}
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              { key: "browse", label: `🔍 ${t("mkt_tab_browse")}` },
              { key: "git", label: `🌿 ${t("mkt_tab_git")}` },
              { key: "local", label: `📁 ${t("mkt_tab_local")}` },
            ] as const
          ).map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={cn(
                "rounded-pill border-2 px-4 py-1.5 text-sm font-bold transition-colors",
                tab === tb.key
                  ? "border-mint-active bg-mint text-white"
                  : "border-line/40 bg-content text-ink-secondary hover:bg-mint-light"
              )}
            >
              {tb.label}
            </button>
          ))}
        </div>
      </header>

      {tab === "browse" && <BrowseTab />}
      {tab === "git" && <GitTab />}
      {tab === "local" && <LocalTab />}
    </div>
  );
}

/* --- Browse (skills.sh search + install counts) ----------------------- */

function BrowseTab() {
  const { t } = useLang();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(id);
  }, [q]);
  const { data, error, isLoading, mutate } = useSWR<BrowseResult>(
    `/api/marketplace?q=${encodeURIComponent(debouncedQ)}`,
    fetcher,
    swrOpts
  );

  async function install(skill: MarketSkill) {
    setBusy(skill.id);
    try {
      await apiPost("/api/marketplace", { action: "install", skill, agentIds: [] });
      toast(
        `${t("act_install")}: ${skill.name} → ${t("nav_library")} · ${t("lbl_idle")}`,
        "success"
      );
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  }

  async function favorite(s: MarketSkill, on: boolean) {
    await apiPost("/api/marketplace", { action: "favorite", marketId: s.id, on });
    mutate();
  }

  const fav = new Set(data?.favorites ?? []);
  const srcHint =
    data?.source === "skillssh"
      ? t("mkt_skillssh")
      : data?.source === "github"
        ? t("mkt_github")
        : data?.source === "starter"
          ? t("mkt_offline")
          : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-disabled">{srcHint}</p>
        <input
          className="input w-72"
          placeholder={t("lbl_search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {error ? (
        <ErrorState message={(error as Error).message} onRetry={() => mutate()} />
      ) : isLoading ? (
        <Spinner />
      ) : data?.source === "ratelimited" ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="max-w-md rounded-bubble bg-amber-50 p-4 text-center text-sm text-amber-700">
            ⏳ {t("mkt_ratelimited")}
          </p>
          <Button variant="default" onClick={() => mutate()}>
            🔄 {t("act_retry")}
          </Button>
        </div>
      ) : (data?.skills.length ?? 0) === 0 ? (
        <EmptyState text={t("lbl_no_skills")} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data!.skills.map((s) => (
            <div key={s.id} className="card card-hover flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 truncate text-base font-extrabold text-ink-header">
                  {s.name}
                </h3>
                <button
                  onClick={() => favorite(s, !fav.has(s.id))}
                  className="shrink-0 text-lg"
                  title={t("act_want")}
                  aria-label={t("act_want")}
                >
                  {fav.has(s.id) ? "⭐" : "☆"}
                </button>
              </div>
              <p className="line-clamp-2 text-sm text-ink-body">
                {s.description || s.source}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-ink-secondary">
                <a
                  href={s.gitUrl + (s.subpath ? `/tree/HEAD/${s.subpath}` : "")}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t("mkt_view_source")}
                  className="truncate font-mono text-ink-secondary hover:text-mint-active hover:underline"
                >
                  📦 {s.source || s.author} ↗
                </a>
                {s.installs > 0 && (
                  <span className="rounded-pill bg-mint-light px-2 py-0.5 font-bold text-mint-active">
                    ⬇ {s.installs.toLocaleString()}
                  </span>
                )}
              </div>
              <div className="mt-1 flex justify-end">
                <Button
                  variant="primary"
                  disabled={busy === s.id}
                  onClick={() => install(s)}
                >
                  {busy === s.id ? "…" : `⬇ ${t("act_install")}`}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* --- Git install ------------------------------------------------------ */

function GitTab() {
  const { t } = useLang();
  const toast = useToast();
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    if (!ref.trim()) return;
    setBusy(true);
    try {
      const row = await apiPost<{ name: string }>("/api/marketplace", {
        action: "installGit",
        ref: ref.trim(),
        agentIds: [],
      });
      toast(`${t("act_install")}: ${row.name} → ${t("nav_library")}`, "success");
      setRef("");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex flex-col gap-3">
      <p className="text-sm text-ink-secondary">{t("mkt_git_hint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input min-w-0 flex-1"
          placeholder={t("mkt_git_ph")}
          value={ref}
          disabled={busy}
          onChange={(e) => setRef(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
        />
        <Button variant="primary" disabled={busy || !ref.trim()} onClick={go}>
          {busy ? "…" : `⬇ ${t("act_install")}`}
        </Button>
      </div>
      <p className="font-mono text-xs text-ink-disabled">
        e.g. obra/superpowers/skills/brainstorming · anthropics/skills
      </p>
    </div>
  );
}

/* --- Local install ---------------------------------------------------- */

function LocalTab() {
  const { t } = useLang();
  const toast = useToast();
  const [p, setP] = useState("");
  const [batch, setBatch] = useState(false);
  const [busy, setBusy] = useState(false);

  async function go() {
    if (!p.trim()) return;
    setBusy(true);
    try {
      const res = await apiPost<{ installed: number; failed: unknown[] }>(
        "/api/marketplace",
        { action: "installLocal", path: p.trim(), batch, agentIds: [] }
      );
      toast(`${t("mkt_installed_n")}: ${res.installed} ✓`, "success");
      setP("");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex flex-col gap-3">
      <p className="text-sm text-ink-secondary">{t("mkt_local_hint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input min-w-0 flex-1 font-mono"
          placeholder={t("mkt_local_ph")}
          value={p}
          disabled={busy}
          onChange={(e) => setP(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
        />
        <Button variant="primary" disabled={busy || !p.trim()} onClick={go}>
          {busy ? "…" : `⬇ ${t("act_install")}`}
        </Button>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-body">
        <input
          type="checkbox"
          checked={batch}
          onChange={(e) => setBatch(e.target.checked)}
          className="h-4 w-4 accent-[#19c8b9]"
        />
        {t("mkt_local_batch")}
      </label>
    </div>
  );
}
