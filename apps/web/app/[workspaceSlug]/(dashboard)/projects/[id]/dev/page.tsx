"use client";

import { use } from "react";
import { DevStudioHub } from "@aicortex/views/dev-studio";

export default function ProjectDevPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <DevStudioHub projectId={id} />;
}
