"""machine.py's codex() falls back to the rate limits Codex logs in its own session files."""
import home_guard  # noqa: F401  (first: every test on a throwaway home, never the real one)
import importlib.util, json, os, tempfile, unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("machine", os.path.join(ROOT, "mods/tasks/bin/herdr_task/machine.py"))
machine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(machine)

NOW = 1_795_000_000_000  # ms
LATER = 1_795_100_000  # s, after NOW
EARLIER = 1_794_000_000  # s, before NOW


def line(primary=None, secondary=None, ts="2026-11-20T20:51:30.646Z", plan="prolite"):
    return json.dumps({"timestamp": ts, "payload": {"type": "token_count", "rate_limits": {
        "limit_id": "codex", "primary": primary, "secondary": secondary, "plan_type": plan}}})


def win(used, minutes, resets):
    return {"used_percent": used, "window_minutes": minutes, "resets_at": resets}


class CodexFromLogs(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp()

    def log(self, day, name, *lines, raw="", touched=None):
        d = os.path.join(self.home, "sessions", *day.split("/"))
        os.makedirs(d, exist_ok=True)
        path = os.path.join(d, "rollout-%s.jsonl" % name)
        with open(path, "w") as f:
            f.write("\n".join(lines) + ("\n" if lines else "") + raw)
        if touched:
            os.utime(path, (touched, touched))

    def read(self):
        return machine.codex_from_logs(self.home, NOW)

    def test_newest_log_wins(self):
        self.log("2026/11/19", "a", line(win(80, 300, LATER), ts="2026-11-19T10:00:00Z"))
        self.log("2026/11/20", "a", line(win(10, 300, LATER), ts="2026-11-20T10:00:00Z"))
        self.log("2026/11/20", "b", line(win(20, 300, LATER), ts="2026-11-20T11:00:00Z"),
                 line(win(30, 300, LATER), ts="2026-11-20T12:00:00Z"))
        self.assertEqual(self.read()["windows"][0]["used"], 30)

    def test_older_session_logging_later_wins(self):
        self.log("2026/11/19", "a", line(win(60, 300, LATER), ts="2026-11-20T15:00:00Z"))
        self.log("2026/11/20", "a", line(win(10, 300, LATER), ts="2026-11-20T10:00:00Z"))
        self.assertEqual(self.read()["windows"][0]["used"], 60)

    def test_many_recent_sessions_without_limits(self):
        self.log("2026/11/01", "old", line(win(33, 300, LATER)))
        for i in range(12):
            self.log("2026/11/20", "s%02d" % i, '{"type":"event_msg"}')
        self.assertEqual(self.read()["windows"][0]["used"], 33)

    def test_entry_before_a_long_tail(self):
        self.log("2026/11/20", "a", line(win(44, 300, LATER)), *(["x" * 1000] * 3000))
        self.assertEqual(self.read()["windows"][0]["used"], 44)

    def test_five_hour_and_weekly(self):
        self.log("2026/11/20", "a", line(win(5, 300, LATER), win(19, 10080, LATER + 5)))
        got = self.read()
        self.assertEqual(got["state"], "ok")
        self.assertEqual([(w["name"], w["used"]) for w in got["windows"]], [("5-hour", 5), ("Weekly", 19)])
        self.assertEqual(got["windows"][1]["resets_at"], (LATER + 5) * 1000)
        self.assertEqual(got["plan"], "prolite")

    def test_at_is_when_codex_logged_it(self):
        self.log("2026/11/20", "a", line(win(5, 300, LATER), ts="2026-11-20T20:51:30.646Z"))
        self.assertEqual(self.read()["at"], 1795207890646)

    def test_null_secondary(self):
        self.log("2026/11/20", "a", line(win(19, 10080, LATER), None))
        got = self.read()
        self.assertEqual([w["name"] for w in got["windows"]], ["Weekly"])

    def test_stale_reset(self):
        self.log("2026/11/20", "a", line(win(90, 300, EARLIER), win(19, 10080, LATER)))
        self.assertEqual([w["name"] for w in self.read()["windows"]], ["Weekly"])
        self.log("2026/11/20", "b", line(win(90, 300, EARLIER)))
        got = self.read()
        self.assertEqual(got["state"], "unknown")
        self.assertIn("since reset", got["why"])

    def test_no_logs(self):
        got = self.read()
        self.assertEqual(got["state"], "unknown")
        self.assertIn("No Codex session here has logged", got["why"])
        self.log("2026/11/20", "a", '{"type":"event_msg"}')
        self.assertIn("No Codex session", self.read()["why"])

    def test_truncated_last_line(self):
        self.log("2026/11/20", "a", line(win(7, 300, LATER)), raw=line(win(99, 300, LATER))[:60])
        self.assertEqual(self.read()["windows"][0]["used"], 7)

    def test_big_log(self):
        self.log("2026/11/20", "a", *(["x" * 1000] * 2000), line(win(42, 300, LATER)))
        self.assertEqual(self.read()["windows"][0]["used"], 42)


class CodexFallsBack(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp()
        d = os.path.join(self.home, "sessions", "2026", "11", "20")
        os.makedirs(d)
        with open(os.path.join(d, "rollout-a.jsonl"), "w") as f:
            f.write(line(win(19, 10080, int(machine.now_ms() / 1000) + 3600)) + "\n")
        for p in (mock.patch.dict(os.environ, {"CODEX_HOME": self.home}), mock.patch.object(machine, "which", lambda n: "/x/codex"),
                  mock.patch.object(machine, "_no_seal", lambda: None)):
            p.start()
            self.addCleanup(p.stop)

    def test_due_uses_the_logs(self):
        with mock.patch.object(machine, "_live_codex", return_value=machine.DUE):
            got = machine.codex()
        self.assertEqual(got["state"], "ok")
        self.assertEqual(got["windows"][0]["name"], "Weekly")

    def test_live_read_stays_first(self):
        live = {"state": "ok", "windows": [{"name": "5-hour", "used": 1}]}
        with mock.patch.object(machine, "_live_codex", return_value=live):
            self.assertIs(machine.codex(), live)

    def test_signed_out_is_not_overridden(self):
        with mock.patch.object(machine, "_live_codex", return_value={"state": "signed-out"}):
            self.assertEqual(machine.codex(), {"state": "signed-out"})

    def test_no_logs_keeps_the_live_reason_unless_due(self):
        os.remove(os.path.join(self.home, "sessions", "2026", "11", "20", "rollout-a.jsonl"))
        fail = {"state": "unknown", "why": "Couldn't run it"}
        with mock.patch.object(machine, "_live_codex", return_value=fail):
            got = machine.codex()
        self.assertIn("Couldn't run it", got["why"])
        self.assertIn("no Codex session here has logged", got["why"])
        with mock.patch.object(machine, "_live_codex", return_value=machine.DUE):
            self.assertIn("No Codex session here has logged", machine.codex()["why"])


if __name__ == "__main__":
    unittest.main()
