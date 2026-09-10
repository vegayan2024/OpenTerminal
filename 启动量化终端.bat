@echo off
chcp 65001 >nul
title OpenTerminal - 中国市场量化与大宗商品终端
cd /d "%~dp0"

echo ========================================================
echo   正在启动 OpenTerminal (中国市场与大宗化工品全景终端)
echo ========================================================

:: 0. 释放潜在被占用的 3000、4000、4001 端口
echo [*] 正在清理端口占用 (3000, 4000, 4001)...
powershell -Command "Get-NetTCPConnection -LocalPort 3000, 4000, 4001 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1

:: 1. 启动中国金融数据 Python 微服务 (端口 4001)
echo [*] 正在启动金融数据调度微服务 (端口 4001)...
start "ChinaDataBridge" /min python server/pybridge/china_data_service.py

:: 2. 等待微服务就绪
timeout /t 3 /nobreak >nul

:: 3. 自动在浏览器打开本地前端地址
echo [*] 准备打开浏览器终端 http://127.0.0.1:3000 ...
start http://127.0.0.1:3000

:: 4. 启动前后端整合开发服务
echo [*] 正在启动 OpenTerminal API (4000) 与 Web 终端 (3000)...
npm run dev
