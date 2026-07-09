import fs from "node:fs";
import path from "node:path";
import type { DetectedAgent } from "./types";
import { agentRoot } from "./config";

/**
 * Bundled detection (PRD §4.4). A skill is "bundled" if:
 *  (a) it lives under one of the agent's bundledDirs,
 *  (b) its name is listed in a bundled manifest (the agent's configured one, or
 *      a `.bundled_manifest` co-located in the skill's own skills dir), or
 *  (c) its name matches a skill the agent ships in a bundledNameDir — for
 *      active copies that live in the active skills dir (e.g. Hermes), where
 *      neither (a) nor a stale manifest (b) would catch them.
 *
 * Provenance for *managed* skills is authoritative from our DB; this only
 * classifies un-adopted, discovered occurrences.
 */
export function isBundled(
  agent: DetectedAgent,
  foundPath: string,
  name: string
): boolean {
  const root = agentRoot();
  // (a) physically located under one of the agent's bundled dirs.
  for (const bd of agent.bundledDirs ?? []) {
    const abs = path.resolve(path.join(root, bd));
    const resolved = path.resolve(foundPath);
    if (resolved === abs || resolved.startsWith(abs + path.sep)) return true;
  }
  // (b) named in a bundled manifest. We check two locations:
  //   1. the agent's configured manifest path (if any), and
  //   2. a `.bundled_manifest` co-located in the skill's OWN skills dir.
  // Hermes is the live example: its active skills live as real copies under
  // ~/.hermes/skills (NOT under hermes-agent/skills), and the authoritative
  // list of which ones are bundled is a `name:hash` file dropped right beside
  // them at ~/.hermes/skills/.bundled_manifest. Co-located detection is the
  // resilient model — the manifest travels with the skills it describes.
  const manifests = [
    ...(agent.bundledManifest ? [path.join(root, agent.bundledManifest)] : []),
    path.join(path.dirname(foundPath), ".bundled_manifest"),
  ];
  for (const m of manifests) {
    if (readManifestNames(m).has(name)) return true;
  }
  // (c) name matches a skill the agent ships in one of its bundled SOURCE dirs.
  // Active skills are real copies living in the active skills dir, so neither
  // the location check (a) nor a stale manifest (b) catches them — but a copy
  // of a bundled skill keeps its name.
  if (bundledSourceNames(agent, root).has(name)) return true;
  return false;
}

/** Subdirectory names found across the agent's bundled source dirs. */
function bundledSourceNames(agent: DetectedAgent, root: string): Set<string> {
  const out = new Set<string>();
  const dirs = [...(agent.bundledDirs ?? []), ...(agent.bundledNameDirs ?? [])];
  for (const bd of dirs) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(root, bd), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d of entries)
      if (d.isDirectory() && !d.name.startsWith(".")) out.add(d.name);
  }
  return out;
}

function readManifestNames(manifestPath: string): Set<string> {
  const out = new Set<string>();
  let raw: string;
  try {
    raw = fs.readFileSync(manifestPath, "utf8");
  } catch {
    return out;
  }
  // Manifests vary; accept JSON array, JSON object keys, or newline list.
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const x of parsed) {
        if (typeof x === "string") out.add(x);
        else if (x && typeof x === "object" && "name" in x)
          out.add(String((x as { name: unknown }).name));
      }
      return out;
    }
    if (parsed && typeof parsed === "object") {
      for (const k of Object.keys(parsed)) out.add(k);
      return out;
    }
  } catch {
    /* not JSON — fall through to line parsing */
  }
  // Newline list. Lines may be a bare name ("airtable") or "name:hash"
  // ("airtable:30f47a4b…") — Hermes uses the latter. Skill slugs never contain
  // ':' and hashes are hex, so the name is everything before the first colon.
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const colon = t.indexOf(":");
    out.add(colon >= 0 ? t.slice(0, colon).trim() : t);
  }
  return out;
}
