// Herdr TUI layout: prefix mode. Ctrl+B (keys.json, layout:herdr-tui) opens this small dialog, the next key runs the
// TUI's command for it (keymap.js), Esc or any other key leaves. It also shows what each key does, as the TUI's help does.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, theme, settings } from "herdr";
import { lookup, hints } from "./keymap.js";

export default class HerdrTuiPrefix extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  render() {
    const t = theme();
    const mono = settings()?.font ?? "JetBrains Mono";
    const rows = hints();
    const col = (items, id) => v_flex().id(id).flex_1().min_w(0).children(items.map((s, i) => div().id(`${id}${i}`).truncate().child(s)));
    return v_flex().id("herdr-tui-prefix").track_focus(this.handle)
      .on_key_down((e, cx) => {
        const hit = lookup(e.keystroke);
        if (!hit && ["shift", "ctrl", "alt", "cmd"].includes(e.key)) return; // a bare modifier: keep waiting
        closeOverlay(props().overlay);
        if (hit) run(hit[0], hit[1]);
        cx.stop_propagation();
      })
      .size_full().p(10).gap(6).bg(t.popover).border_1().border_color(t.border).font_family(mono).text_size(12).text_color(t.muted)
      .child(div().text_color(t.foreground).child("prefix · press a key · esc cancels"))
      .child(h_flex().gap(8).items_start().child(col(rows.slice(0, Math.ceil(rows.length / 2)), "a")).child(col(rows.slice(Math.ceil(rows.length / 2)), "b")));
  }
}
