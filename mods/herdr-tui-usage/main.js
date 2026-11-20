// Herdr TUI layout: Claude Code's and Codex's plan usage as a compact block at the foot of the sidebar, one row per
// limit (5-hour, weekly): what is left in %, a bar and when it refills. Read by machine.py limits() through
// lib/machines.js (every 10 minutes, never per render), the same reader Shepherdr's sidebar meters use.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, settings, shared, setShared } from "herdr";
import { startPolling, statsOf, colorOf } from "./machines.js";
import { usageRows, lineText } from "./rows.js";
import { arrange, move, hide, show, cleanPrefs } from "./order.js";

// Which CLIs show and in what order, kept in the app's shared store (survives restarts and updates), like the Inbox's list.
// The window runtime has no drag between blocks (only files and dock tabs), so each CLI's name line has ↑ ↓ and × instead.
const KEY = "herdr-tui.usage-order";
const prefs = () => cleanPrefs(shared(KEY));

export default class HerdrTuiUsage extends View {
  init(_props, cx) {
    startPolling(cx);
    cx.timer.every(60000, (cx) => cx.notify()); // reset times count down
  }

  render() {
    const t = theme();
    const mono = settings()?.font ?? "JetBrains Mono";
    const { shown, hidden } = arrange(usageRows(statsOf(null)), prefs());
    const names = shown.filter((r) => r.cli).map((r) => r.cli);
    const set = (next, cx) => { setShared(KEY, next); cx.notify(); };
    const btn = (id, label, on) => div().id(id).flex_none().px(3).cursor_pointer().text_color(t.dim)
      .hover((s) => s.text_color(t.foreground)).child(label).on_click((_e, cx) => { cx.stop_propagation(); on(cx); });
    const head = (r, text, color) => h_flex().id(`u-${r.cli}`).gap(2).items_center()
      .child(div().flex_1().min_w(0).truncate().text_color(color).child(text))
      .when(names.indexOf(r.cli) > 0, (el) => el.child(btn(`up-${r.cli}`, "↑", (cx) => set(move(prefs(), names, r.cli, -1), cx))))
      .when(names.indexOf(r.cli) < names.length - 1, (el) => el.child(btn(`dn-${r.cli}`, "↓", (cx) => set(move(prefs(), names, r.cli, 1), cx))))
      .child(btn(`hide-${r.cli}`, "×", (cx) => set(hide(prefs(), r.cli), cx)));
    return v_flex().id("herdr-tui-usage").size_full().overflow_y_scrollbar().px(10).py(6).gap(1).font_family(mono).text_size(12)
      .child(div().text_color(t.dim).child("usage"))
      .children(shown.flatMap((r) => [
        ...(r.note && r.cli ? [head(r, `${r.name}: ${r.note}`, t.dim)]
          : r.note ? [div().id("n-x").truncate().text_color(t.dim).child(r.note)]
          : [r.cli ? head(r, r.name, t.foreground) : div().id("u-x").text_color(t.foreground).child("")]),
        ...r.lines.map((l) => h_flex().id(l.key).text_color(l.level === "ok" ? t.muted : colorOf(t, l.level)).child(lineText(l))),
      ]))
      .when(hidden.length > 0, (el) => el.child(div().id("hidden-head").mt(4).text_color(t.dim).child("── hidden ──"))
        .children(hidden.map((c) => h_flex().id(`h-${c}`).gap(2).items_center()
          .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(c))
          .child(btn(`show-${c}`, "+", (cx) => set(show(prefs(), c, [...names, ...hidden]), cx))))));
  }
}
