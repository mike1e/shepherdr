import { expect, test } from "bun:test";
import { spaceMenu, addMenu, machineMenu, sectionMenu, taskMenu, removeAsk, dequeueAsk, machineLabel, tabMenu, appMenu, assistantRow, agentChoices, agentHint, tabName, endAgent, NEW_MENU, SWITCH_AGENT } from "./menus.js";

const words = (list) => list.map((x) => (x.sep ? "—" : x.label));

test("a space's menu is the window's: Notify, Mark as read when unread, Pin, Rename, Space settings, worktrees, Close", () => {
  expect(words(spaceMenu())).toEqual(["Notify", "—", "Pin", "Rename…", "Space settings…", "—", "Close…"]);
  expect(words(spaceMenu({ unread: true, pinned: true, git: "linked" }))).toEqual(
    ["Notify", "—", "Mark as read", "Unpin", "Rename…", "Space settings…", "—", "New worktree", "Open worktree", "Remove worktree", "—", "Close…"]);
  expect(words(spaceMenu({ git: "main" }))).not.toContain("Remove worktree");
  // Notify's quiet note under its choices, the same in the window's menu and the web's
  expect(spaceMenu()[0].note).toBe("Tasks alert either way.");
  // a space with no Assistant's tab yet (any machine) offers to start one, first after Notify
  expect(words(spaceMenu({ assistant: false })).slice(0, 4)).toEqual(["Notify", "—", "Start Assistant", "Pin"]);});

test("the sidebar's other menus and a task row's", () => {
  expect(words(addMenu())).toEqual(["New space", "New section"]);
  expect(words(machineMenu())).toEqual(["Rename…"]);
  expect(words(sectionMenu())).toEqual(["Rename…", "Delete"]);
  expect(words(taskMenu())).toEqual(["Pin"]);
  expect(words(taskMenu({ pinned: true }))).toEqual(["Unpin"]);
  // SHEP-38: a task not started yet starts later; a scheduled one is rescheduled, started now or unscheduled
  const later = (m) => m.map((x) => x.sep ? "—" : x.heading ? `# ${x.heading}` : x.label);
  expect(later(taskMenu({ status: "todo" }))).toEqual(["# Start later", "In 1 hour", "In 3 hours", "Tomorrow 9:00", "Monday 9:00", "Other time…", "—", "Start now", "—", "Pin", "—", "Remove…"]);
  expect(later(taskMenu({ status: "scheduled", pinned: true }))).toEqual(["# Reschedule", "In 1 hour", "In 3 hours", "Tomorrow 9:00", "Monday 9:00", "Other time…", "—", "Start now", "Unschedule", "—", "Unpin", "—", "Dequeue", "Remove…"]);
  // Send to agent: a not-started task lists the agents the caller passes, each starting it now with that agent
  const agents = [{ key: "claude", name: "Claude Code" }, { key: "codex", name: "Codex" }];
  expect(later(taskMenu({ status: "todo", agents })).slice(-8)).toEqual(["—", "# Send to agent", "Claude Code", "Codex", "—", "Pin", "—", "Remove…"]);
  expect(taskMenu({ status: "todo", agents }).filter((x) => x.id?.startsWith("agent:")).map((x) => x.id)).toEqual(["agent:claude", "agent:codex"]);
  expect(later(taskMenu({ status: "working", agents }))).toEqual(["Pin", "—", "Dequeue", "Remove…"]);
  expect(later(taskMenu({ status: "working" }))).toEqual(["Pin", "—", "Dequeue", "Remove…"]);
  // MSHEP-12: Dequeue only where a task can go back to To do; Remove on every task, marked dangerous
  for (const status of ["queued", "scheduled", "work", "need", "ready"]) expect(taskMenu({ status }).some((x) => x.id === "dequeue")).toBe(true);
  for (const status of ["todo", "done", null]) expect(taskMenu({ status }).some((x) => x.id === "dequeue")).toBe(false);
  expect(later(taskMenu({ status: "done" }))).toEqual(["Pin", "—", "Remove…"]);
  expect(taskMenu({ status: "todo" }).find((x) => x.id === "remove")).toMatchObject({ danger: true, icon: "trash-2" });
  expect(machineLabel(null)).toBe("This computer");
  expect(machineLabel("vm", "Build box")).toBe("Build box");
});

