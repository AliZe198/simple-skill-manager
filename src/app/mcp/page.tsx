"use client";

import { useMemo, useState } from "react";
import { useMcp } from "@/lib/client";
import { useLang } from "@/components/LangProvider";
import { Spinner, EmptyState, ErrorState } from "@/components/ui";
import type { McpServer } from "@/lib/types";

export default function McpPage() {
  const { t } = useLang();
  const [view, setView] = useState<"agent" | "server">("agent");
  const [reveal, setReveal] = useState<string>("");
  const { data, error, isLoading, mutate } = useMcp(reveal);

  const entries = data ?? [];

  // by-server inverse index
  const byServer = useMemo(() => {
    const map = new Map<string, { server: McpServer; agents: string[] }>();
    for (const e of entries) {
      for (const s of e.servers) {
        const k = s.name;
        const got = map.get(k);
        if (got) got.agents.push(e.label);
        else map.set(k, { server: s, agents: [e.label] });
      }
    }
    return [...map.values()];
  }, [entries]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-header">
            🔌 {t("nav_mcp")}
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">{t("mcp_readonly")}</p>
        </div>
        <div className="flex gap-1 rounded-pill border-2 border-line/40 bg-content p-1">
          {(["agent", "server"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={
                "rounded-pill px-4 py-1.5 text-sm font-bold transition-colors " +
                (view === v ? "bg-mint text-white" : "text-ink-secondary")
              }
            >
              {v === "agent" ? t("mcp_by_agent") : t("mcp_by_server")}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <ErrorState message={(error as Error).message} onRetry={() => mutate()} />
      ) : isLoading ? (
        <Spinner />
      ) : view === "agent" ? (
        <div className="flex flex-col gap-5">
          {entries.map((e) => (
            <div key={e.agentId} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold text-ink-header">
                  {e.label}
                </h2>
                <span className="break-all font-mono text-xs text-ink-disabled">
                  {e.configPath}
                </span>
                {e.format && (
                  <span className="badge bg-stone-100 text-ink-muted">
                    {e.format}
                  </span>
                )}
              </div>
              {!e.exists ? (
                <p className="text-sm text-ink-disabled">{t("mcp_no_config")}</p>
              ) : e.error ? (
                <p className="text-sm text-status-error-active">⚠️ {e.error}</p>
              ) : e.servers.length === 0 ? (
                <p className="text-sm text-ink-disabled">—</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {e.servers.map((s) => (
                    <McpCard
                      key={`${e.agentId}:${s.name}`}
                      server={s}
                      revealed={reveal === `${e.agentId}:${s.name}`}
                      onToggleReveal={() =>
                        setReveal((r) =>
                          r === `${e.agentId}:${s.name}`
                            ? ""
                            : `${e.agentId}:${s.name}`
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : byServer.length === 0 ? (
        <EmptyState text={t("mcp_no_config")} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {byServer.map(({ server, agents }) => (
            <div key={server.name} className="card">
              <h3 className="text-base font-extrabold text-ink-header">
                {server.name}
              </h3>
              <p className="mt-1 font-mono text-xs text-ink-muted">
                {server.command} {server.args.join(" ")}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {agents.map((a) => (
                  <span key={a} className="badge bg-mint-light text-mint-active">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function McpCard({
  server,
  revealed,
  onToggleReveal,
}: {
  server: McpServer;
  revealed: boolean;
  onToggleReveal: () => void;
}) {
  const { t } = useLang();
  const envKeys = Object.keys(server.env);
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-extrabold text-ink-header">
          {server.name}
        </h3>
        {!server.enabled && (
          <span className="badge bg-stone-100 text-ink-muted">
            {t("mcp_disabled")}
          </span>
        )}
      </div>
      <p className="font-mono text-xs text-ink-muted">
        {server.command} {server.args.join(" ")}
      </p>
      {envKeys.length > 0 && (
        <div className="rounded-bubble bg-white/60 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-bold text-ink-secondary">env</span>
            <button
              onClick={onToggleReveal}
              className="text-xs font-bold text-mint-active hover:underline"
            >
              {revealed ? `🙈 ${t("act_hide")}` : `👁 ${t("act_reveal")}`}
            </button>
          </div>
          {envKeys.map((k) => (
            <div key={k} className="font-mono text-[11px] text-ink-body">
              <span className="text-ink-muted">{k}</span>=
              <span className={revealed ? "text-status-error-active" : ""}>
                {server.env[k]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
