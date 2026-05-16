"use client";

import { IssuesPage } from "@aicortex/views/issues/components";
import { ErrorBoundary } from "@aicortex/ui/components/common/error-boundary";

export default function Page() {
  return (
    <ErrorBoundary>
      <IssuesPage />
    </ErrorBoundary>
  );
}
