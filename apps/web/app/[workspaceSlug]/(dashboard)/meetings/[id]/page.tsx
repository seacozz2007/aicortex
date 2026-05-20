"use client";

import { use } from "react";
import { MeetingDetailPage } from "@aicortex/views/meeting";

export default function MeetingDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <MeetingDetailPage id={id} />;
}
