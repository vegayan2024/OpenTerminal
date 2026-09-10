@echo off
chcp 65001 >nul
title OpenTerminal - 中国市场量化与大宗商品终端
echo ========================================================
echo   正在启动 OpenTerminal (中国市场与大宗化工品全景终端)
echo ========================================================

:: 1. 启动中国金融数据 Python 微服务 (端口 4001)
echo [*] 正在启动金融数据调度微服务 (端口 4001)...
start "ChinaDataBridge" /min python server/pybridge/china_data_service.py

:: 2. 等待微服务就绪
timeout /t 2 /nobreak >nul

:: 3. 启动前端与服务端开发服务
echo [*] 正在启动 OpenTerminal API (4000) 与 Web 终端 (3000)...
start http://localhost:3000
npm run dev
