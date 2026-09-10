"use client";

import { useEffect, useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

type CategoryItem = {
  id: number;
  name: string;
  isSpread: boolean;
  unit: string;
};

type CategoryGroup = {
  category: string;
  count: number;
  items: CategoryItem[];
};

type QuantileItem = {
  id: number;
  category: string;
  product: string;
  pricePercentile: number | null;
  spreadPercentile: number | null;
  weeklyChange: number | null;
};

type TimePoint = {
  time: string;
  value: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

export default function CommodityWidget() {
  const [categories, setCategories] = useState<CategoryGroup[]>([]);
  const [selectedCat, setSelectedCat] = useState<string>("聚氨酯");
  const [selectedSeriesId, setSelectedSeriesId] = useState<number | null>(null);
  const [historyData, setHistoryData] = useState<TimePoint[]>([]);
  const [quantiles, setQuantiles] = useState<QuantileItem[]>([]);
  const [timeRange, setTimeRange] = useState<"1Y" | "3Y" | "5Y" | "ALL">("3Y");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"chart" | "quantiles">("chart");

  // 1. 加载产业链分类树与分位榜
  useEffect(() => {
    fetch(`${API_BASE}/api/commodities/tree`)
      .then((r) => r.json())
      .then((data) => {
        if (data.categories && data.categories.length > 0) {
          setCategories(data.categories);
          const defaultGroup =
            data.categories.find((c: CategoryGroup) => c.category === "聚氨酯") ||
            data.categories[0];
          setSelectedCat(defaultGroup.category);
          if (defaultGroup.items.length > 0) {
            setSelectedSeriesId(defaultGroup.items[0].id);
          }
        }
      })
      .catch((e) => console.error("加载产业链树失败", e));

    fetch(`${API_BASE}/api/commodities/quantiles`)
      .then((r) => r.json())
      .then((data) => {
        if (data.list) {
          setQuantiles(data.list);
        }
      })
      .catch((e) => console.error("加载分位数据失败", e));
  }, []);

  // 2. 当切换品种时，拉取历史时序
  useEffect(() => {
    if (!selectedSeriesId) return;
    setLoading(true);
    fetch(`${API_BASE}/api/commodities/history/${selectedSeriesId}`)
      .then((r) => r.json())
      .then((res) => {
        setHistoryData(res.data || []);
      })
      .catch((e) => console.error("获取时序失败", e))
      .finally(() => setLoading(false));
  }, [selectedSeriesId]);

  // 当前分类下的所有指标
  const currentItems = useMemo(() => {
    const group = categories.find((c) => c.category === selectedCat);
    return group ? group.items : [];
  }, [categories, selectedCat]);

  // 当前选中的指标元数据
  const currentMeta = useMemo(() => {
    return currentItems.find((i) => i.id === selectedSeriesId);
  }, [currentItems, selectedSeriesId]);

  // 根据选定周期过滤时序
  const filteredData = useMemo(() => {
    if (!historyData || historyData.length === 0) return [];
    if (timeRange === "ALL") return historyData;

    const yearsMap = { "1Y": 1, "3Y": 3, "5Y": 5 };
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsMap[timeRange]);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);

    return historyData.filter((d) => d.time >= cutoffStr);
  }, [historyData, timeRange]);

  // 分位颜色渲染函数
  const getPercentileColor = (pct: number | null) => {
    if (pct === null) return "text-zinc-500";
    if (pct <= 20) return "text-emerald-400 font-bold"; // 底部安全区
    if (pct <= 40) return "text-cyan-400";
    if (pct <= 60) return "text-amber-300";
    if (pct <= 80) return "text-orange-400";
    return "text-red-500 font-bold"; // 顶部高风险区
  };

  return (
    <div className="flex flex-col h-full w-full bg-[var(--panel)] text-[var(--foreground)] text-xs select-none">
      {/* 顶部控制栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] bg-[#111] gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[var(--amber)] tracking-wide">
            【化工周期】
          </span>
          {/* 分类下拉 */}
          <select
            value={selectedCat}
            onChange={(e) => {
              const cat = e.target.value;
              setSelectedCat(cat);
              const g = categories.find((c) => c.category === cat);
              if (g && g.items.length > 0) {
                setSelectedSeriesId(g.items[0].id);
              }
            }}
            className="bg-[#222] border border-[var(--border)] px-2 py-1 rounded text-xs text-zinc-200 outline-none hover:border-[var(--amber)]"
          >
            {categories.map((c) => (
              <option key={c.category} value={c.category}>
                {c.category} ({c.count})
              </option>
            ))}
          </select>

          {/* 品种/指标下拉 */}
          <select
            value={selectedSeriesId ?? ""}
            onChange={(e) => setSelectedSeriesId(Number(e.target.value))}
            className="bg-[#222] border border-[var(--border)] px-2 py-1 rounded text-xs text-zinc-200 outline-none max-w-[200px] truncate hover:border-[var(--amber)]"
          >
            {currentItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.isSpread ? "[价差] " : "[价格] "} {item.name}
              </option>
            ))}
          </select>
        </div>

        {/* 视图切换与周期按钮 */}
        <div className="flex items-center gap-2">
          <div className="flex rounded border border-[var(--border)] bg-black/40 overflow-hidden">
            <button
              onClick={() => setActiveTab("chart")}
              className={`px-2 py-0.5 text-[11px] ${
                activeTab === "chart" ? "bg-[var(--amber)] text-black font-semibold" : "text-zinc-400 hover:text-white"
              }`}
            >
              走势图
            </button>
            <button
              onClick={() => setActiveTab("quantiles")}
              className={`px-2 py-0.5 text-[11px] ${
                activeTab === "quantiles" ? "bg-[var(--amber)] text-black font-semibold" : "text-zinc-400 hover:text-white"
              }`}
            >
              历史分位表
            </button>
          </div>

          {activeTab === "chart" && (
            <div className="flex rounded border border-[var(--border)] bg-black/40 overflow-hidden">
              {(["1Y", "3Y", "5Y", "ALL"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-1.5 py-0.5 text-[10px] ${
                    timeRange === r ? "bg-[#333] text-white font-bold" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 主体区域 */}
      <div className="flex-1 min-h-0 overflow-hidden p-2">
        {activeTab === "chart" ? (
          <div className="flex flex-col h-full">
            {/* 品种当前信息横幅 */}
            <div className="flex items-center justify-between px-2 py-1 bg-black/30 rounded mb-2 border border-[var(--border)]">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-white">
                  {currentMeta?.name || "加载中..."}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    currentMeta?.isSpread ? "bg-purple-950 text-purple-300 border border-purple-800" : "bg-blue-950 text-blue-300 border border-blue-800"
                  }`}
                >
                  {currentMeta?.isSpread ? "产业链核心加工价差" : "大宗现货价格"}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                {filteredData.length > 0 && (
                  <>
                    <span className="text-zinc-400">最新收盘:</span>
                    <span className="font-mono text-base font-bold text-[var(--amber)]">
                      {filteredData[filteredData.length - 1].value.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      ({filteredData[filteredData.length - 1].time})
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* 图表绘制 */}
            <div className="flex-1 min-h-0 w-full">
              {loading ? (
                <div className="flex h-full items-center justify-center text-zinc-500">
                  时序数据加载中...
                </div>
              ) : filteredData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-zinc-500">
                  暂无历史数据
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={filteredData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                    <XAxis
                      dataKey="time"
                      stroke="#666"
                      tick={{ fill: "#888", fontSize: 10 }}
                      minTickGap={40}
                    />
                    <YAxis
                      domain={["auto", "auto"]}
                      stroke="#666"
                      tick={{ fill: "#888", fontSize: 10 }}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#18181b",
                        borderColor: "#3f3f46",
                        borderRadius: 4,
                        fontSize: 11,
                      }}
                      labelStyle={{ color: "#a1a1aa" }}
                      itemStyle={{ color: "#f59e0b" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      name={currentMeta?.name ?? "数值"}
                      stroke={currentMeta?.isSpread ? "#c084fc" : "#f59e0b"}
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        ) : (
          /* 全景历史分位列表视图 */
          <div className="h-full overflow-y-auto pr-1">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead className="sticky top-0 bg-[#161616] text-zinc-400 border-b border-[var(--border)]">
                <tr>
                  <th className="py-1.5 px-2">产业链板块</th>
                  <th className="py-1.5 px-2">化工品种</th>
                  <th className="py-1.5 px-2 text-right">价格历史分位</th>
                  <th className="py-1.5 px-2 text-right">价差历史分位</th>
                  <th className="py-1.5 px-2 text-right">最新周涨幅</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {quantiles.map((q, idx) => (
                  <tr key={idx} className="hover:bg-white/5 transition-colors">
                    <td className="py-1.5 px-2 text-zinc-400">{q.category}</td>
                    <td className="py-1.5 px-2 font-medium text-white">{q.product}</td>
                    <td className={`py-1.5 px-2 text-right font-mono ${getPercentileColor(q.pricePercentile)}`}>
                      {q.pricePercentile !== null ? `${q.pricePercentile}%` : "-"}
                    </td>
                    <td className={`py-1.5 px-2 text-right font-mono ${getPercentileColor(q.spreadPercentile)}`}>
                      {q.spreadPercentile !== null ? `${q.spreadPercentile}%` : "-"}
                    </td>
                    <td
                      className={`py-1.5 px-2 text-right font-mono ${
                        q.weeklyChange && q.weeklyChange > 0
                          ? "text-red-400 font-semibold"
                          : q.weeklyChange && q.weeklyChange < 0
                          ? "text-emerald-400 font-semibold"
                          : "text-zinc-500"
                      }`}
                    >
                      {q.weeklyChange !== null
                        ? `${q.weeklyChange > 0 ? "+" : ""}${q.weeklyChange}%`
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
