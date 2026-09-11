"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet, fmt, fmtBig } from "../../lib/api";
import { useWidgetSymbol, type WidgetInstance } from "../../store/terminal";

type InsiderTransaction = {
  filingDate: string;
  transactionDate: string;
  ownerName: string;
  ownerTitle: string | null;
  isDirector: boolean;
  isOfficer: boolean;
  isTenPercentOwner: boolean;
  transactionCode: string;
  acquiredDisposed: "A" | "D" | null;
  shares: number | null;
  pricePerShare: number | null;
  value: number | null;
  sharesOwnedAfter: number | null;
};

const CODE_LABEL: Record<string, string> = {
  P: "二级市场增持",
  S: "二级市场减持",
  A: "股权激励授予",
  M: "期权行权",
  G: "无偿赠与",
  F: "税费代扣",
  C: "可转债转股",
  D: "向发行人转让",
};

export default function InsiderWidget({ widget }: { widget: WidgetInstance }) {
  const symbol = useWidgetSymbol(widget);
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["insider", symbol],
    queryFn: () => apiGet<InsiderTransaction[]>(`/api/insider/${symbol}`),
    staleTime: 3_600_000,
  });

  if (error) return <div className="p-2 down">股东增减持数据异常: {(error as Error).message}</div>;
  if (isLoading) return <div className="p-2 dim">正在获取 {symbol} 重要股东增减持记录…</div>;

  return (
    <div>
      <table className="data-table">
        <thead>
          <tr>
            <th>变动日期</th>
            <th>变动人</th>
            <th>职务/身份</th>
            <th>变动类型</th>
            <th>变动股数</th>
            <th>成交均价</th>
            <th>变动金额</th>
            <th>变动后持股</th>
          </tr>
        </thead>
        <tbody>
          {data.map((t, i) => (
            <tr key={`${t.ownerName}-${t.transactionDate}-${i}`}>
              <td className="!text-left dim whitespace-nowrap">{t.transactionDate}</td>
              <td className="!text-left">{t.ownerName}</td>
              <td className="!text-left dim truncate max-w-[140px]" title={t.ownerTitle ?? ""}>
                {t.ownerTitle ?? (t.isDirector ? "Director" : t.isTenPercentOwner ? "10%+ Owner" : "—")}
              </td>
              <td className={t.acquiredDisposed === "A" ? "up" : t.acquiredDisposed === "D" ? "down" : "dim"}>
                {CODE_LABEL[t.transactionCode] ?? t.transactionCode}
              </td>
              <td>{fmtBig(t.shares)}</td>
              <td>{fmt(t.pricePerShare)}</td>
              <td>{fmtBig(t.value)}</td>
              <td className="dim">{fmtBig(t.sharesOwnedAfter)}</td>
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={8} className="dim p-3">
                No recent open-market insider transactions for {symbol}.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
