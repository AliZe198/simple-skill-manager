"use client";

import { Modal } from "./Modal";
import { Button } from "./ui";
import { useLang } from "./LangProvider";

/** Themed replacement for native confirm() — used for destructive actions. */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger = true,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useLang();
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="mb-5 whitespace-pre-line text-sm text-ink-body">{body}</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("act_cancel")}
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          autoFocus
          onClick={onConfirm}
        >
          {confirmLabel ?? t("act_confirm")}
        </Button>
      </div>
    </Modal>
  );
}
