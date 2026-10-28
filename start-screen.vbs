' Class Speaker - Classroom Screen launcher (no console window)
Option Explicit
Dim fso, sh, dir, url, exe, list, i

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

dir = fso.GetParentFolderName(WScript.ScriptFullName)
url = Utf8Url("file:///" & Replace(dir, "\", "/") & "/screen.html")

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
  ' Edge / Chrome not found: fall back to the system default browser
  sh.Run url, 1, False
  WScript.Quit
End If

sh.Run """" & exe & """ --app=""" & url & """ --start-fullscreen --no-first-run --no-default-browser-check", 1, False

' Convert the local path into UTF-8 percent-encoding so Chinese / spaced folders work
Function Utf8Url(s)
  Dim i, c, out, b1, b2, b3
  out = ""
  For i = 1 To Len(s)
    c = AscW(Mid(s, i, 1))
    If c < 0 Then c = c + 65536
    If c < 128 Then
      If (c >= 48 And c <= 57) Or (c >= 65 And c <= 90) Or (c >= 97 And c <= 122) _
         Or c = 45 Or c = 46 Or c = 95 Or c = 126 Or c = 47 Or c = 58 Then
        out = out & Chr(c)
      Else
        out = out & "%" & Hex2(c)
      End If
    ElseIf c < 2048 Then
      b1 = 192 + Int(c / 64)
      b2 = 128 + (c Mod 64)
      out = out & "%" & Hex2(b1) & "%" & Hex2(b2)
    Else
      b1 = 224 + Int(c / 4096)
      b2 = 128 + (Int(c / 64) Mod 64)
      b3 = 128 + (c Mod 64)
      out = out & "%" & Hex2(b1) & "%" & Hex2(b2) & "%" & Hex2(b3)
    End If
  Next
  Utf8Url = out
End Function

Function Hex2(n)
  Dim h
  h = Hex(n)
  If Len(h) < 2 Then h = "0" & h
  Hex2 = h
End Function
