import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Simple Skill Manager is a personal, localhost-only tool with unauthenticated
// API routes that move files and run git. Two cheap guards keep it that way:
//
//  1. Host must be loopback. Blocks DNS-rebinding (a hostname re-pointed at
//     127.0.0.1) and any direct hit from another machine on the LAN.
//  2. If the request carries an Origin/Referer (i.e. it came from a page), that
//     page must itself be a loopback origin. Blocks CSRF from a malicious site.
//
// Only /api/* is guarded — page navigation is harmless (read-only HTML).

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostname(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  // Strip a trailing :port. IPv6 literals arrive bracketed ("[::1]:3000").
  if (hostHeader.startsWith("[")) return hostHeader.slice(0, hostHeader.indexOf("]") + 1);
  const colon = hostHeader.lastIndexOf(":");
  return colon === -1 ? hostHeader : hostHeader.slice(0, colon);
}

function isLoopbackOrigin(value: string | null): boolean {
  if (!value) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function middleware(req: NextRequest) {
  const host = hostname(req.headers.get("host"));
  if (!host || !LOOPBACK_HOSTS.has(host)) {
    return NextResponse.json(
      { ok: false, error: "Blocked: this app only accepts requests from localhost." },
      { status: 403 }
    );
  }

  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (origin && !isLoopbackOrigin(origin)) {
    return NextResponse.json(
      { ok: false, error: "Blocked: cross-site request rejected." },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
