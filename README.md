# CollabCode — Real-time Collaborative Code Editor

## Quick Start (Docker — recommended)

```bash
# 1. Unzip and enter the project
unzip collabcode-fullstack.zip
cd collabcode-fullstack

# 2. First time only — clean build
docker compose down --rmi all --volumes 2>/dev/null; true
docker compose build --no-cache

# 3. Start everything
docker compose up

# 4. Open in browser
# Frontend:  http://localhost:5173
# API docs:  http://localhost:8000/docs
```

**Subsequent runs:** just `docker compose up`

---

## Requirements
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

---

## Features
- **Real-time collaboration** — multiple users edit simultaneously
- **CodeMirror 6 editor** — VS Code-quality with real cursor, selection, syntax highlighting
- **VS Code shortcuts** — Ctrl+S save, Ctrl+Enter run, Ctrl+/ comment, Alt+↑↓ move line, Ctrl+D multi-select, Ctrl+F find
- **Live preview** — instant HTML/CSS/JS preview panel
- **Integrated terminal** — run Python, JavaScript, Go, Ruby, Bash and more
- **Error highlighting** — errors from terminal output highlight the relevant lines
- **Version snapshots** — save and restore file versions
- **Google Sign-In** — optional, see below

---

## Google Sign-In (optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add `http://localhost:5173` to **Authorized JavaScript origins**
4. Copy the Client ID (format: `123...apps.googleusercontent.com`)
5. Edit `.env` and set: `VITE_GOOGLE_CLIENT_ID=your_client_id_here`
6. Rebuild: `docker compose build frontend && docker compose up`

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` / `Cmd+S` | Save file |
| `Ctrl+Enter` / `Cmd+Enter` | Run code |
| `Ctrl+Shift+F` | Format code |
| `Ctrl+/` | Toggle comment |
| `Alt+↑` / `Alt+↓` | Move line up/down |
| `Ctrl+D` | Select next occurrence |
| `Ctrl+Shift+K` | Delete line |
| `Ctrl+Shift+D` | Duplicate line |
| `Ctrl+F` | Find in file |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Tab` / `Shift+Tab` | Indent / Dedent |

---

## Troubleshooting

**Port already in use:**
```bash
docker compose down
docker compose up
```

**Fresh start (clears all data):**
```bash
docker compose down --volumes
docker compose build --no-cache
docker compose up
```

**Frontend shows blank page:**
- Wait 10–15 seconds for all services to fully start
- Refresh the page
- Check `docker compose logs frontend` for errors

**Can't connect / API errors:**
```bash
docker compose logs backend
docker compose logs frontend
```
