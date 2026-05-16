"use client";

import { DashboardLayout } from "@aicortex/views/layout";
import { AICortexIcon } from "@aicortex/ui/components/common/aicortex-icon";
import { SearchCommand, SearchTrigger } from "@aicortex/views/search";
import { ChatFab, ChatWindow } from "@aicortex/views/chat";
import { StarterContentPrompt } from "@aicortex/views/onboarding";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout
      loadingIndicator={<AICortexIcon className="size-6" />}
      searchSlot={<SearchTrigger />}
      extra={
        <>
          <SearchCommand />
          <ChatWindow />
          <ChatFab />
          <StarterContentPrompt />
        </>
      }
    >
      {children}
    </DashboardLayout>
  );
}
