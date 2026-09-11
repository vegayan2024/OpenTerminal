"use client";

import { useEffect, useState } from "react";
import TopBar from "./TopBar";
import Sidebar from "./Sidebar";
import Workspace from "./Workspace";
import CommandPalette from "./CommandPalette";
import { useTerminal } from "../store/terminal";

export default function Terminal() {
  const [mounted, setMounted] = useState(false);
  const setCommandOpen = useTerminal((s) => s.setCommandOpen);
  const addWidget = useTerminal((s) => s.addWidget);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (e.altKey) {
        const map: Record<string, () => void> = {
          "1": () => addWidget("chart"),
          "2": () => addWidget("quote"),
          "3": () => addWidget("news"),
          "4": () => addWidget("screener"),
          "5": () => addWidget("heatmap"),
          "6": () => addWidget("crypto"),
          "7": () => addWidget("options"),
          "8": () => addWidget("portfolio"),
          "9": () => addWidget("ai"),
        };
        const fn = map[e.key];
        if (fn) {
          e.preventDefault();
          fn();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCommandOpen, addWidget]);

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg)] text-[var(--text-dim)] font-mono text-sm">
        正在初始化 OpenTerminal 量化终端...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Workspace />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
