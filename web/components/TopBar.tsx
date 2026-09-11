"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import { useTerminal } from "../store/terminal";

type Status = {
  ok: boolean;
  providers: Array<{ name: string; ok: number; failed: number; lastLatencyMs: number | null }>;
  ai: boolean;
};

function Clock({ tz, label }: { tz: string; label: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  return (
    <span className="dim">
      {label}{" "}
      <span className="text-[var(--text)]">
        {now.toLocaleTimeString("en-GB", { timeZone: tz, hour12: false })}
      </span>
    </span>
  );
}

function marketStateCN(): { label: string; state: "open" | "auction" | "pause" | "closed" } {
  const bj = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const day = bj.getDay();
  const mins = bj.getHours() * 60 + bj.getMinutes();

  if (day >= 1 && day <= 5) {
    if (mins >= 555 && mins < 565) return { label: "A股集合竞价", state: "auction" };
    if (mins >= 570 && mins <= 690) return { label: "A股连续竞价中", state: "open" };
    if (mins > 690 && mins < 780) return { label: "A股午间休市", state: "pause" };
    if (mins >= 780 && mins <= 900) return { label: "A股连续竞价中", state: "open" };
  }
  return { label: "A股已收盘", state: "closed" };
}

export default function TopBar() {
  const setCommandOpen = useTerminal((s) => s.setCommandOpen);
  const activeSymbol = useTerminal((s) => s.activeSymbol);
  const { data: status } = useQuery({
    queryKey: ["status"],
    queryFn: () => apiGet<Status>("/api/status"),
    refetchInterval: 30_000,
  });

  const market = marketStateCN();
  const statusColor =
    market.state === "open" ? "up" : market.state === "auction" ? "amber" : "dim";

  return (
    <header className="flex items-center gap-4 px-3 h-8 bg-[var(--panel-2)] border-b border-[var(--border)] text-[11px] shrink-0">
      <span className="amber font-bold tracking-widest">OPENTERMINAL 中国</span>
      <span className={statusColor}>● {market.label}</span>
      <Clock tz="Asia/Shanghai" label="北京" />
      <Clock tz="America/New_York" label="纽约" />
      <Clock tz="Europe/London" label="伦敦" />
      <Clock tz="Asia/Tokyo" label="东京" />
      <button
        className="term-btn flex-1 max-w-md text-left dim hover:border-[var(--amber)]"
        onClick={() => setCommandOpen(true)}
      >
        <span className="text-[var(--text)] font-semibold">{activeSymbol}</span>
        <span className="ml-2">输入A股代码/拼音/名称快速查找…</span>
        <span className="float-right text-[var(--amber)]">⌘K / Ctrl+K</span>
      </button>
      <span className="dim ml-auto">
        数据源: 同花顺(THS) · TuShare · AkShare
      </span>
      <span className={status?.ai ? "up" : "dim"}>AI 引擎 {status?.ai ? "●" : "○"}</span>
    </header>
  );
}
