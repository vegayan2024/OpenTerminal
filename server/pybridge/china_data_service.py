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
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timedelta

# 加入工作区根目录以导入统一 financial_data_provider
WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(WORKSPACE_ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT / "scripts"))

try:
    from financial_data_provider import data_hub
except ImportError:
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
            period = query.get("period", ["6M"])[0]
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

    def _fetch_candles(self, code: str, period: str = "6M"):
        """获取K线，格式化为 lightweight-charts 标准 { time: 'YYYY-MM-DD', open, high, low, close, volume }"""
        clean_code = code.split(".")[0]
        days_map = {
            "1D": 30,
            "5D": 60,
            "1M": 90,
            "6M": 240,
            "YTD": 300,
            "1Y": 365,
            "5Y": 365 * 5,
            "MAX": 365 * 10,
        }
        days = days_map.get(period.upper(), 365)
        scale_freq = "weekly" if days > 365 * 3 else "daily"

        # 1. 优先尝试 AKShare
        try:
            import akshare as ak
            start_date = (datetime.now() - timedelta(days=days)).strftime("%Y%m%d")
            end_date = datetime.now().strftime("%Y%m%d")
            
            is_index = clean_code.startswith("000") and clean_code in ["000001", "000300", "000905", "000852", "000016"]
            if is_index:
                df = ak.stock_zh_index_daily(symbol=f"sh{clean_code}")
            else:
                df = ak.stock_zh_a_hist(symbol=clean_code, period=scale_freq, start_date=start_date, end_date=end_date, adjust="qfq")

            if df is not None and not df.empty:
                records = []
                for _, row in df.iterrows():
                    d_str = str(row.get("date", row.get("日期", "")))[:10]
                    records.append({
                        "time": d_str,
                        "open": float(row.get("open", row.get("开盘", 0))),
                        "high": float(row.get("high", row.get("最高", 0))),
                        "low": float(row.get("low", row.get("最低", 0))),
                        "close": float(row.get("close", row.get("收盘", 0))),
                        "volume": float(row.get("volume", row.get("成交量", 0)))
                    })
                if records:
                    return records
        except Exception as e:
            logger.warning(f"AKShare candles failed ({clean_code}): {e}")

        # 2. 降级备用通道：新浪直连快速 K 线通道
        try:
            import urllib.request
            prefix = "sh" if clean_code.startswith("6") or clean_code in ["000001", "000300"] else "sz"
            symbol_with_market = f"{prefix}{clean_code}"
            datalen = min(days, 800)
            url = f"http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol={symbol_with_market}&scale=240&ma=no&datalen={datalen}"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=4) as resp:
                raw = resp.read().decode("gbk", errors="ignore")
                data = json.loads(raw)
                if isinstance(data, list) and len(data) > 0:
                    records = []
                    for item in data:
                        records.append({
                            "time": str(item["day"])[:10],
                            "open": float(item["open"]),
                            "high": float(item["high"]),
                            "low": float(item["low"]),
                            "close": float(item["close"]),
                            "volume": float(item["volume"])
                        })
                    return records
        except Exception as e:
            logger.warning(f"Sina direct candles failed ({clean_code}): {e}")

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
    httpd = ThreadingHTTPServer(server_address, ChinaDataHandler)
    logger.info(f"[*] 中国市场多线程微服务运行在 http://127.0.0.1:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()

if __name__ == "__main__":
    run_server()
