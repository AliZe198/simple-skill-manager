import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";
import YAML from "yaml";
import { agentRoot } from "./config";
import { detectAgents } from "./agents";
import type { DetectedAgent, McpFormat, McpServer } from "./types";

/**
 * READ-ONLY MCP overview. Parses six config shapes across three file
 * formats; never writes. env values are returned in full here — masking is the
 * API/UI layer's job (so "reveal" can show the real value on click).
 */

function safeExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export function readAllMcp(): {
  agentId: string;
  label: string;
  configPath: string | null;
  exists: boolean;
  format?: McpFormat;
  servers: McpServer[];
  error?: string;
}[] {
  return detectAgents()
    .filter((a) => a.mcpConfigPath && a.mcpConfigFormat)
    .map((agent) => {
      const configPath = path.join(agentRoot(), agent.mcpConfigPath!);
      const exists = safeExists(configPath);
      if (!exists) {
        return {
          agentId: agent.id,
          label: agent.label,
          configPath,
          exists: false,
          format: agent.mcpConfigFormat,
          servers: [],
        };
      }
      try {
        const servers = parseMcpFile(agent, configPath);
        return {
          agentId: agent.id,
          label: agent.label,
          configPath,
          exists: true,
          format: agent.mcpConfigFormat,
          servers,
        };
      } catch (e) {
        return {
          agentId: agent.id,
          label: agent.label,
          configPath,
          exists: true,
          format: agent.mcpConfigFormat,
          servers: [],
          error: (e as Error).message,
        };
      }
    });
}

function parseMcpFile(
  agent: DetectedAgent,
  configPath: string
): McpServer[] {
  const raw = fs.readFileSync(configPath, "utf8");
  switch (agent.mcpConfigFormat) {
    case "json-claude":
    case "json-gemini":
    case "json-kimi":
      return fromStandardJson(JSON.parse(raw), agent.id, configPath);
    case "json-openclaw-mcporter":
      return fromOpenClaw(JSON.parse(raw), agent.id, configPath);
    case "toml-codex":
      return fromCodexToml(TOML.parse(raw), agent.id, configPath);
    case "yaml-hermes":
      return fromHermesYaml(YAML.parse(raw), agent.id, configPath);
    default:
      return [];
  }
}

/* --- normalizers -------------------------------------------------------- */

type AnyObj = Record<string, unknown>;

function asObj(v: unknown): AnyObj {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyObj) : {};
}
function asArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}
function asEnv(v: unknown): Record<string, string> {
  const o = asObj(v);
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(o)) out[k] = String(val);
  return out;
}
function isObjLike(v: unknown): boolean {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
/** A server is disabled if it carries either disabled:true OR enabled:false. */
function isEnabled(d: AnyObj): boolean {
  return !(d.disabled === true || d.enabled === false);
}

/** Claude / Gemini / Kimi: `{ mcpServers: { name: {command,args,env} } }`. */
function fromStandardJson(
  json: unknown,
  agentId: string,
  configPath: string
): McpServer[] {
  const root = asObj(json);
  const servers = asObj(root.mcpServers ?? root.servers);
  return Object.entries(servers)
    .filter(([, def]) => isObjLike(def))
    .map(([name, def]) => {
      const d = asObj(def);
      return {
        name,
        command: typeof d.command === "string" ? d.command : undefined,
        args: asArr(d.args),
        env: asEnv(d.env),
        agentId,
        configPath,
        enabled: isEnabled(d),
        raw: def,
      };
    });
}

/** OpenClaw non-standard `mcporter` block. */
function fromOpenClaw(
  json: unknown,
  agentId: string,
  configPath: string
): McpServer[] {
  const root = asObj(json);
  // Tolerate either { mcporter: { servers: {...} } } or { mcporter: {...} }
  const mcporter = asObj(root.mcporter);
  const servers = asObj(mcporter.servers ?? mcporter.mcpServers ?? mcporter);
  return Object.entries(servers)
    .filter(([, def]) => def && typeof def === "object")
    .map(([name, def]) => {
      const d = asObj(def);
      return {
        name,
        command: typeof d.command === "string" ? d.command : undefined,
        args: asArr(d.args),
        env: asEnv(d.env),
        agentId,
        configPath,
        enabled: isEnabled(d),
        raw: def,
      };
    });
}

/** Codex TOML: `[mcp_servers.NAME]` tables. */
function fromCodexToml(
  toml: unknown,
  agentId: string,
  configPath: string
): McpServer[] {
  const root = asObj(toml);
  const servers = asObj(root.mcp_servers ?? root.mcpServers);
  return Object.entries(servers).map(([name, def]) => {
    const d = asObj(def);
    return {
      name,
      command: typeof d.command === "string" ? d.command : undefined,
      args: asArr(d.args),
      env: asEnv(d.env),
      agentId,
      configPath,
      enabled: isEnabled(d),
      raw: def,
    };
  });
}

/** Hermes YAML: `mcp_servers:` mapping or list. */
function fromHermesYaml(
  yaml: unknown,
  agentId: string,
  configPath: string
): McpServer[] {
  const root = asObj(yaml);
  const block = root.mcp_servers ?? root.mcpServers;
  if (Array.isArray(block)) {
    return block.map((def, i) => {
      const d = asObj(def);
      return {
        name: typeof d.name === "string" ? d.name : `server-${i}`,
        command: typeof d.command === "string" ? d.command : undefined,
        args: asArr(d.args),
        env: asEnv(d.env),
        agentId,
        configPath,
        enabled: isEnabled(d),
        raw: def,
      };
    });
  }
  const servers = asObj(block);
  return Object.entries(servers).map(([name, def]) => {
    const d = asObj(def);
    return {
      name,
      command: typeof d.command === "string" ? d.command : undefined,
      args: asArr(d.args),
      env: asEnv(d.env),
      agentId,
      configPath,
      enabled: isEnabled(d),
      raw: def,
    };
  });
}

/* --- env masking ---------------------------------------------- */

/** Mask a secret-looking value: keep a hint of the prefix, star the rest. */
export function maskValue(v: string): string {
  if (!v) return v;
  if (v.length <= 6) return "••••";
  return `${v.slice(0, 3)}••••${v.slice(-2)}`;
}

export function maskServer(s: McpServer): McpServer {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(s.env)) env[k] = maskValue(v);
  return { ...s, env, raw: undefined };
}
