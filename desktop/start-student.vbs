' Class Speaker - Student device launcher (no console window)
Option Explicit
Dim fso, sh, dir, url, exe, list, i

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

dir = fso.GetParentFolderName(WScript.ScriptFullName)
url = "file:///" & Replace(dir, "\", "/") & "/student.html"
url = Replace(url, " ", "%20")

list = Array( _
  sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe", _
  sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Microsoft\Edge\Application\msedge.exe", _
  sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Google\Chrome\Application\chrome.exe", _
  sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Google\Chrome\Application\chrome.exe", _
  sh.ExpandEnvironmentStrings("%LocalAppData%") & "\Google\Chrome\Application\chrome.exe" )

exe = ""
For i = 0 To UBound(list)
  If fso.FileExists(list(i)) Then
    exe = list(i)
    Exit For
  End If
Next

If exe = "" Then
  MsgBox "Edge / Chrome not found." & vbCrLf & "Please install Microsoft Edge and try again.", 48, "Class Speaker"
  WScript.Quit
End If

sh.Run """" & exe & """ --app=""" & url & """ --no-first-run --no-default-browser-check", 1, False
