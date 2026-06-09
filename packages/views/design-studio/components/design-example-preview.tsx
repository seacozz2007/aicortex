"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@aicortex/ui/lib/utils";

/** Scaled iframe thumbnail — mirrors Open Design PluginPromptPreset cards. */
export function DesignExamplePreview({
  src,
  title,
  fallbackClassName,
  fallbackSrc,
}: {
  src: string;
  title: string;
  fallbackClassName?: string;
  fallbackSrc?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [failed, setFailed] = useState(false);
  const [scale, setScale] = useState(0.2);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setInView(true);
      },
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      if (width > 0) setScale(width / 1440);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  if (failed && fallbackSrc) {
    return (
      <div className={cn("h-full w-full", fallbackClassName)}>
        <img src={fallbackSrc} alt="" className="h-full w-full object-cover object-center" />
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden bg-muted/30">
      {inView ? (
        <iframe
          title={title}
          src={src}
          sandbox="allow-scripts"
          loading="lazy"
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{
            width: 1440,
            height: 900,
            transform: `scale(${scale})`,
          }}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 animate-pulse bg-muted/40" aria-hidden />
      )}
    </div>
  );
}
