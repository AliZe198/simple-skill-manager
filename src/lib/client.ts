"use client";

import useSWR from "swr";
import type { DetectedAgent, SkillRow, TrashedSkill, McpServer, McpFormat } from "./types";

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export const fetcher = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  const json = (await res.json()) as Envelope<T>;
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json.data as T;
};

export async function apiPost<T>(
  url: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Envelope<T>;
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json.data as T;
}

/**
 * Scanning re-hashes skill dirs on every request, so we do NOT revalidate on
 * window focus (that re-hashed everything on every alt-tab). A 重新扫描/Rescan
 * button gives explicit control instead.
 */
export const swrOpts = { revalidateOnFocus: false } as const;

/**
 * Order tag names by a saved preference list: tags listed in `order` come first
 * (in that order), the rest follow in their given order. Missing/stale entries
 * in `order` are ignored. Shared by the tag manager (自定义 sort) and the
 * add-tag popup so both honor the same user-defined order.
 */
export function orderTagNames(names: string[], order: string[]): string[] {
  const have = new Set(names);
  const inOrder = new Set(order);
  return [
    ...order.filter((t) => have.has(t)),
    ...names.filter((n) => !inOrder.has(n)),
  ];
}

export function useSkills() {
  return useSWR<SkillRow[]>("/api/skills", fetcher, swrOpts);
}

export function useAgents() {
  return useSWR<DetectedAgent[]>("/api/agents", fetcher, swrOpts);
}

export function useTrash() {
  return useSWR<TrashedSkill[]>("/api/skills/trash", fetcher, swrOpts);
}

export interface McpEntry {
  agentId: string;
  label: string;
  configPath: string | null;
  exists: boolean;
  format?: McpFormat;
  servers: McpServer[];
  error?: string;
}

export function useMcp(reveal?: string) {
  const url = reveal ? `/api/mcp?reveal=${encodeURIComponent(reveal)}` : "/api/mcp";
  return useSWR<McpEntry[]>(url, fetcher, swrOpts);
}
