@echo off
start cmd /k. "cd /d backend && call .\.venv\Scripts\activate.bat && py main.py"
timeout /t 2 >nul
start cmd /k "cd frontend && npm run dev:https"