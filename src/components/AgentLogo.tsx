"use client";

import { useState } from "react";
import cn from "classnames";

/** agentId → official logo file in /public/logos. */
const LOGO: Record<string, string> = {
  "claude-code": "/logos/claude-logo.png",
  codex: "/logos/codex-logo.png",
  gemini: "/logos/gemini-logo.png",
  openclaw: "/logos/openclaw-logo.png",
  hermes: "/logos/hermesagent-logo.png",
  kimi: "/logos/kimi-logo.png",
  antigravity: "/logos/antigravity-logo.png",
};

/** Brand-ish fallback colors for agents without a logo. */
const FALLBACK_COLOR: Record<string, string> = {
  copilot: "#6e7681",
  kiro: "#7c3aed",
  pi: "#0ea5e9",
  agents: "#10b981",
  "craft-agent": "#f59e0b",
  opencode: "#ef4444",
  workbuddy: "#8b5cf6",
};

const SIZE: Record<string, string> = {
  sm: "h-5 w-5",
  md: "h-7 w-7",
  lg: "h-9 w-9",
};

/**
 * Round agent badge. Uses the official logo when we have one, otherwise a
 * colored circle with the first letter. Always carries the label for a11y.
 */
export function AgentLogo({
  agentId,
  label,
  size = "md",
  className,
}: {
  agentId: string;
  label: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const src = LOGO[agentId];

  if (src && !broken) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-line/30",
          SIZE[size],
          className
        )}
        title={label}
        aria-label={label}
        role="img"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={label}
          className="h-full w-full object-contain"
          onError={() => setBroken(true)}
        />
      </span>
    );
  }

  const color = FALLBACK_COLOR[agentId] ?? "#9f927d";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-extrabold text-white",
        SIZE[size],
        className
      )}
      style={{ backgroundColor: color }}
      title={label}
      aria-label={label}
      role="img"
    >
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}
