"use client";

import { useLang } from "./LangProvider";
import { Modal } from "./Modal";
import { Button } from "./ui";

export type SyncChoice =
  | "pull"
  | "overwriteCloudWithLocal"
  | "restoreFromCloud";

export function SyncChoiceDialog({
  localCount,
  cloudCount,
  onChoose,
  onCancel,
}: {
  localCount: number;
  cloudCount: number;
  onChoose: (choice: SyncChoice) => void;
  onCancel: () => void;
}) {
  const { t } = useLang();
  const summary = t("sync_choose_summary")
    .replace("{local}", String(localCount))
    .replace("{cloud}", String(cloudCount));

  const choices: Array<{
    value: SyncChoice;
    title: string;
    body: string;
    tone: string;
    badge?: string;
  }> = [
    {
      value: "pull",
      title: t("sync_choice_merge"),
      body: t("sync_choice_merge_desc"),
      badge: t("sync_recommended"),
      tone: "border-mint/60 bg-mint-light/70 hover:border-mint-active",
    },
    {
      value: "overwriteCloudWithLocal",
      title: t("sync_choice_local"),
      body: t("sync_choice_local_desc"),
      tone:
        "border-status-warning/60 bg-status-warning/10 hover:border-status-warning-active",
    },
    {
      value: "restoreFromCloud",
      title: t("sync_choice_cloud"),
      body: t("sync_choice_cloud_desc"),
      tone: "border-status-error/40 bg-status-error/5 hover:border-status-error",
    },
  ];

  return (
    <Modal title={t("sync_choose_title")} onClose={onCancel}>
      <p className="mb-4 text-sm text-ink-secondary">{summary}</p>
      <div className="flex flex-col gap-3">
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            onClick={() => onChoose(choice.value)}
            className={
              "w-full rounded-card border-2 p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focusYellow/30 " +
              choice.tone
            }
          >
            <span className="flex flex-wrap items-center gap-2 font-extrabold text-ink-header">
              {choice.title}
              {choice.badge ? (
                <span className="badge bg-mint text-white">{choice.badge}</span>
              ) : null}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-ink-secondary">
              {choice.body}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-5 flex justify-end">
        <Button variant="ghost" onClick={onCancel}>
          {t("act_cancel")}
        </Button>
      </div>
    </Modal>
  );
}
