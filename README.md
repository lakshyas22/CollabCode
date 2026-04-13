# CollabCode

A real-time collaborative code editor built for the browser. CollabCode allows multiple users to edit, run, and manage code simultaneously with live synchronization.

---

## Live Demo

Try the application here:  
https://collabcode-beta.vercel.app

- Open the link in multiple tabs or browsers to test real-time collaboration  
- Best experienced on a desktop browser  

---

## Overview

CollabCode is designed to support low-latency collaborative editing using persistent connections and efficient state synchronization. It combines a modern frontend editor with a scalable backend to handle concurrent users and real-time updates.

---

## Features

- Real-time multi-user collaboration with live cursor and selection sync  
- Code editor powered by CodeMirror with syntax highlighting and formatting  
- Live code execution with output streaming  
- Integrated terminal supporting multiple runtimes  
- Version snapshots for saving and restoring code states  
- Secure authentication using JWT with optional Google OAuth  

---

## Architecture

The system is structured as a full-stack application with real-time communication:

- Frontend
  - React-based interface  
  - CodeMirror editor for code interaction  
  - WebSocket client for real-time updates  

- Backend
  - FastAPI-based services handling REST APIs and WebSocket connections  
  - Manages sessions, authentication, and execution workflows  

- Real-time Layer
  - WebSockets for bidirectional communication  
  - Redis Pub/Sub for broadcasting updates across sessions  

- Storage
  - PostgreSQL for persistent data  
  - Redis for caching and transient state  

- Deployment
  - Docker and Docker Compose for containerized environments  

---

## Tech Stack

- Frontend: React.js, Tailwind CSS, CodeMirror  
- Backend: FastAPI, WebSockets  
- Database: PostgreSQL  
- Cache / Messaging: Redis  
- Infrastructure: Docker  

---

## Getting Started

### Prerequisites

- Docker Desktop installed and running  

### Setup

```bash
unzip collabcode-fullstack.zip
cd collabcode-fullstack

docker compose down --rmi all --volumes 2>/dev/null; true
docker compose build --no-cache

docker compose up
```

### Access

- Frontend: http://localhost:5173  
- API Documentation: http://localhost:8000/docs  

For subsequent runs:

```bash
docker compose up
```

---

## Development Notes

- WebSocket connections are used to maintain real-time state across clients  
- Redis Pub/Sub enables message propagation across instances  
- Backend services are designed to handle concurrent users using async processing  
- Docker ensures consistent local and deployment environments  

---

## Keyboard Shortcuts

| Shortcut | Action |
|--------|--------|
| Ctrl+S / Cmd+S | Save file |
| Ctrl+Enter | Run code |
| Ctrl+/ | Toggle comment |
| Ctrl+D | Select next occurrence |
| Ctrl+F | Find |
| Alt+↑ / Alt+↓ | Move line |

---

## Future Work

- Improved conflict resolution (OT/CRDT-based synchronization)  
- Horizontal scaling with load balancing  
- Persistent collaborative workspaces  
- Access control and team-based features  

---

## License

This project is for educational and development purposes.
