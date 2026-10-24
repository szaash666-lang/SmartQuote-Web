@echo off
chcp 65001 >nul
cd /d "%~dp0"

set PORT=8080
set URL=http://localhost:%PORT%

echo ============================================
echo   SmartQuote 网页版 - 本地查看
echo   访问地址：%URL%
echo   （请保持本窗口开启，关闭即停止）
echo ============================================
echo.

where python >nul 2>nul
if %errorlevel%==0 (
    echo 已检测到 Python，正在启动...
    start "" cmd /c "timeout /t 2 >nul & start %URL%"
    python preview_server.py
    exit /b
)

where node >nul 2>nul
if %errorlevel%==0 (
    echo 已检测到 Node.js，正在启动...
    start "" cmd /c "timeout /t 2 >nul & start %URL%"
    npx --yes http-server -p %PORT% -c-1
    exit /b
)

echo 未检测到 Python 或 Node.js。
echo 请安装 Python（https://www.python.org）后重新双击本文件。
pause
