"""Runs the launcher in a real pty and prints one JSON line per scenario.

Usage: python3 wrapper_pty.py <launcher-script-file> <shell>
"""
import json
import os
import pty
import re
import select
import sys
import tempfile
import time

NONCE = "testnonce"


def run(launcher, shell, cmd, typed="", interrupt_after=None, timeout=8.0):
    home = tempfile.mkdtemp()
    if shell.endswith("zsh"):
        open(os.path.join(home, ".zshrc"), "w").write("alias hello='echo rc-loaded'\n")
    else:
        open(os.path.join(home, ".bashrc"), "w").write("alias hello='echo rc-loaded'\n")
        open(os.path.join(home, ".bash_profile"), "w").write(". ~/.bashrc\n")
    pid, fd = pty.fork()
    if pid == 0:
        os.environ.clear()
        os.environ.update(PATH="/usr/bin:/bin", HOME=home, SHELL=shell, TERM="xterm", TMPDIR="/tmp")
        os.execv("/bin/sh", ["/bin/sh", "-c", launcher, "inline-terminal", cmd, NONCE])
    out = b""
    start = time.time()
    interrupted = typed_sent = False
    while time.time() - start < timeout:
        ready, _, _ = select.select([fd], [], [], 0.1)
        if ready:
            try:
                data = os.read(fd, 65536)
            except OSError:
                break
            if not data:
                break
            out += data
        elapsed = time.time() - start
        if interrupt_after is not None and not interrupted and elapsed > interrupt_after:
            os.write(fd, b"\x03")
            interrupted = True
        marker_seen = f"{NONCE};exit;".encode() in out
        settle = interrupted and elapsed > interrupt_after + 1.5
        if typed and not typed_sent and (marker_seen or settle):
            time.sleep(0.5)
            os.write(fd, typed.encode())
            typed_sent = True
    try:
        os.kill(pid, 9)
    except OSError:
        pass
    text = out.decode(errors="replace")
    match = re.search(NONCE + r";exit;(\d+)", text)
    return (int(match.group(1)) if match else None), text


def printed(text, word):
    return word in text.replace("echo " + word, "")


launcher = open(sys.argv[1]).read()
shell = sys.argv[2]

code, text = run(launcher, shell, "hello; FOO=persist; cd /tmp", "echo AFTER:$FOO:$PWD\nexit\n")
print(json.dumps({"case": "state", "code": code, "rc": "rc-loaded" in text, "kept": "AFTER:persist:/tmp" in text}))

code, _ = run(launcher, shell, "exit 4")
print(json.dumps({"case": "exit", "code": code}))

code, text = run(launcher, shell, "sleep 5; echo NEXT", "echo ALIVE\nexit\n", interrupt_after=1.5)
print(json.dumps({"case": "interrupt", "code": code, "alive": printed(text, "ALIVE"), "next": printed(text, "NEXT")}))
