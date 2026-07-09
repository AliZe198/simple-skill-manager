"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="text-6xl">🍂</div>
      <h2 className="text-xl font-extrabold text-ink-header">Something went wrong</h2>
      <p className="max-w-lg break-words font-mono text-xs text-ink-muted">
        {error.message}
      </p>
      <button
        onClick={reset}
        className="btn btn-primary"
      >
        🔄 Retry
      </button>
    </div>
  );
}
