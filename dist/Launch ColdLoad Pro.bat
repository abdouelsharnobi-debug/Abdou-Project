@echo off
rem Launch ColdLoad Pro in its own app window (Microsoft Edge or Google Chrome).
setlocal
set "APP=%~dp0ColdLoadPro.html"
set "URL=file:///%APP:\=/%"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" goto edge
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" goto chrome
start "" "%APP%"
goto :eof
:edge
start "" "%EDGE%" --app="%URL%"
goto :eof
:chrome
start "" "%CHROME%" --app="%URL%"
