"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { skillListOptions, workspaceKeys } from "@aicortex/core/workspace/queries";
import {
  type ImportPayload,
  type ImportResult,
  runImportPipeline,
} from "../utils/import-pipeline";

export interface UseAgentImportReturn {
  isImporting: boolean;
  progress: string;
  result: ImportResult | null;
  startImport: (payload: ImportPayload, runtimeId: string) => Promise<ImportResult>;
  reset: () => void;
}

export function useAgentImport(): UseAgentImportReturn {
  const wsId = useWorkspaceId();
  const qc = useQueryClient();
  const { data: existingSkills = [] } = useQuery(skillListOptions(wsId));

  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const startImport = useCallback(
    async (payload: ImportPayload, runtimeId: string): Promise<ImportResult> => {
      setIsImporting(true);
      setProgress("Starting import...");
      setResult(null);

      const existingSkillNames = new Set(existingSkills.map((s) => s.name));

      try {
        const res = await runImportPipeline(payload, runtimeId, existingSkillNames, (step) => {
          setProgress(step);
        });
        setResult(res);
        // Invalidate caches so the lists pick up new items
        if (wsId) {
          qc.invalidateQueries({ queryKey: workspaceKeys.agents(wsId) });
          qc.invalidateQueries({ queryKey: workspaceKeys.skills(wsId) });
          qc.invalidateQueries({ queryKey: workspaceKeys.squads(wsId) });
        }
        return res;
      } finally {
        setIsImporting(false);
      }
    },
    [existingSkills, qc, wsId],
  );

  const reset = useCallback(() => {
    setProgress("");
    setResult(null);
  }, []);

  return { isImporting, progress, result, startImport, reset };
}
