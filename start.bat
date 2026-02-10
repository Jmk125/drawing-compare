@echo off
set PATH=%~dp0tools\bin;%~dp0node;%PATH%
start http://localhost:3500
node server.js
