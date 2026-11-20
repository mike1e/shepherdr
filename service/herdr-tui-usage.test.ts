import { expect, test } from "bun:test";
// @ts-ignore plain JS mod files
import { gauge, shortName, usageRows, lineText } from "../mods/herdr-tui-usage/rows.js";
// @ts-ignore
import { lookup, hints } from "../mods/herdr-tui-prefix/keymap.js";

const NOW = Date.UTC(2026, 10, 4, 12, 0);

test("a gauge fills to the share left, at least one cell while anything is left", () => {
  expect(gauge(100)).toBe("████████");
  expect(gauge(62)).toBe("█████░░░");
  expect(gauge(3)).toBe("█░░░░░░░");
  expect(gauge(0)).toBe("░░░░░░░░");
});

test("window names are short", () => {
  expect(shortName("5-hour")).toBe("5h");
  expect(shortName("Weekly")).toBe("wk");
});

test("usage lines show what is left and when it refills", () => {
  const stats = { limits: { claude: { state: "ok", at: NOW, windows: [{ name: "5-hour", used: 38, resets_at: NOW + 2 * 3600e3 + 600e3 }, { name: "Weekly", used: 81 }] } } };
  const [claude] = usageRows(stats, NOW);
  expect(claude.name).toBe("claude");
  expect(lineText(claude.lines[0])).toBe("5h █████░░░  62% 2h 10m");
  expect(lineText(claude.lines[1])).toBe("wk ██░░░░░░  19%");
});

test("a CLI that can't be read says why; before any read it says reading", () => {
  expect(usageRows(null, NOW)[0].note).toBe("Reading…");
  const [codex] = usageRows({ limits: { codex: { state: "signed-out", at: NOW } } }, NOW);
  expect(codex.note).toBe("Not signed in on this machine");
  expect(codex.lines).toEqual([]);
});

test("prefix keys map to the TUI's commands", () => {
  expect(lookup("c")).toEqual(["tab.new", {}]);
  expect(lookup("shift-n")).toEqual(["tabs-tasks.newspace", {}]);
  expect(lookup("shift-x")).toEqual(["tabs-tasks.close", {}]);
  expect(lookup("3")).toEqual(["tab.select", { index: 3 }]);
  expect(lookup("q")).toBeNull();
  expect(hints().length).toBeGreaterThan(15);
});

// @ts-ignore
import { add, toggle, remove, ordered, clearDone, count } from "../mods/herdr-tui-todo/todos.js";
test("the inbox adds, ticks, orders, sweeps and counts", () => {
  let l = add(undefined, "  call bank ", 1);
  l = add(l, "", 2);
  l = add(l, "pay rent", 3);
  expect(l.map((x: any) => x.text)).toEqual(["call bank", "pay rent"]);
  l = toggle(l, 1);
  expect(ordered(l).map((x: any) => x.id)).toEqual([3, 1]);
  expect(count(l)).toBe("1 open · 1 done");
  expect(clearDone(l).map((x: any) => x.id)).toEqual([3]);
  expect(remove(l, 3).map((x: any) => x.id)).toEqual([1]);
});

test("the inbox toggle unticks, ignores unknown ids and keeps the rest", () => {
  let l = add(add(undefined, "a", 1), "b", 2);
  l = toggle(l, 1);
  expect(l.find((x: any) => x.id === 1).done).toBe(true);
  l = toggle(l, 1);
  expect(l.find((x: any) => x.id === 1).done).toBe(false);
  expect(toggle(l, 99)).toEqual(l);
  expect(l.find((x: any) => x.id === 2).done).toBe(false);
});

test("the inbox row wiring: box and text share one toggle click, x is a separate delete click", async () => {
  const src = await Bun.file(new URL("../mods/herdr-tui-todo/main.js", import.meta.url)).text();
  const tick = src.slice(src.indexOf("id(`tick-"), src.indexOf("id(`del-"));
  expect(tick).toContain("toggle(read(), x.id)");
  expect(tick).toContain("x.text");
  expect(tick).toContain('"[x]"');
  expect(tick).not.toContain("remove(");
  const del = src.slice(src.indexOf("id(`del-"));
  expect(del).toContain("remove(read(), x.id)");
  expect(del).not.toContain("toggle(");
  // the x must not sit inside the toggle target, or a click would reach both
  expect(tick).not.toContain('child("x")');
});
