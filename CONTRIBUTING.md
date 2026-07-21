# Contributing

Thanks for taking a look! This file covers running the app from a clone — see the
[README](README.md) if you just want to *use* it (`npx simple-skill-manager`).

## Setup

```bash
git clone https://github.com/AliZe198/simple-skill-manager.git
cd simple-skill-manager
npm install                 # builds native better-sqlite3 (prebuilt binaries in most cases)
```

## Run

```bash
npm run dev                 # hot reload, http://localhost:3000
npm run build && npm start  # production build, same port
```

Both scan your **real** home dir. The first launch is read-only and changes nothing,
but if you'd rather not point the app at your own files at all, use sandbox mode.

## Sandbox mode

A throwaway fake agent tree, so you can hack on the app without touching real files:

```bash
node scripts/build-sandbox.mjs        # builds a fake tree under .ssm-sandbox/
SSM_AGENT_ROOT="$PWD/.ssm-sandbox/home" \
SSM_DATA_DIR="$PWD/.ssm-sandbox/data" \
  npx next dev -p 3210
```

Both env vars are documented in [.env.example](.env.example); copy it to `.env.local`
to set them persistently.

## Checks

```bash
npm test          # unit + safety regression tests (vitest)
npm run typecheck # tsc --noEmit
npm run build     # production build
```

The tests under `src/lib/*.test.ts` include the safety guardrails — the rules that keep
writes inside `SSM_AGENT_ROOT` / `SSM_DATA_DIR` and stop symlink escapes. Please keep
them green, and add cases when you touch anything that writes to disk.

## Tech stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS · better-sqlite3 · SWR · Vitest
