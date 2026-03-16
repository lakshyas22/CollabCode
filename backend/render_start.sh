#!/bin/bash
# Render start script — runs database migrations then starts server
uvicorn main:app --host 0.0.0.0 --port $PORT
