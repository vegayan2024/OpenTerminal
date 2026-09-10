import type { Quote, Candle } from "./yahoo.js";

const BRIDGE_BASE = process.env.CHINA_BRIDGE_URL || "http://127.0.0.1:4001";

/**
 * 判断是否属于中国市场标的 (A股股票代码、指数代码)
 * 如 600519, 000001, 300750, 688981, 000300, 000905 或带 .SH/.SZ 后缀
 */
export function isChinaSymbol(symbol: string): boolean {
  if (!symbol) return false;
  const clean = symbol.trim().toUpperCase().split(".")[0];
  // 6位数字代码为典型A股/指数代码
  return /^\d{6}$/.test(clean);
}

/**
 * 获取 A 股或国内指数实时行情
 */
export async function quote(symbol: string): Promise<Quote> {
  const clean = symbol.trim().toUpperCase().split(".")[0];
  const isIndex = clean.startsWith("000") && ["000300", "000905", "000852", "000001", "000016"].includes(clean);
  const endpoint = isIndex ? `${BRIDGE_BASE}/api/index?symbol=${clean}` : `${BRIDGE_BASE}/api/quote?symbol=${clean}`;

  const res = await fetch(endpoint, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) {
    throw new Error(`chinaMarket quote error: ${res.statusText}`);
  }
  const data = (await res.json()) as any;
  if (data.error) {
    throw new Error(data.error);
  }

  const price = Number(data.stockPrice ?? data.close ?? 0);
  const mktCap = data.marketCap ? Number(data.marketCap) * 1e8 : null;
  const pe = data.peRatio ? Number(data.peRatio) : null;
  const pb = data.pbRatio ? Number(data.pbRatio) : null;

  return {
    symbol: clean,
    name: data.name || clean,
    price,
    change: null,
    changePercent: data.changePercent ? Number(data.changePercent) : null,
    open: null,
    high: null,
    low: null,
    previousClose: null,
    bid: null,
    ask: null,
    volume: null,
    avgVolume: null,
    marketCap: mktCap,
    pe,
    eps: null,
    dividendYield: null,
    week52High: null,
    week52Low: null,
    beta: null,
    sharesOutstanding: null,
    currency: "CNY",
    exchange: clean.startsWith("6") ? "SSE" : clean.startsWith("8") || clean.startsWith("4") ? "BSE" : "SZSE",
    marketState: "REGULAR",
    time: Math.floor(Date.now() / 1000),
    source: data._source || "ChinaBridge",
  };
}

/**
 * 获取 A 股 K 线时序
 */
export async function candles(symbol: string, period = "daily"): Promise<Candle[]> {
  const clean = symbol.trim().toUpperCase().split(".")[0];
  const res = await fetch(`${BRIDGE_BASE}/api/candles?symbol=${clean}&period=${period}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`chinaMarket candles error: ${res.statusText}`);
  }
  const data = (await res.json()) as any;
  const list = data.candles || [];

  return list.map((c: any) => {
    // 将 'YYYY-MM-DD' 转换为 Unix 时间戳 (秒)
    const timestamp = Math.floor(new Date(c.time).getTime() / 1000);
    return {
      time: timestamp,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume),
    };
  });
}
