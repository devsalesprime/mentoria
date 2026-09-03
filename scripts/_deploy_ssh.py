"""
Ad-hoc deploy helper invoked by @devops via paramiko.
Reads SSH_IP and SSH_PASSWORD from the parent .env, runs a single shell command on
the VPS, and prints stdout/stderr. Designed to be invoked with --cmd "<shell>".

Not part of the application runtime; safe to delete after deploy.
"""
import os
import re
import sys
import argparse
from pathlib import Path

import paramiko


def load_env(env_path: Path) -> dict:
    env = {}
    if not env_path.exists():
        return env
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def parse_ssh_ip(raw: str) -> tuple[str, str, int]:
    # Accepts forms like: "ssh root@1.2.3.4", "root@1.2.3.4", "1.2.3.4"
    raw = raw.strip()
    raw = re.sub(r"^ssh\s+", "", raw)
    user = "root"
    host = raw
    port = 22
    if "@" in raw:
        user, host = raw.split("@", 1)
    if ":" in host:
        host, port_s = host.rsplit(":", 1)
        port = int(port_s)
    return user, host, port


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cmd", required=True, help="Shell command to run on the VPS")
    parser.add_argument("--timeout", type=int, default=900, help="Command timeout (s)")
    args = parser.parse_args()

    here = Path(__file__).resolve()
    env_paths = [
        here.parents[2] / ".env",   # Entregáveis/.env
        here.parents[1] / ".env",   # mentoria-main/.env
    ]
    env = {}
    for p in env_paths:
        env.update(load_env(p))

    ssh_ip = env.get("SSH_IP")
    ssh_password = env.get("SSH_PASSWORD")
    if not ssh_ip or not ssh_password:
        print("ERROR: SSH_IP / SSH_PASSWORD missing in .env", file=sys.stderr)
        sys.exit(2)

    user, host, port = parse_ssh_ip(ssh_ip)
    print(f"[ssh] {user}@{host}:{port}", file=sys.stderr)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            hostname=host,
            port=port,
            username=user,
            password=ssh_password,
            look_for_keys=False,
            allow_agent=False,
            timeout=30,
        )
    except Exception as exc:
        print(f"ERROR: SSH connect failed: {exc}", file=sys.stderr)
        sys.exit(3)

    try:
        stdin, stdout, stderr = client.exec_command(args.cmd, timeout=args.timeout)
        out = stdout.read()
        err = stderr.read()
        rc = stdout.channel.recv_exit_status()
        # Write raw bytes to bypass Windows cp1252 stdout encoding
        if out:
            sys.stdout.buffer.write(out)
            if not out.endswith(b"\n"):
                sys.stdout.buffer.write(b"\n")
            sys.stdout.flush()
        if err:
            sys.stderr.buffer.write(err)
            if not err.endswith(b"\n"):
                sys.stderr.buffer.write(b"\n")
            sys.stderr.flush()
        sys.exit(rc)
    finally:
        client.close()


if __name__ == "__main__":
    main()
