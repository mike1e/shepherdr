"""Claude's plan limits from Claude Code's status line (MSHEP-4): the tap, machine.py's use of what it wrote, and
`shepherdr statusline on|off` on scratch settings files."""
import home_guard  # noqa: F401  (first: every test on a throwaway home, never the real one)
import importlib.util, json, os, subprocess, sys, tempfile, unittest
from importlib.machinery import SourceFileLoader

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAP = os.path.join(ROOT, "bin", "shepherdr-statusline-tap")
SAMPLE = open(os.path.join(ROOT, "test", "fixtures", "claude-statusline.json")).read()
sys.path.insert(0, os.path.join(ROOT, "mods", "tasks", "bin"))
from herdr_task import machine  # noqa: E402


def load_shepherdr():
    loader = SourceFileLoader("shepherdr_bin", os.path.join(ROOT, "bin", "shepherdr"))
    spec = importlib.util.spec_from_loader("shepherdr_bin", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


def run_tap(stdin, then, state):
    env = {"PATH": os.environ["PATH"], "HOME": os.environ["HOME"], "SHEPHERDR_HOME": state}
    return subprocess.run([sys.executable, TAP, "--then", then], input=stdin, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)


class Tap(unittest.TestCase):
    def setUp(self):
        self.state = tempfile.mkdtemp()
        self.file = os.path.join(self.state, "state", "claude-limits.json")

    def test_passes_stdin_through_and_prints_the_command_output_unchanged(self):
        r = run_tap(SAMPLE.encode(), "cat; printf '\\033[36mtail\\033[0m'", self.state)
        self.assertEqual(r.returncode, 0)
        self.assertEqual(r.stdout, SAMPLE.encode() + b"\x1b[36mtail\x1b[0m")

    def test_writes_only_the_limit_numbers(self):
        run_tap(SAMPLE.encode(), "true", self.state)
        got = json.load(open(self.file))
        self.assertEqual(set(got), {"at", "windows"})
        sample = json.loads(SAMPLE)["rate_limits"]
        for key, w in sample.items():
            self.assertEqual(got["windows"][key]["used"], float(w["used_percentage"]))
            self.assertEqual(got["windows"][key]["resets_at"], w["resets_at"] * 1000)
        self.assertNotIn("/work/demo", open(self.file).read())

    def test_bad_json_still_runs_the_command(self):
        r = run_tap(b"not json {", "cat", self.state)
        self.assertEqual((r.returncode, r.stdout), (0, b"not json {"))
        self.assertFalse(os.path.exists(self.file))

    def test_no_rate_limits_writes_nothing(self):
        r = run_tap(b'{"model": {}}', "cat", self.state)
        self.assertEqual(r.stdout, b'{"model": {}}')
        self.assertFalse(os.path.exists(self.file))

    def test_a_failing_command_keeps_its_exit_and_output(self):
        r = run_tap(SAMPLE.encode(), "echo partial; exit 3", self.state)
        self.assertEqual((r.returncode, r.stdout), (3, b"partial\n"))
        self.assertTrue(os.path.exists(self.file))

    def test_an_unwritable_state_folder_never_fails_the_status_line(self):
        open(os.path.join(self.state, "state"), "w").close()   # a file where the folder belongs
        r = run_tap(SAMPLE.encode(), "echo fine", self.state)
        self.assertEqual((r.returncode, r.stdout), (0, b"fine\n"))

    def test_sessions_reporting_at_once_lose_nothing(self):
        future = 4102444800
        docs = [json.dumps({"rate_limits": {k: {"used_percentage": 10 + i, "resets_at": future}}}).encode()
                for i, k in enumerate(["five_hour", "seven_day"] * 6)]
        env = {"PATH": os.environ["PATH"], "HOME": os.environ["HOME"], "SHEPHERDR_HOME": self.state}
        procs = [subprocess.Popen([sys.executable, TAP, "--then", "true"], stdin=subprocess.PIPE, env=env) for _ in docs]
        for pr, d in zip(procs, docs):
            pr.stdin.write(d)
            pr.stdin.close()
        for pr in procs:
            pr.wait()
        self.assertEqual(set(json.load(open(self.file))["windows"]), {"five_hour", "seven_day"})

    def test_no_command_prints_nothing(self):
        r = run_tap(SAMPLE.encode(), "", self.state)
        self.assertEqual((r.returncode, r.stdout), (0, b""))

    def test_a_window_missing_from_the_next_update_stays_while_its_reset_is_ahead(self):
        future = 4102444800   # 2100
        first = json.dumps({"rate_limits": {"five_hour": {"used_percentage": 40, "resets_at": future}}})
        second = json.dumps({"rate_limits": {"seven_day": {"used_percentage": 9, "resets_at": future}}})
        run_tap(first.encode(), "true", self.state)
        run_tap(second.encode(), "true", self.state)
        got = json.load(open(self.file))["windows"]
        self.assertEqual((got["five_hour"]["used"], got["seven_day"]["used"]), (40.0, 9.0))


class Freshness(unittest.TestCase):
    NOW = 1_800_000_000_000

    def write(self, doc):
        d = tempfile.mkdtemp()
        p = os.path.join(d, "claude-limits.json")
        json.dump(doc, open(p, "w"))
        return p

    def win(self, used, resets, seen):
        return {"used": used, "resets_at": resets, "seen": seen}

    def test_windows_still_ahead_come_back_as_ok_in_the_usual_shape(self):
        p = self.write({"at": self.NOW - 1000, "windows": {
            "five_hour": self.win(12.0, self.NOW + 3_600_000, self.NOW - 1000),
            "seven_day": self.win(27.0, self.NOW + 86_400_000, self.NOW - 5000)}, "plan": "max"})
        got = machine.tapped_claude(self.NOW, p)
        self.assertEqual(got["state"], "ok")
        self.assertEqual([(w["name"], w["used"]) for w in got["windows"]], [("5-hour", 12.0), ("Weekly", 27.0)])
        self.assertEqual(got["windows"][0]["resets_at"], self.NOW + 3_600_000)
        self.assertEqual(got["at"], self.NOW - 5000)   # when Claude said it: the meters' "Read … ago" goes by this
        self.assertNotIn("plan", got)

    def test_a_window_that_has_reset_is_dropped(self):
        p = self.write({"at": self.NOW - 1000, "windows": {
            "five_hour": self.win(95.0, self.NOW - 1, self.NOW - 7_000_000),
            "seven_day": self.win(27.0, self.NOW + 86_400_000, self.NOW - 1000)}})
        self.assertEqual([w["name"] for w in machine.tapped_claude(self.NOW, p)["windows"]], ["Weekly"])

    def test_old_but_inside_the_window_still_counts(self):
        p = self.write({"at": self.NOW - 3_600_000, "windows": {"five_hour": self.win(50.0, self.NOW + 60_000, self.NOW - 3_600_000)}})
        self.assertEqual(machine.tapped_claude(self.NOW, p)["state"], "ok")

    def test_everything_reset_says_why(self):
        p = self.write({"at": self.NOW - 3 * 3_600_000, "windows": {"five_hour": self.win(95.0, self.NOW - 1, self.NOW - 3 * 3_600_000)}})
        got = machine.tapped_claude(self.NOW, p)
        self.assertEqual(got["state"], "unknown")
        self.assertIn("hasn't reported limits since 3 h ago", got["why"])

    def test_no_file_or_a_broken_one_is_none(self):
        self.assertIsNone(machine.tapped_claude(self.NOW, os.path.join(tempfile.mkdtemp(), "nope.json")))
        bad = os.path.join(tempfile.mkdtemp(), "x.json")
        open(bad, "w").write("{oops")
        self.assertIsNone(machine.tapped_claude(self.NOW, bad))

    def test_a_number_without_a_reset_time_counts_only_while_young(self):
        young = self.write({"windows": {"five_hour": {"used": 5.0, "seen": self.NOW - 60_000}}})
        old = self.write({"windows": {"five_hour": {"used": 5.0, "seen": self.NOW - 3_600_000}}})
        self.assertEqual(machine.tapped_claude(self.NOW, young)["state"], "ok")
        self.assertEqual(machine.tapped_claude(self.NOW, old)["state"], "unknown")


class Claude(unittest.TestCase):
    """claude(): the status line's numbers first, today's /usage as the fallback, plain words when neither has any."""
    def patched(self, tapped, usage):
        orig = (machine.which, machine.tapped_claude, machine._ask_claude_usage)
        machine.which = lambda n: "/bin/claude"
        machine.tapped_claude = lambda at: tapped
        calls = []
        machine._ask_claude_usage = lambda b: calls.append(b) or usage
        self.addCleanup(lambda: [setattr(machine, n, v) for n, v in zip(("which", "tapped_claude", "_ask_claude_usage"), orig)])
        return calls

    def test_the_status_line_wins_and_usage_isnt_run(self):
        ok = {"state": "ok", "windows": [{"name": "Weekly", "used": 1.0}]}
        calls = self.patched(ok, {"state": "unknown", "why": "x"})
        self.assertEqual(machine.claude(), ok)
        self.assertEqual(calls, [])

    def test_nothing_reported_and_usage_empty_says_no_session_has_reported(self):
        self.patched(None, {"state": "unknown", "why": machine.NO_LIMITS})
        got = machine.claude()
        self.assertEqual(got["state"], "unknown")
        self.assertIn("no Claude session has reported limits yet", got["why"])

    def test_a_stale_report_explains_itself_when_usage_is_empty(self):
        stale = {"state": "unknown", "why": "Claude hasn't reported limits since 3 h ago"}
        self.patched(stale, {"state": "unknown", "why": machine.NO_LIMITS})
        self.assertEqual(machine.claude(), stale)

    def test_a_working_usage_answer_still_stands(self):
        ok = {"state": "ok", "windows": [{"name": "5-hour", "used": 3.0}]}
        self.patched(None, ok)
        self.assertEqual(machine.claude(), ok)

    def test_limits_keeps_its_shape(self):
        ok = {"state": "ok", "windows": [{"name": "Weekly", "used": 1.0}]}
        self.patched(ok, None)
        orig = machine.codex
        machine.codex = lambda: None
        self.addCleanup(lambda: setattr(machine, "codex", orig))
        got = machine.limits()["claude"]
        self.assertEqual((got["state"], got["windows"]), ("ok", ok["windows"]))
        self.assertIn("at", got)


class Wrap(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.settings = os.path.join(self.d, "settings.json")
        self.mod = load_shepherdr()

    def run_cmd(self, action):
        a = self.mod.argparse.Namespace(action=action, settings=self.settings, root=self.d, dry_run=False)
        self.mod.cmd_statusline(a)

    def put(self, doc, raw=None):
        open(self.settings, "w").write(raw if raw is not None else json.dumps(doc, indent=2, ensure_ascii=False) + "\n")

    def test_on_wraps_the_command_and_off_gives_back_the_same_bytes(self):
        self.put({"theme": "dark — é", "statusLine": {"type": "command", "command": "bash /x/it's here.sh", "padding": 1}})
        before = open(self.settings, "rb").read()
        self.run_cmd("on")
        sl = json.load(open(self.settings))["statusLine"]
        self.assertIn("shepherdr-statusline-tap --then ", sl["command"])
        self.assertEqual(sl["padding"], 1)
        self.run_cmd("on")   # again: no double wrap
        self.assertEqual(json.load(open(self.settings))["statusLine"]["command"].count("--then"), 1)
        self.run_cmd("off")
        self.assertEqual(open(self.settings, "rb").read(), before)

    def test_the_wrapped_command_really_prints_what_the_original_did(self):
        self.put({"statusLine": {"type": "command", "command": "cat | tr a-z A-Z"}})
        tap = os.path.join(self.d, ".local", "bin")
        os.makedirs(tap)
        os.symlink(TAP, os.path.join(tap, "shepherdr-statusline-tap"))
        self.run_cmd("on")
        cmd = json.load(open(self.settings))["statusLine"]["command"]
        r = subprocess.run(["/bin/sh", "-c", cmd], input=b"hello", stdout=subprocess.PIPE, env={"PATH": os.environ["PATH"], "HOME": os.environ["HOME"], "SHEPHERDR_HOME": self.d})
        self.assertEqual(r.stdout, b"HELLO")

    def test_no_status_line_to_wrap_is_left_alone(self):
        self.put({"theme": "dark"})
        before = open(self.settings, "rb").read()
        with self.assertRaises(self.mod.Stop):
            self.run_cmd("on")
        self.assertEqual(open(self.settings, "rb").read(), before)

    def test_the_files_permissions_stay(self):
        self.put({"statusLine": {"type": "command", "command": "echo hi"}})
        os.chmod(self.settings, 0o600)
        self.run_cmd("on")
        self.assertEqual(os.stat(self.settings).st_mode & 0o777, 0o600)

    def test_a_settings_file_that_isnt_json_is_left_alone(self):
        self.put(None, raw="{nope")
        with self.assertRaises(self.mod.Stop):
            self.run_cmd("on")
        self.assertEqual(open(self.settings).read(), "{nope")

    def test_a_backup_is_kept(self):
        self.put({"statusLine": {"type": "command", "command": "echo hi"}})
        self.run_cmd("on")
        self.assertTrue(os.path.exists(self.settings + ".shepherdr-bak"))


if __name__ == "__main__":
    unittest.main()
