"use client";

import { use, useEffect } from "react";
import { useWorkspacePaths } from "@aicortex/core/paths";
import { useNavigation } from "@aicortex/views/navigation";

export default function ProjectDevSessionRedirectPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = use(params);
  const p = useWorkspacePaths();
  const { replace } = useNavigation();

  useEffect(() => {
    const qs = new URLSearchParams({
      project: id,
      session: sessionId,
    });
    replace(`${p.dev()}?${qs.toString()}`);
  }, [id, sessionId, p, replace]);

  return null;
}
