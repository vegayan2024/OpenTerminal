import type { Quote, Candle } from "./yahoo.js";

const BRIDGE_BASE = process.env.CHINA_BRIDGE_URL || "http://127.0.0.1:4001";

export type ChinaSymbolItem = {
  symbol: string;
  name: string;
  pinyin: string;
  exchange: string;
  type: string;
};

// 预设高频 A 股核心资产、行业龙头及主要指数字典
export const CHINA_SYMBOLS: ChinaSymbolItem[] = [
  { symbol: "000001", name: "上证指数", pinyin: "SZZS", exchange: "SSE", type: "Index" },
  { symbol: "399001", name: "深证成指", pinyin: "SZCZ", exchange: "SZSE", type: "Index" },
  { symbol: "399006", name: "创业板指", pinyin: "CYBZ", exchange: "SZSE", type: "Index" },
  { symbol: "000300", name: "沪深300", pinyin: "HS300", exchange: "SSE", type: "Index" },
  { symbol: "000905", name: "中证500", pinyin: "ZZ500", exchange: "SSE", type: "Index" },
  { symbol: "000852", name: "中证1000", pinyin: "ZZ1000", exchange: "SSE", type: "Index" },
  { symbol: "588000", name: "科创50ETF", pinyin: "KC50", exchange: "SSE", type: "ETF" },
  { symbol: "510300", name: "沪深300ETF", pinyin: "HS300ETF", exchange: "SSE", type: "ETF" },
  { symbol: "510500", name: "中证500ETF", pinyin: "ZZ500ETF", exchange: "SSE", type: "ETF" },
  { symbol: "600519", name: "贵州茅台", pinyin: "GZMT", exchange: "SSE", type: "白酒" },
  { symbol: "000858", name: "五粮液", pinyin: "WLY", exchange: "SZSE", type: "白酒" },
  { symbol: "300750", name: "宁德时代", pinyin: "NDSD", exchange: "SZSE", type: "电池/储能" },
  { symbol: "002594", name: "比亚迪", pinyin: "BYD", exchange: "SZSE", type: "汽车/新能源" },
  { symbol: "601318", name: "中国平安", pinyin: "ZGPA", exchange: "SSE", type: "保险/金融" },
  { symbol: "600036", name: "招商银行", pinyin: "ZSYH", exchange: "SSE", type: "银行" },
  { symbol: "601899", name: "紫金矿业", pinyin: "ZJKY", exchange: "SSE", type: "有色金属" },
  { symbol: "600900", name: "长江电力", pinyin: "CJDL", exchange: "SSE", type: "公用电力" },
  { symbol: "000333", name: "美的集团", pinyin: "MDJT", exchange: "SZSE", type: "家电" },
  { symbol: "600030", name: "中信证券", pinyin: "ZXZQ", exchange: "SSE", type: "证券" },
  { symbol: "601012", name: "隆基绿能", pinyin: "LJLN", exchange: "SSE", type: "光伏" },
  { symbol: "688981", name: "中芯国际", pinyin: "ZXGJ", exchange: "SSE", type: "半导体" },
  { symbol: "002415", name: "海康威视", pinyin: "HKWS", exchange: "SZSE", type: "AI/安防" },
  { symbol: "600309", name: "万华化学", pinyin: "WHHX", exchange: "SSE", type: "基础化工" },
  { symbol: "002493", name: "荣盛石化", pinyin: "RSSH", exchange: "SZSE", type: "石油石化" },
  { symbol: "600028", name: "中国石化", pinyin: "ZGSH", exchange: "SSE", type: "石油石化" },
  { symbol: "601857", name: "中国石油", pinyin: "ZGSY", exchange: "SSE", type: "石油石化" },
  { symbol: "601088", name: "中国神华", pinyin: "ZGSH", exchange: "SSE", type: "煤炭" },
  { symbol: "000002", name: "万科A", pinyin: "WKA", exchange: "SZSE", type: "地产" },
  { symbol: "600276", name: "恒瑞医药", pinyin: "HRYY", exchange: "SSE", type: "医药生物" },
  { symbol: "300059", name: "东方财富", pinyin: "DFCF", exchange: "SZSE", type: "互联网金融" },
  { symbol: "601138", name: "工业富联", pinyin: "GYFL", exchange: "SSE", type: "算力/硬件" },
  { symbol: "002475", name: "立讯精密", pinyin: "LXJM", exchange: "SZSE", type: "消费电子" },
  { symbol: "600111", name: "北方稀土", pinyin: "BFXT", exchange: "SSE", type: "稀土/材料" },
  { symbol: "600438", name: "通威股份", pinyin: "TWGF", exchange: "SSE", type: "光伏/农业" },
  { symbol: "601668", name: "中国建筑", pinyin: "ZGJZ", exchange: "SSE", type: "基建工程" },
];

/**
 * 搜索 A 股标的：支持股票代码、中文名称、拼音简写模糊搜索
 */
export function searchChinaSymbols(q: string): ChinaSymbolItem[] {
  const query = q.trim().toUpperCase();
  if (!query) {
    // 默认展示核心前 10 大标的
    return CHINA_SYMBOLS.slice(0, 10);
  }

  const matches = CHINA_SYMBOLS.filter((item) => {
    return (
      item.symbol.includes(query) ||
      item.name.toUpperCase().includes(query) ||
      item.pinyin.includes(query) ||
      item.type.toUpperCase().includes(query)
    );
  });

  // 如果用户输入的是未在静态字典中的 6 位纯数字，动态构造该 A 股标的
  if (/^\d{6}$/.test(query) && !matches.some((m) => m.symbol === query)) {
    const exchange = query.startsWith("6") || query.startsWith("688") ? "SSE" : query.startsWith("8") || query.startsWith("4") ? "BSE" : "SZSE";
    matches.unshift({
      symbol: query,
      name: `A股证券 (${query})`,
      pinyin: query,
      exchange,
      type: "A股股票",
    });
  }

  return matches;
}

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
