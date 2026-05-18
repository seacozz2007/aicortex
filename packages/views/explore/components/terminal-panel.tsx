"use client";

import { useEffect, useRef } from "react";
import { useWS } from "@aicortex/core/realtime";

interface TerminalPanelProps {
  sessionId: string;
  onDetach?: () => void;
}

export function TerminalPanel({ sessionId, onDetach }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const { subscribe, send } = useWS();

  // Listen for terminal data from server
  useEffect(() => {
    const unsub = subscribe("terminal:data" as any, (payload: any) => {
      if (payload?.session_id === sessionId && termRef.current) {
        try {
          const bytes = Uint8Array.from(atob(payload.data), (c) => c.charCodeAt(0));
          termRef.current.write(bytes);
        } catch { /* ignore */ }
      }
    });
    return unsub;
  }, [subscribe, sessionId]);

  // Listen for terminal close
  useEffect(() => {
    const unsub = subscribe("terminal:close" as any, (payload: any) => {
      if (payload?.session_id === sessionId) {
        termRef.current?.write("\r\n\x1b[31m[Session closed]\x1b[0m\r\n");
        onDetach?.();
      }
    });
    return unsub;
  }, [subscribe, sessionId, onDetach]);

  // Listen for terminal error
  useEffect(() => {
    const unsub = subscribe("terminal:error" as any, (payload: any) => {
      if (payload?.session_id === sessionId) {
        termRef.current?.write(`\r\n\x1b[31m[Error: ${payload.error}]\x1b[0m\r\n`);
      }
    });
    return unsub;
  }, [subscribe, sessionId]);

  // Init xterm + attach
  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;

    async function init() {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      await import("@xterm/xterm/css/xterm.css");

      if (disposed) return;

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        allowProposedApi: true,
        theme: {
          background: "#1a1b26",
          foreground: "#c0caf5",
          cursor: "#c0caf5",
        },
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerRef.current!);
      fitAddon.fit();
      term.focus();

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      term.onData((data: string) => {
        const bytes = new TextEncoder().encode(data);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        send({ type: "terminal:data", payload: { session_id: sessionId, data: btoa(binary) } });
      });

      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        send({ type: "terminal:resize", payload: { session_id: sessionId, cols, rows } });
      });

      // Attach to get scrollback
      send({ type: "terminal:attach", payload: { session_id: sessionId, cols: term.cols, rows: term.rows } });
    }

    init();

    const el = containerRef.current;
    const resizeObserver = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
    });
    resizeObserver.observe(el);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      send({ type: "terminal:detach", payload: { session_id: sessionId } });
      termRef.current?.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div ref={containerRef} className="flex-1 min-h-0 [&_.xterm]:h-full" />
    </div>
  );
}
