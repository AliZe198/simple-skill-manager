"use client";

import { useState } from "react";
import { apiPost } from "@/lib/client";
import type { DetectedAgent, TrashedSkill } from "@/lib/types";
import { useLang } from "./LangProvider";
import { useToast } from "./Toast";
import { AgentLogo } from "./AgentLogo";
import { Button, EmptyState } from "./ui";
import { Modal } from "./Modal";

export function TrashPanel({
  items,
  agents,
  onChanged,
}: {
  items: TrashedSkill[];
  agents: DetectedAgent[];
  onChanged: () => void;
}) {
  const { t, lang } = useLang();
  const toast = useToast();
  const [busyHash, setBusyHash] = useState<string | null>(null);
  const [purging, setPurging] = useState<TrashedSkill | null>(null);
  const [confirmName, setConfirmName] = useState("");

  async function restore(item: TrashedSkill) {
    setBusyHash(item.contentHash);
    try {
      const result = await apiPost<{ failedAgentIds: string[] }>(
        "/api/skills/action",
        { action: "restoreTrash", hash: item.contentHash }
      );
      if (result.failedAgentIds.length) {
        toast(
          t("trash_restore_partial").replace(
            "{n}",
            String(result.failedAgentIds.length)
          ),
          "error"
        );
      } else {
        toast(t("trash_restored"), "success");
      }
      onChanged();
    } catch (e) {
      toast((e as Error).message || t("toast_error"), "error");
    } finally {
      setBusyHash(null);
    }
  }

  async function purge() {
    if (!purging || confirmName !== purging.name) return;
    setBusyHash(purging.contentHash);
    try {
      await apiPost("/api/skills/action", {
        action: "purgeTrash",
        hash: purging.contentHash,
      });
      toast(t("act_delete_perm"), "success");
      setPurging(null);
      setConfirmName("");
      onChanged();
    } catch (e) {
      toast((e as Error).message || t("toast_error"), "error");
    } finally {
      setBusyHash(null);
    }
  }

  if (items.length === 0) return <EmptyState text={t("trash_empty")} />;

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const busy = busyHash === item.contentHash;
        return (
          <div
            key={item.contentHash}
            className="flex flex-wrap items-center gap-3 rounded-bubble border-2 border-line/40 bg-content/60 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-extrabold text-ink-header">{item.name}</span>
                {!item.fileExists && (
                  <span className="badge bg-red-50 text-status-error-active">
                    {t("trash_files_missing")}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-ink-body">
                {item.description || "—"}
              </p>
              <p className="mt-1 text-[11px] text-ink-muted">
                {t("trash_deleted_at")} ·{" "}
                {new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-CA", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(item.deletedAt))}
              </p>
            </div>

            {item.previousAgentIds.length > 0 && (
              <div className="flex items-center gap-1.5" title={t("trash_prev_agents")}>
                {item.previousAgentIds.map((id) => {
                  const agent = agents.find((a) => a.id === id);
                  return (
                    <AgentLogo
                      key={id}
                      agentId={id}
                      label={agent?.label ?? id}
                      size="sm"
                    />
                  );
                })}
              </div>
            )}

            <div className="flex shrink-0 gap-2">
              <Button
                variant="primary"
                disabled={busy || !item.fileExists}
                onClick={() => restore(item)}
              >
                {t("act_restore")}
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => {
                  setPurging(item);
                  setConfirmName("");
                }}
              >
                {t("act_delete_perm")}
              </Button>
            </div>
          </div>
        );
      })}

      {purging && (
        <Modal
          title={`${t("confirm_purge_title")} · ${purging.name}`}
          onClose={() => {
            setPurging(null);
            setConfirmName("");
          }}
        >
          <p className="mb-3 text-sm leading-relaxed text-ink-body">
            {t("confirm_purge_body")}
          </p>
          <input
            className="input w-full"
            autoFocus
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") purge();
            }}
            placeholder={purging.name}
          />
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setPurging(null);
                setConfirmName("");
              }}
            >
              {t("act_cancel")}
            </Button>
            <Button
              variant="danger"
              disabled={confirmName !== purging.name || busyHash === purging.contentHash}
              onClick={purge}
            >
              {t("act_delete_perm")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
