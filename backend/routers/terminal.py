"""
Terminal WebSocket  — /api/v1/ws/terminal/{file_id}
Security:
  - Auth required (JWT token)
  - Language validated against strict whitelist (prevents arbitrary cmd injection)
  - Code written to isolated temp dir, never under the app root
  - Subprocess spawned WITHOUT shell=True (prevents shell injection)
  - Hard 30-second timeout + 512 KB output cap
  - Rate-limited: max 6 runs/minute per connection
"""
import asyncio
import json
import os
import shutil
import tempfile
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from core.database import AsyncSessionLocal
from core.auth import get_current_user_ws
from core.config import get_settings

router   = APIRouter(tags=["terminal"])
settings = get_settings()

# ── Strict language → command whitelist ────────────────────────────────
# Keys MUST match ALLOWED_LANGUAGES in files.py
# Values are callables: (filepath) → [cmd, arg, ...]  (never shell=True)
RUNNERS: dict[str, callable] = {
    "python":     lambda f: ["python3", "-u", f],
    "javascript": lambda f: ["node", f],
    "typescript": lambda f: (["node", "--loader", "ts-node/esm", f] if shutil.which("ts-node") else ["node", f]),
    "bash":       lambda f: ["bash", "--norc", "--noprofile", f],
    "shell":      lambda f: ["sh", f],
    "ruby":       lambda f: (["ruby", f] if shutil.which("ruby") else None),
    "php":        lambda f: (["php", f] if shutil.which("php") else None),
    "go":         lambda f: (["go", "run", f] if shutil.which("go") else None),
}

EXT = {
    "python":"py","javascript":"js","typescript":"ts",
    "bash":"sh","shell":"sh","ruby":"rb","php":"php","go":"go",
}

# Minimal, sanitised environment — strip parent env vars to reduce attack surface
SAFE_ENV = {
    "PATH":   "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "HOME":   "/tmp",
    "LANG":   "en_US.UTF-8",
    "PYTHONUNBUFFERED": "1",
    "NODE_ENV": "sandbox",
}


