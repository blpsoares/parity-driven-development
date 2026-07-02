// PDD 2.0 — update checker. Lets users know when a newer version is available.
// Pure helpers (version compare, notice, cache decisions) are unit-tested; the
// network fetch + cache IO are best-effort and fail silently (offline-safe).

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const PLUGIN_JSON_URL =
  "https://raw.githubusercontent.com/blpsoares/parity-driven-development/main/.claude-plugin/plugin.json";
const CACHE_FILE = join(homedir(), ".pdd", "update-check.json");
const DAY_MS = 24 * 60 * 60 * 1000;

export interface UpdateCache {
  checkedAt: string; // ISO
  latest: string; // last-seen latest version
}

/** Parse "x.y.z" into numeric parts (missing/garbage → 0). */
export function parseVersion(v: string): number[] {
  return (v || "").split(".").map((n) => parseInt(n, 10) || 0);
}

/** -1 / 0 / 1 comparing two semver-ish strings by major.minor.patch. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function isNewer(latest: string, installed: string): boolean {
  return compareVersions(latest, installed) > 0;
}

/** Read the installed version from the plugin manifest at the repo root. */
export function readInstalledVersion(pluginRoot: string): string {
  try {
    const j = JSON.parse(
      readFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8"),
    );
    return j.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** The one-line notice shown when an update exists, or null when up to date. */
export function formatNotice(installed: string, latest: string): string | null {
  if (!isNewer(latest, installed)) return null;
  return `🔔 PDD ${latest} available (you have ${installed}) — run 'pdd update'`;
}

/** True when the cache is missing or older than a day. */
export function cacheIsStale(cache: UpdateCache | null, now: number): boolean {
  if (!cache) return true;
  const t = Date.parse(cache.checkedAt);
  return Number.isNaN(t) || now - t > DAY_MS;
}

export function readCache(): UpdateCache | null {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf8")) as UpdateCache;
  } catch {
    return null;
  }
}

export function writeCache(latest: string, now: number): void {
  try {
    mkdirSync(dirname(CACHE_FILE), { recursive: true });
    writeFileSync(
      CACHE_FILE,
      JSON.stringify({ checkedAt: new Date(now).toISOString(), latest }),
    );
  } catch {
    // Best-effort — a read-only home shouldn't break the dashboard.
  }
}

/** Fetch the latest published version (best-effort; null on any failure). */
export async function fetchLatest(timeoutMs = 2500): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(PLUGIN_JSON_URL, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const j = (await res.json()) as { version?: string };
    return j.version ?? null;
  } catch {
    return null;
  }
}

/** Notice from the cached result only — never blocks, never fetches. */
export function cachedNotice(pluginRoot: string): string | null {
  if (process.env.PDD_NO_UPDATE_CHECK === "1") return null;
  const cache = readCache();
  if (!cache) return null;
  return formatNotice(readInstalledVersion(pluginRoot), cache.latest);
}

/** Refresh the cache in the background if stale (fire-and-forget). */
export function refreshCacheIfStale(now: number): void {
  if (process.env.PDD_NO_UPDATE_CHECK === "1") return;
  if (!cacheIsStale(readCache(), now)) return;
  void fetchLatest().then((v) => {
    if (v) writeCache(v, now);
  });
}

/** Explicit synchronous-feeling check (awaited). Returns a human message. */
export async function checkNow(pluginRoot: string, now: number): Promise<string> {
  const installed = readInstalledVersion(pluginRoot);
  const latest = await fetchLatest(5000);
  if (!latest) return `Could not reach the update server. You have PDD ${installed}.`;
  writeCache(latest, now);
  return isNewer(latest, installed)
    ? formatNotice(installed, latest)!
    : `PDD is up to date (${installed}).`;
}
