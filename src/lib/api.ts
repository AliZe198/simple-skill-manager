import { NextResponse } from "next/server";

/** Standard JSON success/error envelope so the UI can show specific causes. */
export function ok<T>(data: T) {
  return NextResponse.json({ ok: true, data });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function handle<T>(fn: () => T | Promise<T>) {
  try {
    return ok(await fn());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(msg, 500);
  }
}
