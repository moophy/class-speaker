@echo off
rem Fallback launcher: opens the classroom screen page in the system default browser.
rem For the borderless app window (recommended), use start-screen.vbs instead.
start "" "%~dp0screen.html"
exit /b 0
