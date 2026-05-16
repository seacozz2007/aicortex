"use client";

import Link from "next/link";
import { AICortexIcon } from "@aicortex/ui/components/common/aicortex-icon";
import { useAuthStore } from "@aicortex/core/auth";

export function AICortexLanding() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="flex min-h-screen flex-col bg-[#05070b] text-white">
      {/* Header */}
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <AICortexIcon className="size-5 text-white" noSpin />
          <span className="text-lg font-semibold tracking-wide lowercase">
            aicortex
          </span>
        </div>
        <Link
          href={user ? "/" : "/login"}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
        >
          {user ? "Dashboard" : "Log in"}
        </Link>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
          One brain. Many hands.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-white/70">
          The orchestration layer for AI engineering teams. Connect any coding
          agent, route work intelligently, and scale without scaling headcount.
        </p>
        <div className="mt-10 flex gap-4">
          <Link
            href={user ? "/" : "/login"}
            className="rounded-md bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-white/90"
          >
            Get Started
          </Link>
          <a
            href="https://github.com/aicortex/aicortex"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-white/20 px-6 py-3 text-sm font-medium text-white transition hover:border-white/40"
          >
            GitHub
          </a>
        </div>
      </main>
    </div>
  );
}
