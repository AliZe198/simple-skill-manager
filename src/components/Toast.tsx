"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const Ctx = createContext<{
  toast: (message: string, kind?: ToastKind) => void;
} | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback(
    (id: number) => setToasts((t) => t.filter((x) => x.id !== id)),
    []
  );

  const toast = useCallback(
    (message: string, kind: ToastKind = "success") => {
      const id = ++counter;
      setToasts((t) => [...t, { id, kind, message }]);
      // Errors carry the important detail and are often long — keep them up
      // much longer than success/info, and let a click dismiss any of them.
      const ms = kind === "error" ? 12000 : 3500;
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss]
  );

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            title="Dismiss"
            className={
              "cursor-pointer whitespace-pre-wrap break-words rounded-bubble border-2 px-4 py-3 text-left text-sm font-bold shadow-feature animate-[slidein_.2s_ease] " +
              (t.kind === "success"
                ? "bg-mint-light border-mint text-mint-active"
                : t.kind === "error"
                ? "bg-red-50 border-status-error text-status-error-active"
                : "bg-content border-line text-ink-body")
            }
          >
            {t.kind === "success" ? "🌿 " : t.kind === "error" ? "🍂 " : "🐾 "}
            {t.message}
          </button>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx.toast;
}
