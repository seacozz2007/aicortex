"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ChatSharePublicView } from "@aicortex/views/chat-share/public";
import type { ChatSharePublicInfo } from "@aicortex/core/types";

// Use the backend API directly — the /e/:path* rewrite was removed so the
// Next.js page route takes precedence for page rendering. Data calls go
// straight to the backend.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function ChatSharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token as string;

  const [info, setInfo] = useState<ChatSharePublicInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/e/${token}`)
      .then((r) => r.json())
      .then((data) => setInfo(data as ChatSharePublicInfo))
      .catch(() => setError("Failed to load"));
  }, [token]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground">
        {error}
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  return <ChatSharePublicView token={token} info={info} apiBase={API_BASE} />;
}
