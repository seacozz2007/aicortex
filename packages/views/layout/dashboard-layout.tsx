"use client";

import type { ReactNode } from "react";
import { ModalRegistry } from "../modals/registry";
import { DashboardGuard } from "./dashboard-guard";
import { NavigationProgress } from "./navigation-progress";
import { WorkspacePresencePrefetch } from "./workspace-presence-prefetch";
import { TopNav } from "./top-nav";

interface DashboardLayoutProps {
  children: ReactNode;
  /** Rendered as absolute-positioned overlays (e.g. ChatWindow, ChatFab) */
  extra?: ReactNode;
  /** @deprecated No longer used — search is in TopNav */
  searchSlot?: ReactNode;
  /** Loading indicator */
  loadingIndicator?: ReactNode;
}

export function DashboardLayout({
  children,
  extra,
  loadingIndicator,
}: DashboardLayoutProps) {
  return (
    <DashboardGuard
      loadingFallback={
        <div className="flex h-svh items-center justify-center">
          {loadingIndicator}
        </div>
      }
    >
      <div className="flex h-svh flex-col">
        <WorkspacePresencePrefetch />
        <TopNav />
        <NavigationProgress />
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          <div className="animate-page-enter flex min-h-0 flex-1 flex-col">
            {children}
          </div>
          <ModalRegistry />
          {extra}
        </main>
      </div>
    </DashboardGuard>
  );
}
