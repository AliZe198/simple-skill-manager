import { NextRequest } from "next/server";
import { handle, fail } from "@/lib/api";
import { loadConfig, saveConfig } from "@/lib/config";
import {
  setAgentLinkMode,
  setAgentSkillsDir,
  setAgentMcpConfig,
  ignoreAgent,
  unignoreAgent,
} from "@/lib/library";
import { checkAgentPath } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => loadConfig());
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body");
  }

  if (body.action === "setLinkMode") {
    const mode = body.mode === "copy" ? "copy" : "symlink";
    return handle(() => {
      setAgentLinkMode(String(body.agentId), mode);
      return loadConfig();
    });
  }

  if (body.action === "checkAgentPath") {
    return handle(() => checkAgentPath(String(body.path ?? "")));
  }

  if (body.action === "setAgentSkillsDir") {
    return handle(() => {
      setAgentSkillsDir(String(body.agentId), String(body.dir ?? ""));
      return loadConfig();
    });
  }

  if (body.action === "setAgentMcpConfig") {
    return handle(() => {
      setAgentMcpConfig(
        String(body.agentId),
        String(body.configPath ?? ""),
        String(body.format ?? "")
      );
      return loadConfig();
    });
  }

  if (body.action === "ignoreAgent") {
    return handle(() => {
      ignoreAgent(String(body.agentId), { cleanup: body.cleanup === true });
      return loadConfig();
    });
  }

  if (body.action === "unignoreAgent") {
    return handle(() => {
      unignoreAgent(String(body.agentId));
      return loadConfig();
    });
  }

  return handle(() =>
    saveConfig({
      theme: body.theme === "light" ? "light" : "dark",
      overrides: (body.overrides as Record<string, never>) ?? undefined,
    })
  );
}
