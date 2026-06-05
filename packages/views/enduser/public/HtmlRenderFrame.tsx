"use client";

import { useRef, useEffect } from "react";

interface HtmlRenderFrameProps {
  html: string;
}

export function HtmlRenderFrame({ html }: HtmlRenderFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html) return;
    iframe.srcdoc = html;
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts"
      className="w-full h-full border-0 bg-background"
      title="Agent HTML render output"
    />
  );
}
