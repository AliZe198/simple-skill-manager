#!/usr/bin/env node
// Simple Skill Manager — npx launcher.
//
//   npx simple-skill-manager               # run against your real $HOME (port 3000)
//   npx simple-skill-manager --sandbox     # try safely on fake data (port 3210)
//   npx simple-skill-manager --port 4000
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(pkgRoot, "package.json"));
const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8"));

// ---------- args ----------
const argv = process.argv.slice(2);
let sandbox = false;
let port = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--sandbox") sandbox = true;
  else if (a === "--port" || a === "-p") port = Number(argv[++i]);
  else if (a.startsWith("--port=")) port = Number(a.slice(7));
  else if (a === "--version" || a === "-v") {
    console.log(pkg.version);
    process.exit(0);
  } else if (a === "--help" || a === "-h") {
    console.log(`Simple Skill Manager ${pkg.version}

Usage:
  npx simple-skill-manager               run against your real home dir (port 3000)
  npx simple-skill-manager --sandbox     safe trial on a fake agent tree (port 3210)
  npx simple-skill-manager --port 4000   pick a port

The server listens on 127.0.0.1 only (not reachable from your network).
Stop with Ctrl+C.`);
    process.exit(0);
  } else {
    console.error(`Unknown option: ${a} (try --help)`);
    process.exit(1);
  }
}
if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) {
  console.error("Invalid --port value.");
  process.exit(1);
}
if (port === null) port = sandbox ? 3210 : 3000;

// ---------- helpers ----------
function portFree(p) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(p, "127.0.0.1");
  });
}

async function pickPort(start) {
  for (let p = start; p < start + 20; p++) {
    if (await portFree(p)) {
      if (p !== start) console.log(`Port ${start} is busy — using ${p} instead.`);
      return p;
    }
  }
  console.error(`No free port found near ${start}. Pass one with --port.`);
  process.exit(1);
}

function nextBin() {
  try {
    return require.resolve("next/dist/bin/next");
  } catch {
    console.error("Could not find Next.js — the package seems broken. Try reinstalling.");
    process.exit(1);
  }
}

// ---------- sandbox ----------
const env = { ...process.env };
if (sandbox) {
  const base = path.join(os.tmpdir(), `ssm-sandbox-${os.userInfo().username}`);
  const r = spawnSync(
    process.execPath,
    [path.join(pkgRoot, "scripts", "build-sandbox.mjs"), base],
    { stdio: "inherit" }
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
  env.SSM_AGENT_ROOT = path.join(base, "home");
  env.SSM_DATA_DIR = path.join(base, "data");
}

// ---------- build check (npx from git builds via prepare; npm package ships .next) ----------
if (!fs.existsSync(path.join(pkgRoot, ".next", "BUILD_ID"))) {
  console.log("First run: building the app (one-time, takes a minute)…");
  const r = spawnSync(process.execPath, [nextBin(), "build"], {
    cwd: pkgRoot,
    stdio: "inherit",
    env,
  });
  if (r.status !== 0) {
    console.error("Build failed — see the output above.");
    process.exit(r.status ?? 1);
  }
}

// ---------- start ----------
const finalPort = await pickPort(port);
console.log(
  sandbox
    ? `\n🏝️  Simple Skill Manager (SANDBOX — fake data, your real files are untouched)`
    : `\n🏝️  Simple Skill Manager (scanning your real home: ${os.homedir()})`
);
console.log(`    http://localhost:${finalPort}\n    Stop with Ctrl+C.\n`);

const child = spawn(
  process.execPath,
  [nextBin(), "start", "-p", String(finalPort), "-H", "127.0.0.1"],
  { cwd: pkgRoot, stdio: "inherit", env }
);
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
