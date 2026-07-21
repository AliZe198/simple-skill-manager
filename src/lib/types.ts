// Shared domain types for Simple Skill Manager.

export type Provenance =
  | "self-authored"
  | "downloaded"
  | "bundled"
  | "unknown";

export type TargetMode = "symlink" | "copy";
export type TargetStatus = "ok" | "stale" | "error" | "missing";

/** How a skill physically appears inside one agent's skills dir. */
export type OccurrenceKind =
  | "symlink-to-library" // managed by us: symlink → central library
  | "symlink-external" // symlink pointing somewhere else
  | "real-dir" // a real, un-adopted copy
  | "copy-of-library"; // a copy we wrote (copy-mode agent)

export interface AgentConfig {
  id: string;
  label: string;
  /** Candidate dirs (relative to agent root) that hold "my" skills. */
  skillsDirs: string[];
  /** Dirs whose contents are bundled-with-the-agent (for provenance). */
  bundledDirs: string[];
  /**
   * Dirs whose subdirectory NAMES mark bundled skills, used for classification
   * only (NOT scanned as occurrences). An agent's active skills are real copies
   * of these; we match by name so an active copy is recognized as bundled even
   * though it physically lives in the active skills dir. Keeps source-only
   * skills from cluttering Discover as separate rows.
   */
  bundledNameDirs?: string[];
  /** Optional manifest file listing bundled skills (e.g. Hermes). */
  bundledManifest?: string;
  /** Whether this agent loads symlinks. Probe-confirmed; default. */
  linkMode: TargetMode;
  mcpConfigPath?: string;
  mcpConfigFormat?: McpFormat;
}

export interface DetectedAgent extends AgentConfig {
  detected: boolean;
  /** User chose to hide this agent (e.g. uninstalled app, leftover dir). */
  ignored: boolean;
  /** Absolute, resolved skills dirs that actually exist. */
  resolvedSkillsDirs: string[];
}

export type McpFormat =
  | "json-claude"
  | "toml-codex"
  | "json-gemini"
  | "json-kimi"
  | "json-openclaw-mcporter"
  | "yaml-hermes";

/** One physical appearance of a skill inside one agent dir (from a scan). */
export interface Occurrence {
  agentId: string;
  foundPath: string; // absolute path of the skill dir
  kind: OccurrenceKind;
  linkTarget?: string; // for symlinks, the resolved target
  bundled: boolean;
}

/** A logical skill: one row in the deduped overview. Keyed by contentHash. */
export interface SkillRow {
  id: string; // stable id (= contentHash short, or db id)
  name: string;
  description: string;
  contentHash: string;
  /** Non-null once adopted into the central library. */
  centralPath: string | null;
  provenance: Provenance;
  gitUrl?: string;
  /**
   * Install-source repo slug (owner/repo) from the `skills` CLI lock file,
   * when known. Skills sharing a source form a 套件 (suite) in the UI.
   */
  source?: string;
  tags: string[];
  /** Every place this skill currently appears across agents. */
  occurrences: Occurrence[];
  /** Agents that currently have an active target for this skill. */
  activeAgentIds: string[];
  /** True if in library with zero active targets (parking lot). */
  parked: boolean;
  adopted: boolean;
  /**
   * True when the library copy's content has been edited since it was adopted,
   * so the recorded hash (and any copy-mode agent copies) are now stale and
   * need a re-sync. Symlink targets follow the library automatically; copies do
   * not, which is what this flag surfaces. Only meaningful for adopted skills.
   */
  localChanged?: boolean;
}

export interface SkillTarget {
  skillId: string;
  agentId: string;
  targetPath: string;
  mode: TargetMode;
  syncedAt?: number;
  sourceHash?: string;
  status: TargetStatus;
}

export interface McpServer {
  name: string;
  command?: string;
  args: string[];
  env: Record<string, string>;
  agentId: string;
  configPath: string;
  enabled: boolean;
  raw?: unknown;
}

export interface AppConfig {
  agentRoot: string;
  dataDir: string;
  libraryDir: string;
  /** True when agentRoot is the real home dir (vs a sandbox via SSM_AGENT_ROOT). */
  isRealHome: boolean;
  /** Per-agent path / linkMode overrides. */
  overrides: Record<string, Partial<AgentConfig>>;
  /** Agents the user chose to hide (uninstalled apps, leftover dirs). */
  ignoredAgents: string[];
  /** Tags the user created in the tag manager but not yet put on any skill. */
  knownTags: string[];
  /** User-defined tag order (drives the manager's 自定义 sort + the add-tag popup). */
  tagOrder: string[];
  theme: "dark" | "light";
}
