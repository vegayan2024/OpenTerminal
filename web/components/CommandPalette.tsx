"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { apiGet } from "../lib/api";
import { useTerminal } from "../store/terminal";

type SearchResult = { symbol: string; name: string; exchange: string; type: string };

export default function CommandPalette() {
  const open = useTerminal((s) => s.commandOpen);
  const setOpen = useTerminal((s) => s.setCommandOpen);
  const setActiveSymbol = useTerminal((s) => s.setActiveSymbol);
  const addToWatchlist = useTerminal((s) => s.addToWatchlist);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: results = [] } = useQuery({
    queryKey: ["search", query],
    queryFn: () => apiGet<SearchResult[]>(`/api/search?q=${encodeURIComponent(query)}`),
    enabled: open,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => setSelected(0), [results.length]);

  if (!open) return null;

  const pick = (r: SearchResult, watch = false) => {
    setActiveSymbol(r.symbol);
    if (watch) addToWatchlist(r.symbol);
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center pt-24"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-[600px] bg-[var(--panel)] border border-[var(--amber-dim)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "ArrowDown") setSelected((s) => Math.min(s + 1, results.length - 1));
            if (e.key === "ArrowUp") setSelected((s) => Math.max(s - 1, 0));
            if (e.key === "Enter" && results[selected]) pick(results[selected], e.shiftKey);
          }}
          placeholder="输入A股代码、拼音简写(如 gzmt/byd)或中文 (回车=载入 · Shift+回车=载入并加自选)"
          className="w-full !border-0 !border-b !border-[var(--border)] px-3 py-2.5 text-[13px] bg-[#111] text-[var(--text)]"
        />
        {!query && (
          <div className="px-3 py-1.5 bg-[#141414] text-[10px] dim border-b border-[var(--border)]">
            ★ 热门核心A股与大盘指数推荐 (可直接键盘上下键选择或鼠标点击)：
          </div>
        )}
        <div className="max-h-88 overflow-auto">
          {results.map((r, i) => (
            <div
              key={r.symbol + i}
              onClick={() => pick(r)}
              className={`px-3 py-2 flex items-center gap-3 cursor-pointer ${
                i === selected ? "bg-[#1f1a10] text-[var(--amber)]" : "hover:bg-[#161616]"
              }`}
            >
              <span className="w-20 font-bold font-mono text-[13px]">{r.symbol}</span>
              <span className="flex-1 truncate font-medium">{r.name}</span>
              <span className="dim text-[11px] px-1.5 py-0.5 bg-[#222] rounded">{r.exchange}</span>
              <span className="dim w-24 text-right text-[11px] truncate">{r.type}</span>
            </div>
          ))}
          {query && results.length === 0 && (
            <div className="px-4 py-4 dim text-center">未检索到与 “{query}” 相关的A股标的</div>
          )}
        </div>
      </div>
    </div>
  );
}
