# -*- coding: utf-8 -*-
"""
OpenTerminal 中国金融数据统一调度微服务 (China Financial Data Service)
==================================================================
基于轻量 HTTP 协议，内部集成 financial_data_provider 统一调度层：
  1. 优先级：同花顺 (THS) > TuShare Pro > AKShare > 本地兜底
  2. 提供标准化的 REST API 给 Express 后端 (端口 4001)
"""

import os
import sys
import json
import logging
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timedelta

# 加入工作区根目录以导入统一 financial_data_provider
WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(WORKSPACE_ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT / "scripts"))

try:
    from financial_data_provider import data_hub
except ImportError:
    # 兼容回退
    data_hub = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [ChinaBridge] %(message)s")
logger = logging.getLogger("ChinaDataBridge")

PORT = 4001

class ChinaDataHandler(BaseHTTPRequestHandler):
    def _send_json(self, data: dict, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # 1. 健康探针
        if path == "/health":
            self._send_json({"status": "ok", "time": datetime.now().isoformat()})
            return

        # 2. 个股实时报价与基本面
        if path == "/api/quote":
            symbol = query.get("symbol", ["600519"])[0]
            clean_code = symbol.split(".")[0]
            try:
                if data_hub:
                    res = data_hub.get_stock_quote(clean_code)
                else:
                    res = {
                        "code": clean_code,
                        "name": f"股票{clean_code}",
                        "stockPrice": 100.0,
                        "marketCap": 500.0,
                        "pbRatio": 2.5,
                        "peRatio": 20.0,
                        "_source": "LOCAL_FALLBACK"
                    }
                self._send_json(res)
            except Exception as e:
                logger.error(f"Quote error: {e}")
                self._send_json({"error": str(e)}, status=500)
            return

        # 3. 指数基准报价
        if path == "/api/index":
            symbol = query.get("symbol", ["000300"])[0]
            clean_code = symbol.split(".")[0]
            try:
                if data_hub:
                    res = data_hub.get_index_quote(clean_code)
                else:
                    res = {
                        "code": clean_code,
                        "name": "沪深300",
                        "close": 3900.0,
                        "changePercent": 0.5,
                        "_source": "LOCAL_FALLBACK"
                    }
                self._send_json(res)
            except Exception as e:
                logger.error(f"Index error: {e}")
                self._send_json({"error": str(e)}, status=500)
            return

        # 4. K线时序数据 (日K/周K)
        if path == "/api/candles":
            symbol = query.get("symbol", ["600519"])[0]
            period = query.get("period", ["daily"])[0]
            clean_code = symbol.split(".")[0]
            candles = self._fetch_candles(clean_code, period)
            self._send_json({"symbol": clean_code, "period": period, "candles": candles})
            return

        # 5. 7x24 财经快讯
        if path == "/api/news":
            news_items = self._fetch_news()
            self._send_json({"items": news_items})
            return

        self._send_json({"error": "Not Found"}, status=404)

    def _fetch_candles(self, code: str, period: str = "daily"):
        """获取K线，格式化为 lightweight-charts 标准 { time: 'YYYY-MM-DD', open, high, low, close, volume }"""
        # 1. 尝试使用 AkShare
        try:
            import akshare as ak
            market = "sh" if code.startswith("6") else "sz"
            start_date = (datetime.now() - timedelta(days=365)).strftime("%Y%m%d")
            end_date = datetime.now().strftime("%Y%m%d")
            
            # 复权日K
            df = ak.stock_zh_a_hist(symbol=code, period=period, start_date=start_date, end_date=end_date, adjust="qfq")
            if df is not None and not df.empty:
                records = []
                for _, row in df.iterrows():
                    d_str = str(row["日期"])[:10]
                    records.append({
                        "time": d_str,
                        "open": float(row["开盘"]),
                        "high": float(row["最高"]),
                        "low": float(row["最低"]),
                        "close": float(row["收盘"]),
                        "volume": float(row["成交量"])
                    })
                return records
        except Exception as e:
            logger.warning(f"AKShare candles failed: {e}")

        # 兜底返回空列表
        return []

    def _fetch_news(self):
        """获取最新财经快讯 (优先财联社/新浪)"""
        try:
            import akshare as ak
            df = ak.stock_info_global_cls(symbol="全部")
            if df is not None and not df.empty:
                items = []
                for _, row in df.head(30).iterrows():
                    items.append({
                        "title": str(row.get("标题", "") or str(row.get("内容", ""))[:60]),
                        "summary": str(row.get("内容", "")),
                        "time": str(row.get("发布时间", "")),
                        "source": "财联社"
                    })
                return items
        except Exception as e:
            logger.warning(f"News fetch error: {e}")
        return []

def run_server():
    server_address = ("127.0.0.1", PORT)
    httpd = HTTPServer(server_address, ChinaDataHandler)
    logger.info(f"[*] 中国市场微服务运行在 http://127.0.0.1:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()

if __name__ == "__main__":
    run_server()
