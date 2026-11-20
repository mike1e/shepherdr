// Herdr TUI layout: the Inbox, a to-do list for yourself above Tasks in the right panel. Type and press Enter to add,
// click a to-do (box or text) to tick it, x to delete, "clear done" to sweep. Kept in the app's shared store ("herdr-tui.todos").
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, settings, shared, setShared } from "herdr";
import { add, toggle, remove, ordered, clearDone, count } from "./todos.js";

const KEY = "herdr-tui.todos";
const read = () => shared(KEY);

export default class HerdrTuiTodo extends View {
  init(_props, cx) {
    this.input = InputState.new({ value: "", placeholder: "add a to-do…" });
    this.input.on("submit", (_e, cx) => {
      setShared(KEY, add(read(), this.input.value()));
      this.input.set_value("");
      cx.notify();
    });
  }

  close() { this.input.release(); }

  render() {
    const t = theme();
    const mono = settings()?.font ?? "JetBrains Mono";
    const list = ordered(read());
    const set = (next, cx) => { setShared(KEY, next); cx.notify(); };
    return v_flex().id("herdr-tui-todo").size_full().min_h(0).font_family(mono).text_size(12).text_color(t.foreground)
      .child(h_flex().flex_none().px(10).h(24).items_center().gap(8)
        .child(div().flex_1().text_color(t.dim).child("inbox"))
        .child(div().text_color(t.dim).child(count(read())))
        .child(div().id("todo-clear").cursor_pointer().text_color(t.muted).hover((s) => s.text_color(t.foreground)).child("clear done")
          .on_click((_e, cx) => set(clearDone(read()), cx))))
      .child(div().flex_none().px(10).pb(4)
        .child(Input.new(this.input).h(24).px(6).border_1().border_color(t.border).bg(t.background).text_color(t.foreground)))
      .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().px(10).children(list.map((x) =>
        h_flex().id(`todo-${x.id}`).flex_none().gap(8).py(1).items_start()
          // The box and the text are one click target (a sibling of the x, not its parent, so x never also toggles).
          .child(h_flex().id(`tick-${x.id}`).flex_1().min_w(0).gap(8).items_start().cursor_pointer()
            .on_click((_e, cx) => set(toggle(read(), x.id), cx))
            .child(div().flex_none().text_color(x.done ? t.dim : t.accent).child(x.done ? "[x]" : "[ ]"))
            .child(div().flex_1().min_w(0).text_color(x.done ? t.dim : t.foreground).child(x.text)))
          .child(div().id(`del-${x.id}`).flex_none().cursor_pointer().text_color(t.dim).hover((s) => s.text_color(t.blocked)).child("x")
            .on_click((_e, cx) => set(remove(read(), x.id), cx))))));
  }
}
