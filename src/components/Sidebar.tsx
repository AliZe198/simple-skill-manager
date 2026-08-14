"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import cn from "classnames";
import { useLang } from "./LangProvider";
import { useAgents } from "@/lib/client";
import { AgentLogo } from "./AgentLogo";
import type { DictKey } from "@/lib/i18n";

const NAV: { href: string; key: DictKey; icon: string }[] = [
  { href: "/library", key: "nav_library", icon: "📚" },
  { href: "/discover", key: "nav_discover", icon: "🔍" },
  { href: "/marketplace", key: "nav_marketplace", icon: "🛒" },
  { href: "/mcp", key: "nav_mcp", icon: "🔌" },
  { href: "/settings", key: "nav_settings", icon: "⚙️" },
];

export function Sidebar() {
  const { t, lang, setLang } = useLang();
  const pathname = usePathname();
  const { data: agents } = useAgents();
  const detected = (agents ?? []).filter((a) => a.detected && !a.ignored);

  return (
    <aside className="flex w-16 shrink-0 flex-col gap-2 overflow-y-auto border-r-2 border-line/30 bg-content/60 p-2 sm:w-64 sm:p-4">
      <div className="mb-2 px-1 sm:px-2">
        <div className="flex items-center justify-center gap-2 text-ink-header sm:justify-start">
          <span className="text-2xl">🏝️</span>
          <span className="hidden text-lg font-extrabold sm:inline">{t("appName")}</span>
        </div>
        <p className="mt-1 hidden text-xs leading-snug text-ink-secondary sm:block">
          {t("tagline")}
        </p>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-center gap-3 rounded-[12px] px-2 py-2 text-sm font-bold transition-colors sm:justify-start sm:px-3",
                active
                  ? "bg-mint text-white shadow-soft"
                  : "text-ink-body hover:bg-mint-light"
              )}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span className="sr-only sm:not-sr-only">{t(item.key)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-3 hidden px-2 text-xs font-bold uppercase tracking-wide text-ink-secondary sm:block">
        {t("nav_workspace")}
      </div>
      <nav className="hidden flex-col gap-1 sm:flex">
        {detected.map((a) => {
          const href = `/workspace/${a.id}`;
          const active = pathname === href;
          return (
            <Link
              key={a.id}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-[12px] px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-mint-light font-bold text-mint-active"
                  : "text-ink-secondary hover:bg-mint-light/60"
              )}
            >
              <AgentLogo agentId={a.id} label={a.label} size="sm" />
              {a.label}
            </Link>
          );
        })}
        {detected.length === 0 && (
          <span className="px-3 text-xs text-ink-disabled">{t("nav_no_agents")}</span>
        )}
      </nav>

      <div className="mt-auto flex flex-col items-center justify-center gap-1 rounded-pill border-2 border-line/40 bg-white/60 p-1 sm:flex-row">
        {(["zh", "en"] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={cn(
              "w-full rounded-pill px-1 py-1 text-[10px] font-bold transition-colors sm:flex-1 sm:px-3 sm:text-xs",
              lang === l ? "bg-mint text-white" : "text-ink-secondary"
            )}
          >
            {l === "zh" ? "中" : "EN"}
          </button>
        ))}
      </div>
    </aside>
  );
}
