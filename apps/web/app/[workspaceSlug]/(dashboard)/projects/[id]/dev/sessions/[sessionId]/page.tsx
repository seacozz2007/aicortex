"use client";

import { use } from "react";
import { DevStudioSession } from "@aicortex/views/dev-studio";

export default function ProjectDevSessionPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = use(params);
  return <DevStudioSession projectId={id} sessionId={sessionId} />;
}
