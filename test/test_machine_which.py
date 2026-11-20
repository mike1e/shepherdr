"""machine.py's which() finds a CLI that a Node version manager installed (nvm, fnm, volta), newest version first."""
import home_guard  # noqa: F401  (first: every test on a throwaway home, never the real one)
import importlib.util, os, tempfile, unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("machine", os.path.join(ROOT, "mods/tasks/bin/herdr_task/machine.py"))
machine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(machine)


def put(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write("#!/bin/sh\n")
    os.chmod(path, 0o755)


class WhichNodeManagers(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp()
        self.env = mock.patch.dict(os.environ, {"PATH": "/usr/bin:/bin"})
        self.env.start()
        for k in ("NVM_DIR", "FNM_DIR", "VOLTA_HOME"):
            os.environ.pop(k, None)
        self.h = mock.patch.object(machine, "HOME", self.home)
        self.h.start()
        self.p = mock.patch.object(machine, "PATHS", [])
        self.p.start()

    def tearDown(self):
        self.p.stop(), self.h.stop(), self.env.stop()

    def test_nvm_newest_version_first(self):
        for v in ("v9.9.0", "v24.14.0", "v18.20.1"):
            put(os.path.join(self.home, ".nvm/versions/node", v, "bin/codexfake"))
        self.assertEqual(machine.which("codexfake"), os.path.join(self.home, ".nvm/versions/node/v24.14.0/bin/codexfake"))

    def test_fnm_and_volta(self):
        put(os.path.join(self.home, ".local/share/fnm/node-versions/v20.1.0/installation/bin/fnmfake"))
        put(os.path.join(self.home, ".volta/bin/voltafake"))
        self.assertTrue(machine.which("fnmfake").endswith("v20.1.0/installation/bin/fnmfake"))
        self.assertTrue(machine.which("voltafake").endswith(".volta/bin/voltafake"))

    def test_newer_fnm_beats_older_nvm(self):
        put(os.path.join(self.home, ".nvm/versions/node/v18.0.0/bin/mixfake"))
        put(os.path.join(self.home, ".local/share/fnm/node-versions/v22.0.0/installation/bin/mixfake"))
        self.assertIn("fnm/node-versions/v22.0.0", machine.which("mixfake"))

    def test_missing_cli_is_none(self):
        self.assertIsNone(machine.which("nothing-like-this"))

    def test_sealed_run_puts_the_cli_folder_on_path(self):
        binary = os.path.join(self.home, ".nvm/versions/node/v24.14.0/bin/codex")
        put(binary)
        put(os.path.join(self.home, ".nvm/versions/node/v24.14.0/bin/node"))
        link = os.path.join(self.home, "local-bin", "codex")
        os.makedirs(os.path.dirname(link))
        os.symlink(binary, link)
        path = machine._with_dir(link).split(os.pathsep)
        self.assertIn(os.path.dirname(binary), path)
        self.assertIn(os.path.join(self.home, ".nvm/versions/node/v24.14.0/bin"), path)


if __name__ == "__main__":
    unittest.main()
