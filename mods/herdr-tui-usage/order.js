// Which CLIs the usage block shows and in what order, as plain data: prefs = { order: [cli], hidden: [cli] }.
// Pure, so a test can check it. A CLI that isn't in `order` yet (newly installed) goes at the end, shown.
export const DEFAULT_ORDER = ["claude", "codex"];

export const cleanPrefs = (v) => {
  const list = (x) => [...new Set(Array.isArray(x) ? x.filter((s) => typeof s === "string" && s) : [])];
  return { order: list(v?.order), hidden: list(v?.hidden) };
};

// The full order for the CLIs seen now: the saved order, then the defaults, then anything new in the order seen.
export const fullOrder = (prefs, clis = []) => {
  const p = cleanPrefs(prefs);
  return [...new Set([...p.order, ...DEFAULT_ORDER, ...clis])];
};

// rows ([{ cli, ... }], one per CLI; a row without a cli, like "Reading…", is kept as is) → { shown, hidden: [cli] } in order.
export function arrange(rows, prefs) {
  const p = cleanPrefs(prefs);
  const withCli = rows.filter((r) => r.cli);
  if (!withCli.length) return { shown: rows, hidden: [] };
  const rank = new Map(fullOrder(p, withCli.map((r) => r.cli)).map((c, i) => [c, i]));
  const sorted = [...withCli].sort((a, b) => rank.get(a.cli) - rank.get(b.cli));
  return { shown: sorted.filter((r) => !p.hidden.includes(r.cli)), hidden: sorted.filter((r) => p.hidden.includes(r.cli)).map((r) => r.cli) };
}

// Move `cli` one place up (-1) or down (1) among the shown CLIs (`shown`: their names, in order); the hidden keep their places.
export function move(prefs, shown, cli, dir) {
  const p = cleanPrefs(prefs);
  const i = shown.indexOf(cli), j = i + dir;
  if (i < 0 || j < 0 || j >= shown.length) return p;
  const next = [...shown];
  [next[i], next[j]] = [next[j], next[i]];
  return { ...p, order: [...next, ...fullOrder(p, shown).filter((c) => !next.includes(c))] };
}

export const hide = (prefs, cli) => { const p = cleanPrefs(prefs); return p.hidden.includes(cli) ? p : { ...p, hidden: [...p.hidden, cli] }; };
// Bringing one back puts it at the end of the shown CLIs.
export const show = (prefs, cli, clis = []) => { const p = cleanPrefs(prefs); return { order: [...fullOrder(p, clis).filter((c) => c !== cli), cli], hidden: p.hidden.filter((c) => c !== cli) }; };
