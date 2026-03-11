import subprocess
from pathlib import Path

def read_file(path):
    return Path(path).read_text()

def write_file(path, content):
    Path(path).write_text(content)
    return f"Wrote {path}"

def list_files(path="."):
    return "\n".join(str(p) for p in Path(path).glob("**/*") if p.is_file())

def run_shell(cmd):
    result = subprocess.run(
        cmd,
        shell=True,
        capture_output=True,
        text=True
    )

    return result.stdout + result.stderr

TOOLS = {
    "read_file": read_file,
    "write_file": write_file,
    "list_files": list_files,
    "run_shell": run_shell
}
