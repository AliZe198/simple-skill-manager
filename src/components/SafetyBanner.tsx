"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher, swrOpts } from "@/lib/client";
import { useLang } from "./LangProvider";
import type { AppConfig } from "@/lib/types";

/**
 * A developer-only indicator of which root the app is operating on. End users
 * who run the published app (production build) never see it — it renders only
 * in development (`npm run dev`). It's dismissible; the dismissal lasts for the
 * current browser session, so it comes back on the next run.
 */
const DEV = process.env.NODE_ENV !== "production";
const DISMISS_KEY = "ssm-hide-safety-banner";

export function SafetyBanner() {
  const { t } = useLang();
  const [dismissed, setDismissed] = useState(true); // hidden until we've checked
  const { data: config } = useSWR<AppConfig>(DEV ? "/api/config" : null, fetcher, swrOpts);

  useEffect(() => {
    if (!DEV) return;
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (!DEV || dismissed || !config) return null;

  const hide = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  const real = config.isRealHome;
  return (
    <div
      role="status"
      className={
        "flex flex-wrap items-center gap-x-2 gap-y-1 border-b-2 px-3 py-2 text-xs sm:gap-x-3 sm:px-8 sm:text-sm " +
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
      <span className="ml-auto hidden break-all font-mono text-xs opacity-70 sm:inline">
        {config.agentRoot}
      </span>
      <button
        onClick={hide}
        title={t("banner_dismiss")}
        aria-label={t("banner_dismiss")}
        className="ml-2 shrink-0 rounded-full px-2 py-0.5 text-base font-bold leading-none opacity-70 transition hover:bg-black/10 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}
