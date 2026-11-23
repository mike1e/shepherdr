"""MSHEP-25: every row of the window chat shows its time, always. A message's band draws its time in the layer that
never fades (not a hover part), inside the column and clear of the action icons; the quiet rows (task news, Autopilot
wake, closed ask, tools, artifact line, question card, error) draw their own stamp from the row's `at`.
barLayout() is run as written in main.js, in node, with the window's helpers stubbed."""
import home_guard  # noqa: F401  (first: every test on a throwaway home)
import json
import os
import re
import subprocess
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = open(os.path.join(ROOT, "mods", "chat", "main.js"), encoding="utf-8").read()
ROWS = SRC[SRC.index("  rowBare(x, t"):]
MATCH = re.search(r"\n  barLayout\(bar\) \{\n.*?\n  \}\n", SRC, re.S)
CV = os.path.join(ROOT, "mods", "chat", "core", "chat-view.js")

HARNESS = r"""
import { clock, bandOrder } from %(cv)s;
const ACT = 22, ACT_GAP = 2, PILL = 40, PILL_GAP = 4, PILL_EDGE = 6;
const addonOn = () => true;
const obj = { %(method)s };
const self = { edges: () => ({ left: 0, right: %(room)d }) };
console.log(JSON.stringify(obj.barLayout.call(self, %(bar)s)));
"""


def layout(side, at, room=600, pills=0):
    bar = {"side": side, "at": at, "acts": ["reply", "copy", "rewind" if side == "user" else "fork"],
           "pills": [{"emoji": "x"}] * pills}
    script = HARNESS % {"cv": json.dumps(CV), "method": MATCH.group(0).strip(), "room": room, "bar": json.dumps(bar)}
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "bar.mjs")
        with open(path, "w") as f:
            f.write(script)
        out = subprocess.run(["node", path], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


class TimeAlwaysShown(unittest.TestCase):
    def test_time_is_not_a_hover_part_on_either_side(self):
        for side in ("user", "agent"):
            parts = layout(side, 1_700_000_000_000)["parts"]
            time = [p for p in parts if p["what"] == "time"]
            self.assertEqual(len(time), 1, side)
            self.assertFalse(time[0].get("hover"), side)
            self.assertTrue(time[0]["text"], side)
            # the icons still show only on hover
            self.assertTrue(all(p.get("hover") for p in parts if p["what"] in ("reply", "copy")), side)

    def test_parts_never_overlap_and_stay_inside_the_column(self):
        for side in ("user", "agent"):
            for room in (600, 330):
                parts = sorted(layout(side, 1_700_000_000_000, room=room, pills=2)["parts"], key=lambda p: p["x"])
                for a, b in zip(parts, parts[1:]):
                    self.assertLessEqual(a["x"] + a["w"], b["x"], (side, room))
                self.assertGreaterEqual(parts[0]["x"], 0)
                self.assertLessEqual(parts[-1]["x"] + parts[-1]["w"], room)

    def test_no_time_without_a_moment(self):
        self.assertFalse([p for p in layout("agent", 0)["parts"] if p["what"] == "time"])


class QuietRowsCarryTheirTime(unittest.TestCase):
    def test_each_quiet_row_has_at_and_draws_a_stamp(self):
        for kind in ("pilot", "askend", "tasknews", "tools", "ask", "error"):
            m = re.search(r'case "%s":.*?(?=\n      case "|\n    \}\n    return div)' % kind, ROWS, re.S)
            self.assertTrue(m and "stamp(x.at)" in m.group(0), kind)
        # the rows are built with their moment
        for needle in ('kind: "pilot", id: x.id, at: x.at', 'kind: "askend", id: `ae:${e.id}`, at: e.at',
                       'kind: "tasknews", id: e.id, at: e.at', 's: s.kind === "head" && c.at > 1e12 ? { ...s, at: c.at }'):
            self.assertIn(needle, SRC)


if __name__ == "__main__":
    unittest.main()
