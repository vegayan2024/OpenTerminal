"use client";

import { useTerminal, type WidgetType } from "../store/terminal";

const ITEMS: Array<{ type: WidgetType; label: string; key: string }> = [
  { type: "chart", label: "K线图表", key: "⌥1" },
  { type: "quote", label: "分时行情", key: "⌥2" },
  { type: "commodities", label: "化工品周期", key: "⌥0" },
  { type: "news", label: "财经快讯", key: "⌥3" },
  { type: "screener", label: "A股选股器", key: "⌥4" },
  { type: "heatmap", label: "行业热力图", key: "⌥5" },
  { type: "watchlist", label: "自选股监控", key: "" },
  { type: "macro", label: "宏观与指数", key: "" },
  { type: "options", label: "期权T型报价", key: "⌥7" },
  { type: "portfolio", label: "投资组合", key: "⌥8" },
  { type: "ai", label: "AI 投研助手", key: "⌥9" },
  { type: "calendar", label: "财经日历", key: "" },
  { type: "insider", label: "重要股东增减持", key: "" },
  { type: "recap", label: "每日市场复盘", key: "" },
  { type: "crypto", label: "数字资产", key: "⌥6" },
  { type: "tv", label: "财经直播", key: "" },
];

export default function Sidebar() {
  const addWidget = useTerminal((s) => s.addWidget);
  const resetWorkspace = useTerminal((s) => s.resetWorkspace);

  return (
    <nav className="w-36 bg-[var(--panel)] border-r border-[var(--border)] flex flex-col shrink-0">
      <div className="dim px-2 py-1 text-[10px] uppercase tracking-wider border-b border-[var(--border)]">
        功能组件库
      </div>
      {ITEMS.map((item) => (
        <button
          key={item.type}
          onClick={() => addWidget(item.type)}
          className="text-left px-2 py-1.5 text-[11px] hover:bg-[#1a1a1a] hover:text-[var(--amber)] flex justify-between"
        >
          <span>{item.label}</span>
          <span className="dim text-[9px]">{item.key}</span>
        </button>
      ))}
      <div className="mt-auto border-t border-[var(--border)]">
        <button
          onClick={resetWorkspace}
          className="w-full text-left px-2 py-1.5 text-[11px] dim hover:text-[var(--down)]"
        >
          重置终端布局
        </button>
      </div>
    </nav>
  );
}
