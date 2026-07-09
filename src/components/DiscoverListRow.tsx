"use client";

import { useState, type MouseEvent } from "react";
import cn from "classnames";
import type { DetectedAgent, SkillRow } from "@/lib/types";
import { useLang } from "./LangProvider";
import { Button, ProvenanceBadge, HashTag } from "./ui";
import { AgentLogo } from "./AgentLogo";
import { SkillDetailModal } from "./SkillDetailModal";

export function DiscoverListRow({
  skill,
  agents,
  selected,
  busy,
  onToggle,
  onImport,
}: {
  skill: SkillRow;
  agents: DetectedAgent[];
  selected: boolean;
  busy: boolean;
  onToggle: () => void;
  onImport: () => void;
}) {
  const { t } = useLang();
  const [showDetail, setShowDetail] = useState(false);

  const agentIds = [...new Set(skill.occurrences.map((o) => o.agentId))];
  const bundledByLabel =
    skill.provenance === "bundled"
      ? agents.find(
          (a) => a.id === skill.occurrences.find((o) => o.bundled)?.agentId
        )?.label
      : undefined;

  const onRowClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input, a, label")) return;
    setShowDetail(true);
  };

  return (
    <div
      onClick={onRowClick}
      className={cn(
        "group flex min-h-[52px] cursor-pointer items-center gap-3 rounded-bubble border-2 border-l-4 bg-content/60 px-3 py-2 transition-colors hover:border-line/60 hover:bg-content",
        selected ? "border-l-mint bg-mint-light/40" : "border-l-line/40"
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        disabled={busy}
        onChange={onToggle}
        className="h-4 w-4 accent-[#19c8b9]"
        aria-label={skill.name}
        onClick={(e) => e.stopPropagation()}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={() => setShowDetail(true)}
            title={t("lbl_view_detail")}
            className="truncate text-sm font-extrabold text-ink-header hover:text-mint-active hover:underline"
          >
            {skill.name}
          </button>
          <ProvenanceBadge provenance={skill.provenance} bundledByLabel={bundledByLabel} />
        </div>
        <p className="truncate text-xs text-ink-body">{skill.description || "—"}</p>
      </div>

      <div className="hidden shrink-0 items-center gap-1.5 md:flex">
        {agentIds.map((id) => {
          const a = agents.find((x) => x.id === id);
          return (
            <AgentLogo key={id} agentId={id} label={a?.label ?? id} size="sm" />
          );
        })}
        {agentIds.length > 1 && (
          <span className="text-xs text-ink-muted">×{agentIds.length}</span>
        )}
      </div>

      {skill.source && (
        <span className="hidden max-w-[140px] truncate text-xs text-ink-muted lg:block">
          {t("upd_from")} {skill.source}
        </span>
      )}

      <span className="hidden xl:inline">
        <HashTag hash={skill.contentHash} />
      </span>

      <Button
        variant="primary"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onImport();
        }}
        className="shrink-0 px-3 py-1.5 text-xs"
      >
        {t("act_import")}
      </Button>

      {showDetail && (
        <SkillDetailModal
          hash={skill.contentHash}
          skill={skill}
          onClose={() => setShowDetail(false)}
        />
      )}
    </div>
  );
}
