"use client";

import useSWR from "swr";
import { fetcher, swrOpts } from "@/lib/client";
import { useLang } from "./LangProvider";
import type { AppConfig } from "@/lib/types";

/**
 * Persistent, impossible-to-miss indicator of which root the app is operating
 * on. This is the single feature that makes the tool safe to ship: the user
 * always knows whether a click will touch their real files or a sandbox.
 */
export function SafetyBanner() {
  const { t } = useLang();
  const { data: config } = useSWR<AppConfig>("/api/config", fetcher, swrOpts);
  if (!config) return null;

  const real = config.isRealHome;
  return (
    <div
      role="status"
      className={
        "flex flex-wrap items-center gap-x-3 gap-y-1 border-b-2 px-8 py-2 text-sm " +
        (real
          ? "border-status-error/40 bg-status-error/10 text-status-error-active"
          : "border-mint/40 bg-mint-light text-mint-active")
      }
    >
      <span
        className={
          "badge font-extrabold " +
          (real ? "bg-status-error text-white" : "bg-mint text-white")
        }
      >
        {real ? "⚠️ " : "🛟 "}
        {real ? t("banner_real") : t("banner_sandbox")}
      </span>
      <span className="font-bold">
        {real ? t("banner_real_desc") : t("banner_sandbox_desc")}
      </span>
      <span className="ml-auto break-all font-mono text-xs opacity-70">
        {config.agentRoot}
      </span>
    </div>
  );
}
