@echo off
rem Fallback launcher: opens the student page in the system default browser.
rem For the borderless app window (recommended), use start-student.vbs instead.
start "" "%~dp0student.html"
exit /b 0