test("a tab's menu (the tab bar's): Rename…, Edit instructions… on an Assistant's, Switch agent, Restart, then Close tab", () => {
  expect(words(tabMenu())).toEqual(["Rename…", "—", "Close tab"]);
  expect(words(tabMenu({ assistant: true, switchable: true, restartable: true }))).toEqual(
    ["Rename…", "Edit instructions…", "Switch agent", "Restart", "—", "Close tab"]);
  expect(SWITCH_AGENT).toEqual({ title: "Switch agent", loading: "Checking installed agents…", current: "Current" });
});

test("the + menu's words: the Assistant's row, the agents it offers, and a tab's name", () => {
  expect(assistantRow({ open: true })).toEqual({ label: "Show Assistant", hint: "", enabled: true });
  expect(assistantRow()).toEqual({ label: "Assistant", hint: "C", enabled: true });
  // another machine's space starts its Assistant there, as here (SHEP-8)
  expect(assistantRow({ remote: true })).toEqual({ label: "Assistant", hint: "C", enabled: true });
  const list = agentChoices([{ key: "a", installed: false }, { key: "b", installed: true }, { key: "c", installed: false }, { key: "d", installed: false }]);
  expect(list.map((a) => a.key)).toEqual(["b", "a", "c"]);
  expect(list.map(agentHint)).toEqual(["1", "Not installed", "Not installed"]);
  expect(NEW_MENU.agents).toBe("Start an agent");
  expect(tabName("tb3", "Claude Code")).toBe("Claude Code");
  expect(tabName("", null)).toBe("Terminal");
  expect(tabName("Build")).toBe("Build");
  expect(endAgent("Codex")).toEqual({ ask: "End Codex?", tip: "End Codex", cancel: "Cancel", verb: "End agent" });
});

test("the app menu: New space, Keybinds, then the window's themes", () => {
  expect(words(appMenu())).toEqual(["New space", "—", "Keybinds", "—", "Theme: Graphite", "Theme: Ink", "Theme: Moss", "Theme: Atom One Dark"]);
});

test("MSHEP-12: what Remove and Dequeue ask", () => {
  const base = { ref: "HLA-3", title: "Fix it", agents: [], pr: null, worktree: "/w", branch: "task/3", uncommitted: 0, unpushed: 0 };
  const clean = removeAsk(base);
  expect(clean.title).toBe("Remove HLA-3?");
  expect(clean.lines[0]).toContain("cannot be undone");
  expect(clean.worktreeVerb).toBe("Remove with worktree");
  expect(clean.pr).toBe(false);
  // unsaved work: never offered, said in words
  const dirty = removeAsk({ ...base, uncommitted: 2, unpushed: 1 });
  expect(dirty.worktreeVerb).toBeNull();
  expect(dirty.lines.join(" ")).toContain("2 uncommitted changes and 1 unpushed commit");
  // an open pull request asks twice
  const pr = removeAsk({ ...base, pr: { number: 7 } });
  expect(pr.pr).toBe(true);
  expect(pr.lines.join(" ")).toContain("open pull request (#7)");
  expect(removeAsk({ ...base, agents: ["t1"] }).lines.join(" ")).toContain("running agent is stopped");
  expect(dequeueAsk(base).needsAsk).toBe(false);
  const d = dequeueAsk({ ...base, agents: ["t1"] });
  expect(d.needsAsk).toBe(true);
  expect(d.lines.join(" ")).toContain("worktree /w and branch task/3 are not touched");
});
