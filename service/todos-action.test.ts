// The web app's To-dos (MSHEP-16): each change is applied to the shared "herdr-tui.todos" list as it is now, with the
// same helpers the window's Inbox uses (core/todos.js), so the two never undo each other.
import { expect, test } from "bun:test";
import { act } from "./actions.ts";
import * as TODOS from "../core/todos.js";

function compat(start: unknown) {
  const kv: Record<string, unknown> = { "herdr-tui.todos": start };
  return { kv, compat: { shared: { value: (k: string) => kv[k], set: async (k: string, v: unknown) => { kv[k] = v; } } } as any };
}
const todo = (id: number, text: string, done = false) => ({ id, text, done });

test("add puts a trimmed to-do last, with an id the list doesn't have", async () => {
  const c = compat([todo(5e15, "old")]);
  await act({} as any, { type: "todos", op: "add", text: "  buy milk  " }, c.compat);
  const list = c.kv["herdr-tui.todos"] as any[];
  expect(list.map((x) => x.text)).toEqual(["old", "buy milk"]);
  expect(list[1].done).toBe(false);
  expect(list[1].id).toBeGreaterThan(5e15);
});

test("an empty add changes nothing", async () => {
  const c = compat([todo(1, "a")]);
  await act({} as any, { type: "todos", op: "add", text: "   " }, c.compat);
  expect(c.kv["herdr-tui.todos"]).toEqual([todo(1, "a")]);
});

test("toggle, remove and clear done", async () => {
  const c = compat([todo(1, "a"), todo(2, "b", true), todo(3, "c")]);
  await act({} as any, { type: "todos", op: "toggle", id: 1 }, c.compat);
  expect((c.kv["herdr-tui.todos"] as any[]).map((x) => x.done)).toEqual([true, true, false]);
  await act({} as any, { type: "todos", op: "remove", id: 3 }, c.compat);
  expect((c.kv["herdr-tui.todos"] as any[]).map((x) => x.id)).toEqual([1, 2]);
  await act({} as any, { type: "todos", op: "clear" }, c.compat);
  expect(c.kv["herdr-tui.todos"]).toEqual([]);
});

test("an unset or broken list is an empty one, and an unknown change is refused", async () => {
  const c = compat(undefined);
  await act({} as any, { type: "todos", op: "add", text: "first" }, c.compat);
  expect((c.kv["herdr-tui.todos"] as any[]).map((x) => x.text)).toEqual(["first"]);
  const bad = compat("nope");
  await act({} as any, { type: "todos", op: "clear" }, bad.compat);
  expect(bad.kv["herdr-tui.todos"]).toEqual([]);
  await expect(act({} as any, { type: "todos", op: "wipe" }, c.compat)).rejects.toThrow();
  expect(TODOS.clean(null)).toEqual([]);
});
