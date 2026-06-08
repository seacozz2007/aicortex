"use client";

import { use } from "react";
import { DesignStudioHub } from "@aicortex/views/design-studio";

export default function ProjectDesignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <DesignStudioHub projectId={id} />;
}
