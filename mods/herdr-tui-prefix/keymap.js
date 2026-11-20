// The herdr TUI's prefix keys (herdr 0.9.5 defaults, prefix ctrl+b) as Herdr commands: after the prefix, the next key
// runs one. Same letters as the TUI where the app has the command; [key, command, args, words].
export const PREFIX = [
  ["c", "tab.new", {}, "new tab"], ["n", "tab.next", {}, "next tab"], ["p", "tab.prev", {}, "previous tab"],
  ["shift-t", "tabs-tasks.rename-tab", {}, "rename tab"], ["shift-x", "tabs-tasks.close", {}, "close tab"],
  ["shift-n", "tabs-tasks.newspace", {}, "new workspace"], ["shift-w", "tabs-tasks.rename-space", {}, "rename workspace"],
  ["shift-d", "space.close", {}, "close workspace"], ["w", "mod.open", { name: "picker" }, "workspaces"],
  ["g", "mod.open", { name: "jump" }, "go to"], ["h", "pane.go", { direction: "left" }, "pane left"],
  ["j", "pane.go", { direction: "down" }, "pane down"], ["k", "pane.go", { direction: "up" }, "pane up"],
  ["l", "pane.go", { direction: "right" }, "pane right"], ["v", "pane.split", { direction: "right" }, "split right"],
  ["-", "pane.split", { direction: "down" }, "split down"], ["minus", "pane.split", { direction: "down" }, "split down"],
  ["x", "pane.close", {}, "close pane"], ["z", "pane.zoom", {}, "zoom pane"],
  ["b", "layout.toggle", { id: "sidebar" }, "toggle sidebar"], ["a", "layout.toggle", { id: "panel" }, "tasks and chat"],
  ["s", "app.settings", {}, "settings"], ["?", "app.help", {}, "help"], ["shift-/", "app.help", {}, "help"],
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [String(n), "tab.select", { index: n }, `tab ${n}`]),
];

// A KeyEvent's keystroke → [command, args] or null ("c", "shift-n", "1"). A bare shifted letter arrives as "shift-n".
export function lookup(keystroke) {
  const hit = PREFIX.find(([k]) => k === keystroke);
  return hit ? [hit[1], hit[2]] : null;
}

// The help rows shown while waiting: one per distinct command, its first key.
export function hints() {
  const seen = new Set();
  return PREFIX.filter(([, c, a]) => { const id = c + JSON.stringify(a); if (seen.has(id)) return false; seen.add(id); return true; })
    .filter(([k]) => !/^[2-9]$/.test(k)).map(([k, , , words]) => `${k === "shift-n" ? "N" : k.startsWith("shift-") ? k.slice(6).toUpperCase() : k}  ${words}`);
}
