"use client";

import type { ReactNode } from "react";
import type { CopyTargetChange, DetectedAgent, SkillRow } from "@/lib/types";
import { Button } from "./ui";
import { Modal } from "./Modal";
import { useLang } from "./LangProvider";

export interface UpdateCenterStats {
  update: number;
  current: number;
  noSource: number;
  error: number;
}

export function UpdateCenterModal({
  checked,
  checking,
  bulkBusy,
  stats,
  updatableCount,
  unsyncedCount,
  copyChanges,
  agents,
  onCheck,
  onUpdateAll,
  onSyncAll,
  onAdoptCopy,
  onClear,
  onClose,
}: {
  checked: boolean;
  checking: boolean;
  bulkBusy: boolean;
  stats: UpdateCenterStats;
  updatableCount: number;
  unsyncedCount: number;
  copyChanges: { skill: SkillRow; change: CopyTargetChange }[];
  agents: DetectedAgent[];
  onCheck: () => void;
  onUpdateAll: () => void;
  onSyncAll: () => void;
  onAdoptCopy: (skill: SkillRow, change: CopyTargetChange) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { t } = useLang();

  return (
    <Modal title={t("update_center_title")} onClose={onClose} size="lg">
      <div className="flex min-h-0 flex-col gap-6 overflow-y-auto pr-1">
        <section className="flex flex-col gap-3">
          <div>
            <h3 className="font-extrabold text-ink-header">
              {t("update_center_upstream")}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">
              {t("update_center_upstream_hint")}
            </p>
          </div>

          {checked ? (
            <div className="flex flex-wrap gap-2" aria-live="polite">
              <StatusPill tone="update">
                {stats.update} {t("update_center_updates")}
              </StatusPill>
              <StatusPill tone="current">
                {stats.current} {t("update_center_current")}
              </StatusPill>
              <StatusPill tone="muted">
                {stats.noSource} {t("update_center_no_source")}
              </StatusPill>
              {stats.error > 0 && (
                <StatusPill tone="error">
                  {stats.error} {t("update_center_errors")}
                </StatusPill>
              )}
            </div>
          ) : (
            <p className="rounded-bubble bg-mint-light px-4 py-3 text-sm text-ink-body">
              {t("update_center_not_checked")}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {checked && updatableCount > 0 && (
              <Button
                variant="primary"
                disabled={bulkBusy || checking}
                onClick={onUpdateAll}
              >
                {t("upd_all")} ({updatableCount})
              </Button>
            )}
            <Button
              variant={checked ? "default" : "primary"}
              disabled={checking || bulkBusy}
              onClick={onCheck}
            >
              {checking
                ? t("upd_checking")
                : checked
                  ? t("update_center_recheck")
                  : t("upd_check")}
            </Button>
            {checked && (
              <Button
                variant="ghost"
                disabled={checking || bulkBusy}
                onClick={onClear}
              >
                {t("update_center_clear")}
              </Button>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3 border-t-2 border-dashed border-line/30 pt-5">
          <div>
            <h3 className="font-extrabold text-ink-header">
              {t("update_center_local")}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">
              {unsyncedCount > 0
                ? t("update_center_local_pending").replace(
                    "{n}",
                    String(unsyncedCount)
                  )
                : t("update_center_local_done")}
            </p>
          </div>
          {unsyncedCount > 0 && (
            <div>
              <Button
                variant="default"
                disabled={bulkBusy || checking}
                onClick={onSyncAll}
              >
                {t("sync_all")} ({unsyncedCount})
              </Button>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3 border-t-2 border-dashed border-line/30 pt-5">
          <div>
            <h3 className="font-extrabold text-ink-header">
              {t("update_center_agent")}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">
              {copyChanges.length > 0
                ? t("update_center_agent_hint")
                : t("update_center_agent_done")}
            </p>
          </div>
          {copyChanges.length > 0 && (
            <div className="flex flex-col gap-2">
              {copyChanges.map(({ skill, change }) => {
                const agent = agents.find((a) => a.id === change.agentId);
                const agentName = agent?.label ?? change.agentId;
                const conflict = change.state === "conflict";
                return (
                  <div
                    key={`${skill.contentHash}:${change.agentId}`}
                    className={`flex flex-col gap-3 rounded-bubble border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                      conflict
                        ? "border-orange-200 bg-orange-50"
                        : "border-sky-200 bg-sky-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-ink-header">
                          {skill.name}
                        </span>
                        <span
                          className={`badge ${
                            conflict
                              ? "bg-orange-100 text-orange-700"
                              : "bg-sky-100 text-sky-700"
                          }`}
                        >
                          {t(
                            conflict
                              ? "copy_change_conflict"
                              : "copy_change_agent_only"
                          )}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-ink-secondary">
                        {t("copy_change_from_to").replace("{agent}", agentName)}
                      </p>
                      {conflict && (
                        <p className="mt-1 text-xs text-orange-700">
                          {t("copy_change_conflict_hint").replace(
                            "{agent}",
                            agentName
                          )}
                        </p>
                      )}
                    </div>
                    <Button
                      variant={conflict ? "default" : "primary"}
                      disabled={bulkBusy || checking}
                      onClick={() => onAdoptCopy(skill, change)}
                    >
                      {t("copy_change_adopt")}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

function StatusPill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "update" | "current" | "muted" | "error";
}) {
  const styles = {
    update: "bg-amber-100 text-amber-700",
    current: "bg-mint-light text-mint-active",
    muted: "bg-stone-100 text-ink-muted",
    error: "bg-red-50 text-status-error-active",
  } as const;
  return (
    <span className={`badge px-3 py-1 ${styles[tone]}`}>{children}</span>
  );
}
