"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { apiGet, apiPost, type Quote } from "../../lib/api";
import { useTerminal } from "../../store/terminal";

type Msg = { role: "user" | "assistant"; content: string };

export default function AiWidget() {
  const activeSymbol = useTerminal((s) => s.activeSymbol);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const chat = useMutation({
    mutationFn: async (userText: string) => {
      let context: unknown = null;
      try {
        context = { activeSymbol, quote: (await apiGet<Quote[]>(`/api/quotes?symbols=${activeSymbol}`))[0] };
      } catch {
        // context is best-effort
      }
      const next = [...messages, { role: "user" as const, content: userText }];
      const res = await apiPost<{ text: string }>("/api/ai/chat", { messages: next, context });
      return { next, reply: res.text };
    },
    onSuccess: ({ next, reply }) => {
      setMessages([...next, { role: "assistant", content: reply }]);
      setTimeout(() => scrollRef.current?.scrollTo({ top: 1e9 }), 50);
    },
  });

  const send = () => {
    const text = input.trim();
    if (!text || chat.isPending) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    chat.mutate(text);
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-auto p-2 space-y-2 min-h-0">
        {messages.length === 0 && (
          <div className="dim text-[12px] leading-relaxed">
            欢迎使用 AI 投研助手。你可以向我询问关于当前标的 ({activeSymbol}) 的基本面、化工品价差周期、行业趋势或技术形态，当前标的行情将自动作为上下文同步分析。
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i}>
            <span className={m.role === "user" ? "amber font-semibold" : "up font-semibold"}>{m.role === "user" ? "用户" : "AI 投研"} ›</span>{" "}
            <span className="whitespace-pre-wrap">{m.content}</span>
          </div>
        ))}
        {chat.isPending && <div className="dim">AI 正在深入分析中…</div>}
        {chat.error && <div className="down">分析请求异常: {(chat.error as Error).message}</div>}
      </div>
      <div className="flex gap-1 p-1 border-t border-[var(--border)] shrink-0">
        <input
          className="flex-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={`询问关于 ${activeSymbol}、化工品产业链或大盘宏观…`}
        />
        <button className="term-btn" onClick={send}>发送</button>
      </div>
    </div>
  );
}
