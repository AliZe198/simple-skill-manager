"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Accessible modal shell: role=dialog, aria-modal, labelled title, Escape to
 * close, backdrop click to close.
 *
 * Rendered via a portal to <body>. This matters: cards use a transform on
 * hover (card-hover), and a transformed ancestor re-anchors position:fixed
 * descendants — which made the modal jitter when it lived inside a card.
 */
const SIZES = {
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  /** Reading/workspace dialog: near-fullscreen, content manages its own panes. */
  full: "max-w-6xl",
} as const;

export function Modal({
  title,
  onClose,
  children,
  size = "md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: keyof typeof SIZES;
}) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Lock background scroll while the modal is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-header/30 p-4"
      onClick={(e) => {
        // Portals bubble through the React tree, so an unstopped backdrop click
        // would also reach the card that opened this modal and reopen it.
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={
          "flex max-h-[88vh] w-full flex-col overflow-hidden rounded-card border-2 border-line/40 bg-content p-6 shadow-feature " +
          SIZES[size]
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2
            id={titleId}
            className="min-w-0 break-words text-xl font-extrabold text-ink-header"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-2xl leading-none text-ink-muted transition-colors hover:bg-line/20 hover:text-ink-header"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
