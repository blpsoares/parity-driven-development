// PDD 2.0 — minimal interactive selectors (arrow-key), specify-init style.
// The key parser, reducer and menu renderer are PURE (unit-tested); runMenu is
// the thin raw-stdin shell. Zero external dependencies.

const ESC = "\x1b[";
const R = `${ESC}0m`;
const c = {
  bold: (s: string) => `${ESC}1m${s}${R}`,
  dim: (s: string) => `${ESC}2m${s}${R}`,
  cyan: (s: string) => `${ESC}36m${s}${R}`,
  green: (s: string) => `${ESC}32m${s}${R}`,
};

export interface MenuItem {
  label: string;
  hint?: string;
}

export interface MenuState {
  cursor: number;
  checked: Set<number>;
}

export type MenuKey = "up" | "down" | "space" | "all" | "enter" | "cancel" | "";

/** Map a raw stdin chunk to a canonical menu key. */
export function parseMenuKey(data: string): MenuKey {
  switch (data) {
    case "\x1b[A":
    case "k":
      return "up";
    case "\x1b[B":
    case "j":
      return "down";
    case " ":
      return "space";
    case "a":
      return "all";
    case "\r":
    case "\n":
      return "enter";
    case "\x1b":
    case "q":
    case "\x03":
      return "cancel";
    default:
      return "";
  }
}

/** Apply a key to the menu state (pure). `multi` enables checkboxes. */
export function reduceMenu(
  s: MenuState,
  key: MenuKey,
  count: number,
  multi: boolean,
): MenuState {
  if (count === 0) return s;
  const checked = new Set(s.checked);
  let cursor = s.cursor;
  switch (key) {
    case "up":
      cursor = (cursor - 1 + count) % count;
      break;
    case "down":
      cursor = (cursor + 1) % count;
      break;
    case "space":
      if (multi) (checked.has(cursor) ? checked.delete(cursor) : checked.add(cursor));
      break;
    case "all":
      if (multi) {
        if (checked.size === count) checked.clear();
        else for (let i = 0; i < count; i++) checked.add(i);
      }
      break;
    default:
      break;
  }
  return { cursor, checked };
}

/** Wrap a title in a heavy box-drawing frame, centered, min 40 cols wide. */
function frameTitle(title: string): string {
  const width = Math.max(40, title.length + 4);
  const pad = width - title.length;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return [
    "┏" + "━".repeat(width) + "┓",
    "┃" + " ".repeat(left) + title + " ".repeat(right) + "┃",
    "┗" + "━".repeat(width) + "┛",
  ].join("\n");
}

/** Render the menu frame (pure). */
export function renderMenu(
  title: string,
  items: MenuItem[],
  s: MenuState,
  multi: boolean,
): string {
  const lines = [c.bold(frameTitle(title)), ""];
  items.forEach((it, i) => {
    const pointer = i === s.cursor ? c.cyan("❯") : " ";
    const box = multi
      ? s.checked.has(i)
        ? c.green("◉")
        : "◯"
      : i === s.cursor
        ? c.green("◉")
        : "◯";
    const label = i === s.cursor ? c.bold(it.label) : it.label;
    lines.push(`  ${pointer} ${box} ${label}${it.hint ? c.dim("  " + it.hint) : ""}`);
  });
  lines.push("");
  lines.push(
    c.dim(
      multi
        ? "  ↑/↓ move · space toggle · a all · enter confirm · esc cancel"
        : "  ↑/↓ move · enter select · esc cancel",
    ),
  );
  return lines.join("\n");
}

/**
 * Run an interactive menu. Resolves to the chosen indices (single = one index,
 * multi = the checked set), or `null` if the user cancels / there is no TTY.
 */
export function runMenu(
  title: string,
  items: MenuItem[],
  opts: { multi: boolean; preChecked?: number[]; cursor?: number },
): Promise<number[] | null> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      resolve(null);
      return;
    }
    let s: MenuState = {
      cursor: opts.cursor ?? 0,
      checked: new Set(opts.preChecked ?? []),
    };
    const draw = () =>
      process.stdout.write("\x1b[2J\x1b[H" + renderMenu(title, items, s, opts.multi) + "\n");
    const cleanup = () => {
      try {
        stdin.setRawMode(false);
      } catch {}
      stdin.pause();
      stdin.removeListener("data", onData);
    };
    const onData = (d: string) => {
      const key = parseMenuKey(d);
      if (key === "cancel") {
        cleanup();
        resolve(null);
        return;
      }
      if (key === "enter") {
        const result = opts.multi ? [...s.checked].sort((a, b) => a - b) : [s.cursor];
        cleanup();
        resolve(result);
        return;
      }
      if (key === "") return;
      s = reduceMenu(s, key, items.length, opts.multi);
      draw();
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
    draw();
  });
}
