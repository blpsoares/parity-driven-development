// PDD 2.0 — tests for the update checker (pure helpers only).

import { test, expect } from "bun:test";
import {
  parseVersion,
  compareVersions,
  isNewer,
  formatNotice,
  cacheIsStale,
} from "./update";

test("compareVersions orders semver-ish strings", () => {
  expect(compareVersions("2.1.0", "2.0.0")).toBe(1);
  expect(compareVersions("2.0.0", "2.1.0")).toBe(-1);
  expect(compareVersions("2.1.0", "2.1.0")).toBe(0);
  expect(compareVersions("2.10.0", "2.9.0")).toBe(1); // numeric, not lexical
  expect(parseVersion("2.1.0")).toEqual([2, 1, 0]);
});

test("isNewer only true when latest > installed", () => {
  expect(isNewer("2.1.0", "2.0.0")).toBe(true);
  expect(isNewer("2.0.0", "2.0.0")).toBe(false);
  expect(isNewer("1.9.0", "2.0.0")).toBe(false);
});

test("formatNotice returns a message only when outdated", () => {
  expect(formatNotice("2.0.0", "2.1.0")).toContain("2.1.0 available");
  expect(formatNotice("2.1.0", "2.1.0")).toBeNull();
});

test("cacheIsStale is true when missing or older than a day", () => {
  const now = Date.parse("2026-07-02T12:00:00Z");
  expect(cacheIsStale(null, now)).toBe(true);
  expect(cacheIsStale({ checkedAt: "2026-07-02T11:00:00Z", latest: "2.1.0" }, now)).toBe(false);
  expect(cacheIsStale({ checkedAt: "2026-07-01T00:00:00Z", latest: "2.1.0" }, now)).toBe(true);
});
