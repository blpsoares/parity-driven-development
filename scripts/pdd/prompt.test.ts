// PDD 2.0 — tests for the interactive prompt core (pure functions only).

import { test, expect } from "bun:test";
import { parseMenuKey, reduceMenu, renderMenu, type MenuState } from "./prompt";

test("parseMenuKey maps arrows, space, all, enter and cancel", () => {
  expect(parseMenuKey("\x1b[A")).toBe("up");
  expect(parseMenuKey("\x1b[B")).toBe("down");
  expect(parseMenuKey(" ")).toBe("space");
  expect(parseMenuKey("a")).toBe("all");
  expect(parseMenuKey("\r")).toBe("enter");
  expect(parseMenuKey("\x1b")).toBe("cancel");
  expect(parseMenuKey("x")).toBe("");
});

test("reduceMenu moves the cursor with wraparound", () => {
  let s: MenuState = { cursor: 0, checked: new Set() };
  s = reduceMenu(s, "up", 3, true); // wraps to last
  expect(s.cursor).toBe(2);
  s = reduceMenu(s, "down", 3, true); // wraps to first
  expect(s.cursor).toBe(0);
});

test("reduceMenu toggles checkboxes and select-all in multi mode", () => {
  let s: MenuState = { cursor: 1, checked: new Set() };
  s = reduceMenu(s, "space", 3, true);
  expect(s.checked.has(1)).toBe(true);
  s = reduceMenu(s, "all", 3, true);
  expect(s.checked.size).toBe(3);
  s = reduceMenu(s, "all", 3, true); // toggles all off
  expect(s.checked.size).toBe(0);
});

test("reduceMenu ignores space/all in single-select mode", () => {
  let s: MenuState = { cursor: 0, checked: new Set() };
  s = reduceMenu(s, "space", 3, false);
  expect(s.checked.size).toBe(0);
});

test("renderMenu shows checkboxes, the cursor and a hint line", () => {
  const s: MenuState = { cursor: 0, checked: new Set([0]) };
  const frame = renderMenu("Pick", [{ label: "codex", hint: "detected" }, { label: "gemini" }], s, true);
  expect(frame).toContain("codex");
  expect(frame).toContain("detected");
  expect(frame).toContain("space toggle");
});
