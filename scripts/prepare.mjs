// npm "prepare" hook: make sure a production build exists.
// Runs after `npm install` in a dev checkout and when installing straight
// from git (e.g. `npx github:AliZe198/simple-skill-manager`). Skips when a
// build is already present so local installs stay fast; `npm publish` always
// rebuilds via "prepack".
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(path.join(pkgRoot, ".next", "BUILD_ID"))) process.exit(0);

const require = createRequire(path.join(pkgRoot, "package.json"));
let nextBin;
try {
  nextBin = require.resolve("next/dist/bin/next");
} catch {
  // Dependencies not installed yet (e.g. bare checkout) — nothing to do.
  process.exit(0);
}
const r = spawnSync(process.execPath, [nextBin, "build"], {
  cwd: pkgRoot,
  stdio: "inherit",
});
process.exit(r.status ?? 1);
