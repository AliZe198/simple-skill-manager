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
    <aside className="flex w-64 shrink-0 flex-col gap-2 border-r-2 border-line/30 bg-content/60 p-4">
      <div className="mb-2 px-2">
        <div className="flex items-center gap-2 text-ink-header">
          <span className="text-2xl">🏝️</span>
          <span className="text-lg font-extrabold">{t("appName")}</span>
        </div>
        <p className="mt-1 text-xs leading-snug text-ink-secondary">
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
                "flex items-center gap-3 rounded-[12px] px-3 py-2 text-sm font-bold transition-colors",
                active
                  ? "bg-mint text-white shadow-soft"
                  : "text-ink-body hover:bg-mint-light"
              )}
            >
              <span>{item.icon}</span>
              {t(item.key)}
            </Link>
          );
        })}
      </nav>

      <div className="mt-3 px-2 text-xs font-bold uppercase tracking-wide text-ink-secondary">
        {t("nav_workspace")}
      </div>
      <nav className="flex flex-col gap-1">
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

      <div className="mt-auto flex items-center justify-center gap-1 rounded-pill border-2 border-line/40 bg-white/60 p-1">
        {(["zh", "en"] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={cn(
              "flex-1 rounded-pill px-3 py-1 text-xs font-bold transition-colors",
              lang === l ? "bg-mint text-white" : "text-ink-secondary"
            )}
          >
            {l === "zh" ? "中文" : "EN"}
          </button>
        ))}
      </div>
    </aside>
  );
}