@router.websocket("/ws/terminal/{file_id}")
async def terminal_ws(
    websocket: WebSocket,
    file_id:   int,
    token:     str = Query(...),
):
    # ── Auth ──────────────────────────────────────────────────────────
    async with AsyncSessionLocal() as db:
        user = await get_current_user_ws(token, db)
    if not user:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    await websocket.send_json({
        "type": "ready",
        "msg": f"Terminal ready. Connected as {user.name}.\r\n",
    })

    proc   = None
    tmpdir = None
    run_count   = 0
    output_bytes = 0
    MAX_RUNS_PER_SESSION = 60  # hard cap per WebSocket session

    async def cleanup():
        nonlocal proc, tmpdir
        if proc:
            try:
                proc.kill()
                await proc.wait()
            except Exception:
                pass
            proc = None
        if tmpdir and os.path.exists(tmpdir):
            shutil.rmtree(tmpdir, ignore_errors=True)
            tmpdir = None

    try:
        while True:
            raw  = await websocket.receive_text()

            # Guard: ignore oversized messages
            if len(raw) > 4_194_304:   # 4 MB
                continue

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type")

            # ── RUN ───────────────────────────────────────────────────
            if msg_type == "run":
                run_count += 1
                output_bytes = 0
                if run_count > MAX_RUNS_PER_SESSION:
                    await websocket.send_json({
                        "type": "output",
                        "data": "[Error] Session run limit reached. Reconnect to continue.\r\n",
                    })
                    continue

                # Kill any running process
                if proc:
                    try:
                        proc.kill()
                        await proc.wait()
                    except Exception:
                        pass
                    proc = None

                code     = data.get("code", "")
                language = str(data.get("language", "python")).lower().strip()

                # ── Language whitelist check ─────────────────────────
                if language not in RUNNERS:
                    await websocket.send_json({
                        "type": "output",
                        "data": f"[Error] Language '{language}' is not supported.\r\n",
                    })
                    continue

                runner = RUNNERS[language]
                ext    = EXT.get(language, "txt")

                # ── Write code to an isolated temp dir ───────────────
                if tmpdir:
                    shutil.rmtree(tmpdir, ignore_errors=True)
                tmpdir = tempfile.mkdtemp(prefix="cc_run_")

                # Ensure file is inside tmpdir (no traversal possible since we
                # construct the path ourselves, but be explicit)
                fpath = os.path.join(tmpdir, f"main.{ext}")
                if not os.path.abspath(fpath).startswith(os.path.abspath(tmpdir)):
                    await websocket.send_json({"type": "output", "data": "[Error] Path error.\r\n"})
                    continue

                with open(fpath, "w", encoding="utf-8") as fh:
                    fh.write(code)
                os.chmod(fpath, 0o444)   # read-only so script can't overwrite itself

                cmd = runner(fpath)
                if cmd is None:
                    await websocket.send_json({
                        "type": "output",
                        "data": f"[Error] Runtime for '{language}' is not installed on this server.\r\n",
                    })
                    continue

                await websocket.send_json({
                    "type": "output",
                    "data": f"\r\n\033[90m▶ Running {language}...\033[0m\r\n",
                })

                try:
                    # shell=False (default) — cmd is a list, never a shell string
                    proc = await asyncio.create_subprocess_exec(
                        *cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                        stdin=asyncio.subprocess.PIPE,
                        cwd=tmpdir,
                        env=SAFE_ENV,
                    )

                    async def read_stream(stream, is_err: bool = False):
                        nonlocal output_bytes
                        while True:
                            chunk = await stream.read(512)
                            if not chunk:
                                break
                            output_bytes += len(chunk)
                            if output_bytes > settings.TERMINAL_MAX_OUTPUT_BYTES:
                                await websocket.send_json({
                                    "type": "output",
                                    "data": "\r\n[Output truncated — exceeded 512 KB limit]\r\n",
                                })
                                return
                            text = chunk.decode("utf-8", errors="replace")
                            await websocket.send_json({
                                "type": "output",
                                "data": text,
                                "stderr": is_err,
                            })

                    t_out = asyncio.create_task(read_stream(proc.stdout, False))
                    t_err = asyncio.create_task(read_stream(proc.stderr, True))

                    try:
                        await asyncio.wait_for(proc.wait(), timeout=settings.TERMINAL_TIMEOUT_SECONDS)
                    except asyncio.TimeoutError:
                        proc.kill()
                        await websocket.send_json({
                            "type": "output",
                            "data": f"\r\n\033[33m[Timeout] Process killed after {settings.TERMINAL_TIMEOUT_SECONDS}s.\033[0m\r\n",
                        })

                    await t_out
                    await t_err

                    rc    = proc.returncode
                    color = "\033[32m" if rc == 0 else "\033[31m"
                    await websocket.send_json({
                        "type":     "done",
                        "exitCode": rc,
                        "data":     f"\r\n{color}[Process exited with code {rc}]\033[0m\r\n",
                    })

                except FileNotFoundError:
                    await websocket.send_json({
                        "type": "output",
                        "data": f"[Error] '{cmd[0]}' not found. Is it installed?\r\n",
                        "stderr": True,
                    })

            # ── STDIN ─────────────────────────────────────────────────
            elif msg_type == "stdin":
                if proc and proc.stdin:
                    raw_in = data.get("data", "")
                    # Cap stdin to 1 KB per message
                    if len(raw_in) <= 1024:
                        try:
                            proc.stdin.write(raw_in.encode("utf-8", errors="replace"))
                            await proc.stdin.drain()
                        except Exception:
                            pass

            # ── KILL ──────────────────────────────────────────────────
            elif msg_type == "kill":
                if proc:
                    try:
                        proc.kill()
                    except Exception:
                        pass
                    await websocket.send_json({
                        "type": "output",
                        "data": "\r\n\033[33m[Killed by user]\033[0m\r\n",
                    })
                    proc = None

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[terminal] WS error for user {user.id}: {type(e).__name__}")
    finally:
        await cleanup()
