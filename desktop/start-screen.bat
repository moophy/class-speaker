@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
set "DIR=%~dp0"
set "URL=file:///!DIR:\=/!screen.html"
set "URL=!URL: =%%20!"
set "EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "!EXE!" set "EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "!EXE!" set "EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "!EXE!" set "EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "!EXE!" set "EXE=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "!EXE!" (
  echo Edge / Chrome not found. Please install Microsoft Edge first.
  pause
  exit /b 1
)
start "" "!EXE!" --app="!URL!" --start-fullscreen --no-first-run --no-default-browser-check
exit /b 0
