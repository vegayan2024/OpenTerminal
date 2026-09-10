import { Router } from "express";
import { DatabaseSync } from "node:sqlite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const commoditiesRouter = Router();

// 数据路径位于 OpenTerminal/data/commodities.db
const dbPath = path.resolve(__dirname, "../../../data/commodities.db");

let dbInstance: any = null;
function getDb() {
  if (!dbInstance) {
    try {
      dbInstance = new DatabaseSync(dbPath, { readOnly: true });
      dbInstance.exec("PRAGMA journal_mode = WAL;");
    } catch (e) {
      console.warn("[commodities] 暂未加载或正在生成 commodities.db:", e);
      return null;
    }
  }
  return dbInstance;
}

/**
 * GET /api/commodities/tree
 * 返回产业链树状分类与包含的指标/商品
 */
commoditiesRouter.get("/tree", (_req, res) => {
  const db = getDb();
  if (!db) {
    return res.status(503).json({ error: "数据库正在初始化中，请稍后刷新" });
  }
  try {
    const rows = db.prepare(`
      SELECT id, category, series_name, is_spread, unit
      FROM commodity_series
      ORDER BY category ASC, is_spread ASC, id ASC
    `).all();

    // 聚合为分类树
    const categoriesMap: Record<string, any[]> = {};
    for (const r of rows as any[]) {
      if (!categoriesMap[r.category]) {
        categoriesMap[r.category] = [];
      }
      categoriesMap[r.category].push({
        id: r.id,
        name: r.series_name,
        isSpread: Boolean(r.is_spread),
        unit: r.unit || ""
      });
    }

    const result = Object.keys(categoriesMap).map((cat) => ({
      category: cat,
      count: categoriesMap[cat].length,
      items: categoriesMap[cat]
    }));

    res.json({ categories: result });
  } catch (err) {
    res.status(500).json({ error: "获取产业链列表失败", detail: String(err) });
  }
});

/**
 * GET /api/commodities/history/:id
 * 获取指定品种/指标的历史时序 (格式适配 lightweight-charts: { time: 'YYYY-MM-DD', value: number })
 */
commoditiesRouter.get("/history/:id", (req, res) => {
  const db = getDb();
  if (!db) {
    return res.status(503).json({ error: "数据库正在初始化中" });
  }
  const seriesId = parseInt(req.params.id, 10);
  if (isNaN(seriesId)) {
    return res.status(400).json({ error: "无效的 series_id" });
  }

  try {
    const meta = db.prepare(`
      SELECT id, category, series_name, is_spread, unit
      FROM commodity_series
      WHERE id = ?
    `).get(seriesId) as any;

    if (!meta) {
      return res.status(404).json({ error: "未找到该品种或指标" });
    }

    const rows = db.prepare(`
      SELECT date as time, value
      FROM commodity_history
      WHERE series_id = ?
      ORDER BY date ASC
    `).all(seriesId);

    res.json({
      meta: {
        id: meta.id,
        category: meta.category,
        name: meta.series_name,
        isSpread: Boolean(meta.is_spread),
        unit: meta.unit
      },
      data: rows
    });
  } catch (err) {
    res.status(500).json({ error: "获取时序失败", detail: String(err) });
  }
});

/**
 * GET /api/commodities/quantiles
 * 获取全景历史分位与周度涨跌数据
 */
commoditiesRouter.get("/quantiles", (req, res) => {
  const db = getDb();
  if (!db) {
    return res.status(503).json({ error: "数据库正在初始化中" });
  }
  try {
    const category = req.query.category as string | undefined;
    let query = `
      SELECT id, category, product_name, price_percentile, spread_percentile, weekly_change, updated_at
      FROM commodity_quantiles
    `;
    const params: any[] = [];
    if (category) {
      query += " WHERE category = ?";
      params.push(category);
    }
    query += " ORDER BY price_percentile DESC";

    const rows = db.prepare(query).all(...params) as any[];

    const formatted = rows.map((r) => ({
      id: r.id,
      category: r.category,
      product: r.product_name,
      pricePercentile: r.price_percentile !== null ? Math.round(r.price_percentile * 1000) / 10 : null,
      spreadPercentile: r.spread_percentile !== null ? Math.round(r.spread_percentile * 1000) / 10 : null,
      weeklyChange: r.weekly_change !== null ? Math.round(r.weekly_change * 10000) / 100 : null,
      updatedAt: r.updated_at
    }));

    res.json({ list: formatted });
  } catch (err) {
    res.status(500).json({ error: "获取分位数据失败", detail: String(err) });
  }
});

/**
 * GET /api/commodities/rankings
 * 获取涨跌幅排行榜
 */
commoditiesRouter.get("/rankings", (req, res) => {
  const db = getDb();
  if (!db) {
    return res.status(503).json({ error: "数据库正在初始化中" });
  }
  try {
    const period = (req.query.period as string) || "1w";
    const rankingType = (req.query.type as string) || "price";

    const rows = db.prepare(`
      SELECT rank, product_name, change_rate
      FROM commodity_rankings
      WHERE period = ? AND ranking_type = ?
      ORDER BY rank ASC
      LIMIT 20
    `).all(period, rankingType) as any[];

    res.json({
      period,
      type: rankingType,
      rankings: rows.map((r) => ({
        rank: r.rank,
        product: r.product_name,
        changeRate: Math.round(r.change_rate * 10000) / 100
      }))
    });
  } catch (err) {
    res.status(500).json({ error: "获取排行榜失败", detail: String(err) });
  }
});
