"use client";

import { use, useMemo } from "react";
import { useSkills, useAgents } from "@/lib/client";
import { useLang } from "@/components/LangProvider";
import { SkillListRow } from "@/components/SkillListRow";
import { EmptyState, ErrorState, Spinner } from "@/components/ui";

export default function WorkspacePage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const { t } = useLang();
  const { data: skills, error, isLoading, mutate } = useSkills();
  const { data: agents } = useAgents();
  const agent = (agents ?? []).find((a) => a.id === agentId);

  const { active, available } = useMemo(() => {
    const rows = skills ?? [];
    return {
      // Active in this agent.
      active: rows.filter((r) => r.activeAgentIds.includes(agentId)),
      // In library but not enabled here.
      available: rows.filter(
        (r) => r.adopted && !r.activeAgentIds.includes(agentId)
      ),
    };
  }, [skills, agentId]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold text-ink-header">
          🤖 {agent?.label ?? agentId}
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          {t("lbl_link_mode")}:{" "}
          <span className="font-bold">
            {agent?.linkMode === "copy" ? t("lbl_copy") : t("lbl_symlink")}
          </span>
        </p>
      </header>

      {error ? (
        <ErrorState message={(error as Error).message} onRetry={() => mutate()} />
      ) : isLoading ? (
        <Spinner />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-ink-secondary">
              {t("lbl_active")} ({active.length})
            </h2>
            {active.length === 0 ? (
              <EmptyState text={t("lbl_no_skills")} />
            ) : (
              <div className="flex flex-col gap-2">
                {active.map((skill) => (
                  <SkillListRow
                    key={skill.contentHash}
                    skill={skill}
                    agents={agents ?? []}
                    onChanged={() => mutate()}
                  />
                ))}
              </div>
            )}
          </section>

          {available.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-ink-secondary">
                {t("lbl_missing_in")} ({available.length})
              </h2>
              <div className="flex flex-col gap-2">
                {available.map((skill) => (
                  <SkillListRow
                    key={skill.contentHash}
                    skill={skill}
                    agents={agents ?? []}
                    onChanged={() => mutate()}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
