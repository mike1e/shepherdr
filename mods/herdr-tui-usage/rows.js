// The usage block's words, as plain data (no drawing, so a test can check them): one entry per agent CLI with
// one line per plan window, "5h ████░░░░ 62% 2h". The numbers come from lib/machines.js (machine.py limits()).
import { planRows, liveWindow, leftOf, planLevelOf, span, whyWords, NO_USAGE, noPlanWords } from "./core/machines.js";

export const BAR = 8;

// A bar of BAR cells, filled to `left` percent (at least one cell while anything is left).
export function gauge(left, cells = BAR) {
  const n = left <= 0 ? 0 : Math.max(1, Math.min(cells, Math.round((left / 100) * cells)));
  return "█".repeat(n) + "░".repeat(cells - n);
}

// "5-hour" → "5h", "Weekly" → "wk"; anything else keeps its first word, cut at 6.
export function shortName(name) {
  const n = String(name ?? "").toLowerCase();
  if (/^5[- ]?h/.test(n)) return "5h";
  if (/week/.test(n)) return "wk";
  if (/day/.test(n)) return "day";
  return n.split(/[\s-]/)[0].slice(0, 6) || "?";
}

// A window of one model's own (Claude: "Weekly (Fable)", Codex: "Spark · 5-hour") isn't the plan's: the block leaves it out.
export const planWide = (w) => { const n = String(w?.name ?? ""); return /\(all models\)/i.test(n) || !/[(·]/.test(n); };

// stats (statsOf(machine)) → [{ cli, name, note?, lines: [{ key, label, left, bar, reset, level }] }].
// A CLI that can't be read gets a `note` saying why; before the first read: one entry, "Reading…".
export function usageRows(stats, now = Date.now()) {
  if (!stats) return [{ cli: "", name: "usage", note: "Reading…", lines: [] }];
  const rows = planRows(stats, now);
  if (!rows.length) return [{ cli: "", name: "usage", note: noPlanWords(stats), lines: [] }];
  return rows.map((r) => {
    const base = { cli: r.cli, name: r.cli, note: "", lines: [] };
    if (r.none) return { ...base, note: NO_USAGE };
    if (r.read.state !== "ok") return { ...base, note: whyWords(r.read).replace(/\.$/, "") };
    const seen = new Set();
    const live = (r.read.windows ?? []).filter((w) => liveWindow(w, now) && planWide(w))
      .filter((w) => { const k = shortName(w.name); return seen.has(k) ? false : (seen.add(k), true); });
    if (!live.length) return { ...base, note: "Not read since its limits refilled" };
    return {
      ...base,
      lines: live.map((w, i) => {
        const left = leftOf(w);
        return { key: `${r.cli}-${i}`, label: shortName(w.name), left, bar: gauge(left), level: planLevelOf(left),
          reset: w.resets_at ? span(w.resets_at - now) : "" };
      }),
    };
  });
}

// One line as the TUI would print it: "5h ████░░░░  62% 2h".
export const lineText = (l) => `${l.label.padEnd(2)} ${l.bar} ${String(l.left).padStart(3)}%${l.reset ? ` ${l.reset}` : ""}`;
