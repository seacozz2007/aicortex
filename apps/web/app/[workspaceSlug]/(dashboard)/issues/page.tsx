"use client";

import { IssuesPage } from "@aicortex/views/issues/components";
import { ErrorBoundary } from "@aicortex/ui/components/common/error-boundary";
import { IssuesUrlSync } from "./issues-url-sync";

export default function Page() {
  return (
    <ErrorBoundary>
      <IssuesUrlSync />
      <IssuesPage />
    </ErrorBoundary>
  );
}
