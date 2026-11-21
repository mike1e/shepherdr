// Herdr TUI layout: Claude Code's and Codex's plan usage as a compact block at the foot of the sidebar, one row per
// limit (5-hour, weekly): what is left in %, a bar and when it refills. Read by machine.py limits() through
// lib/machines.js (every 10 minutes, never per render), the same reader Shepherdr's sidebar meters use.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, settings } from "herdr";
import { startPolling, statsOf, colorOf } from "./machines.js";
import { usageRows, lineText } from "./rows.js";

export default class HerdrTuiUsage extends View {
  init(_props, cx) {
    startPolling(cx);
    cx.timer.every(60000, (cx) => cx.notify()); // reset times count down
  }

  render() {
    const t = theme();
    const mono = settings()?.font ?? "JetBrains Mono";
    const rows = usageRows(statsOf(null)); // already in the fixed order: Claude, Codex, then others
    return v_flex().id("herdr-tui-usage").size_full().overflow_y_scrollbar().px(10).py(6).gap(1).font_family(mono).text_size(12)
      .child(div().text_color(t.dim).child("usage"))
      .children(rows.flatMap((r) => [
        ...(r.note && r.cli ? [div().id(`u-${r.cli}`).truncate().text_color(t.dim).child(`${r.name}: ${r.note}`)]
          : r.note ? [div().id("n-x").truncate().text_color(t.dim).child(r.note)]
          : [r.cli ? div().id(`u-${r.cli}`).truncate().text_color(t.foreground).child(r.name) : div().id("u-x").text_color(t.foreground).child("")]),
        ...r.lines.map((l) => h_flex().id(l.key).text_color(l.level === "ok" ? t.muted : colorOf(t, l.level)).child(lineText(l))),
      ]));
  }
}
