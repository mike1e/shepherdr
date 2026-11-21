"""A task belongs to the space that owns its folder (MSHEP-17).

Task news goes to the Assistant of the task's space (news.py: coordinator_in), so a task given
the wrong space at start (the caller's, by default) sent its alerts to another folder's
Assistant. Here: the space a task starts in is its folder's own space; an Assistant of another
space can't start or act on it (the home coordinator, whose space is the person's home folder,
and --force can); a folder no space owns says so instead of borrowing the caller's.
"""

import os

from .base import Fail, HOME, hc_json
from .settings import ASSISTANT_TEMPLATES, bare

# Commands that act on a task or an automation of a folder: an Assistant of another space is refused.
GUARDED = {"start", "review-more", "accept", "merge", "done", "reopen", "edit", "dequeue", "rm", "resume",
           "switch", "fix", "unarchive"}
GUARDED_AUTO = {"add", "edit", "rm", "pause", "resume", "run-now"}

NO_SPACE = ('No space owns {folder}: create one (herdr-app do space.new --name "[PFX] {name}" --folder {folder}) '
            "and its Assistant tab, then start the task with --space.")
WRONG_SPACE = ("{folder} belongs to space {name}, not {mine}: its tasks go through its own Assistant{who} "
               '(herdr-task tell-assistant {sid} "<what you need>" to ask it). '
               "Only the home Assistant, or --force, may work in another space's folder.")


def real(p):
    return os.path.realpath(os.path.expanduser(p)) if p else None


def spaces_here():
    """This computer's spaces with a folder from the window's list [{id, name, folder}]; None when
    no window here can say (a VM has none)."""
    from .autopilot import window_spaces
    rows = window_spaces()
    if not rows:
        return None
    return [x for x in rows if "/" not in x["id"] and not x.get("machine")]


def owner_of(folder, spaces=None):
    """The space that owns `folder` here: {id, name} from a space whose folder it is, else from a
    live Assistant working in it; None when none does."""
    folder = real(folder)
    spaces = spaces_here() if spaces is None else spaces
    for x in spaces or []:
        if real(x.get("folder")) == folder:
            return {"id": bare(x["id"]), "name": x.get("name") or bare(x["id"])}
    from .launch import coordinators
    for addr in coordinators():
        k = hc_json("get", addr) or {}
        labels = k.get("labels") or {}
        sp = labels.get("herdr.space") or labels.get("herdr.coordinator.space")
        if sp and real(k.get("cwd")) == folder:
            return {"id": bare(sp), "name": sp}
    return None


def caller(spaces=None):
    """Who runs this command: {space, assistant (an Assistant's own pane), home (its space is the
    person's home folder)}; None when it isn't in a space (the person at a terminal, the web app)."""
    me = os.environ.get("HC_TERMINAL_ID")
    k = hc_json("get", me) if me else None
    labels = (k or {}).get("labels") or {}
    space = labels.get("herdr.space") or labels.get("herdr.coordinator.space") or labels.get("herdr.task.space")
    if not space:
        return None
    assistant = labels.get("herdr.role") == "coordinator" or k.get("template") in ASSISTANT_TEMPLATES
    own = next((x for x in (spaces_here() if spaces is None else spaces) or [] if bare(x["id"]) == bare(space)), None)
    folder = (own or {}).get("folder") or k.get("cwd")
    return {"space": bare(space), "assistant": assistant, "home": real(folder) == real(HOME)}


def _wrong(folder, owner, c):
    from .launch import coordinator_in
    to = coordinator_in(owner["id"])
    return WRONG_SPACE.format(folder=folder, name=f"{owner['name']} ({owner['id']})", mine=f"yours ({c['space']})",
                              who=f" ({to})" if to else "", sid=owner["id"])


def space_for_new(folder, explicit=None, force=False):
    """The space a new task or automation of `folder` starts in. Without --space: the folder's own
    space, even for the home Assistant. With --space: that one when it owns the folder, when no
    space does, or when the caller is the home Assistant, outside a space, or --force; else
    refused. Fails when no space owns the folder and there is no --space. None: no window here
    lists spaces (a VM), the caller's own space is used as before."""
    spaces = spaces_here()
    owner = owner_of(folder, spaces)
    if explicit:
        sp = bare(explicit)
        if not owner or owner["id"] == sp or force:
            return sp
        c = caller(spaces)
        if c is None or c["home"]:
            return sp
        raise Fail(_wrong(folder, owner, c))
    if owner:
        return owner["id"]
    if spaces is not None:
        raise Fail(NO_SPACE.format(folder=folder, name=os.path.basename(folder.rstrip("/")) or folder))
    return None


def owned_default(folder, fallback):
    """The folder's own space for a task that has none yet; `fallback()` (the caller's) when no
    space owns the folder or none can be listed."""
    owner = owner_of(folder)
    return owner["id"] if owner else fallback()


def guard_foreign(args):
    """Refuses an Assistant of another space (not the home Assistant, no --force) acting on a task
    or automation of a folder another space owns."""
    if getattr(args, "force", False) or getattr(args, "cmd", None) is None:
        return
    if args.cmd == "auto":
        if getattr(args, "auto", None) not in GUARDED_AUTO:
            return
    elif args.cmd not in GUARDED:
        return
    spaces = spaces_here()
    c = caller(spaces)
    if not c or not c["assistant"] or c["home"]:
        return
    from .store import folder_arg, locate
    folder = locate(folder_arg(args))["folder"]
    owner = owner_of(folder, spaces)
    if owner and owner["id"] != c["space"]:
        raise Fail(_wrong(folder, owner, c))
