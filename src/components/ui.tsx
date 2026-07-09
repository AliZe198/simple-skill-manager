"use client";

import cn from "classnames";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Provenance } from "@/lib/types";
import { useLang } from "./LangProvider";

type Variant = "primary" | "default" | "danger" | "ghost";

export function Button({
  variant = "default",
  className,
  children,
  ...rest
}: { variant?: Variant; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "btn",
        {
          "btn-primary": variant === "primary",
          "btn-default": variant === "default",
          "btn-danger": variant === "danger",
          "btn-ghost": variant === "ghost",
        },
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

const PROV_STYLE: Record<Provenance, string> = {
  "self-authored": "bg-mint-light text-mint-active border border-mint",
  downloaded: "bg-amber-50 text-amber-700 border border-amber-300",
  bundled: "bg-stone-100 text-ink-muted border border-line/50",
  unknown: "bg-stone-50 text-ink-muted border border-line/40",
};

const PROV_KEY: Record<Provenance, "prov_self" | "prov_downloaded" | "prov_bundled" | "prov_unknown"> = {
  "self-authored": "prov_self",
  downloaded: "prov_downloaded",
  bundled: "prov_bundled",
  unknown: "prov_unknown",
};

export function ProvenanceBadge({
  provenance,
  bundledByLabel,
}: {
  provenance: Provenance;
  /** For bundled skills: the agent that bundles it → "Codex 内置". */
  bundledByLabel?: string;
}) {
  const { t } = useLang();
  const label =
    provenance === "bundled" && bundledByLabel
      ? `${bundledByLabel} ${t("builtin_suffix")}`
      : t(PROV_KEY[provenance]);
  return <span className={cn("badge", PROV_STYLE[provenance])}>{label}</span>;
}

export function AgentChip({
  label,
  active = false,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "badge",
        active
          ? "bg-mint text-white"
          : "bg-white/70 text-ink-secondary border border-line/50"
      )}
    >
      {label}
    </span>
  );
}

export function HashTag({ hash }: { hash: string }) {
  return (
    <span className="font-mono text-[11px] text-ink-disabled">
      #{hash.slice(0, 8)}
    </span>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-ink-secondary">
      <div className="text-5xl">🏝️</div>
      <p className="font-bold">{text}</p>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-line/30 border-t-mint" />
    </div>
  );
}

/** Distinct from EmptyState: a real fetch/operation failure with a retry. */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const { t } = useLang();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-status-error-active">
      <div className="text-5xl">🍂</div>
      <p className="font-bold">{t("err_load")}</p>
      <p className="max-w-md break-words text-center text-xs text-ink-muted">
        {message}
      </p>
      {onRetry && (
        <Button variant="default" onClick={onRetry}>
          🔄 {t("act_retry")}
        </Button>
      )}
    </div>
  );
}
