"use client";

import { use, useEffect } from "react";
import { useWorkspacePaths } from "@aicortex/core/paths";
import { useNavigation } from "@aicortex/views/navigation";

export default function ProjectDevRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const p = useWorkspacePaths();
  const { replace } = useNavigation();

  useEffect(() => {
    replace(`${p.dev()}?project=${encodeURIComponent(id)}`);
  }, [id, p, replace]);

  return null;
}
