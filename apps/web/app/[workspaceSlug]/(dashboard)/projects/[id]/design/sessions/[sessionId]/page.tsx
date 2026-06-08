"use client";

import { use } from "react";
import { DesignStudioSession } from "@aicortex/views/design-studio";

export default function ProjectDesignSessionPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = use(params);
  return <DesignStudioSession projectId={id} sessionId={sessionId} />;
}
