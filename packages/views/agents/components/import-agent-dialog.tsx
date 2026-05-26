"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileUp, Upload, CheckCircle2, XCircle, AlertCircle, FileText } from "lucide-react";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { runtimeListOptions } from "@aicortex/core/runtimes";
import type { AgentRuntime } from "@aicortex/core/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@aicortex/ui/components/ui/dialog";
import { Button } from "@aicortex/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@aicortex/ui/components/ui/select";
import { useT } from "../../i18n";
import { useAgentImport } from "../hooks/use-agent-import";
import {
  type ImportPayload,
  type ImportResult,
  validateImportPayload,
} from "../utils/import-pipeline";

type Step = "select" | "confirm" | "importing" | "result";
type AgentsT = ReturnType<typeof useT<"agents">>["t"];

export function ImportAgentDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT("agents");
  const wsId = useWorkspaceId();
  const { data: runtimes = [], isLoading: runtimesLoading } = useQuery(
    runtimeListOptions(wsId),
  );
  const { isImporting, progress, result, startImport, reset } = useAgentImport();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedPayload, setParsedPayload] = useState<ImportPayload | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ message: string }[]>([]);
  const [selectedRuntimeId, setSelectedRuntimeId] = useState("");
  const [step, setStep] = useState<Step>("select");
  const [fileName, setFileName] = useState("");

  const needsRuntimePick = runtimes.length > 1;

  // Auto-select runtime when there's exactly one and runtimes have loaded.
  useEffect(() => {
    if (runtimes.length === 1 && runtimes[0] && !runtimesLoading) {
      setSelectedRuntimeId(runtimes[0].id);
    }
  }, [runtimes, runtimesLoading]);

  // Transition to confirm step when a payload is parsed and runtimes are ready.
  // We wait for runtimes to load so the summary can show the runtime info.
  useEffect(() => {
    if (step === "select" && parsedPayload && !runtimesLoading) {
      setStep("confirm");
    }
  }, [step, parsedPayload, runtimesLoading]);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    if (!file.name.endsWith(".json")) {
      setValidationErrors([{ message: t(($) => $.import_dialog.error_not_json) }]);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result as string);
        const validation = validateImportPayload(raw);
        if (!validation.ok) {
          setValidationErrors(validation.errors);
          return;
        }
        setValidationErrors([]);
        setParsedPayload(validation.payload);
      } catch {
        setValidationErrors([{ message: t(($) => $.import_dialog.error_parse_failed) }]);
      }
    };
    reader.onerror = () => {
      setValidationErrors([{ message: t(($) => $.import_dialog.error_read_failed) }]);
    };
    reader.readAsText(file);
  }, [t]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleStartImport = async () => {
    if (!parsedPayload || !selectedRuntimeId) return;
    setStep("importing");
    await startImport(parsedPayload, selectedRuntimeId);
    setStep("result");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const goBackToSelect = () => {
    setParsedPayload(null);
    setValidationErrors([]);
    setFileName("");
    setStep("select");
  };

  const counts = parsedPayload
    ? {
        skills: parsedPayload.skills?.length ?? 0,
        agents: parsedPayload.agents?.length ?? 0,
        squads: parsedPayload.squads?.length ?? 0,
      }
    : null;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden !top-1/2 !left-1/2 !-translate-x-1/2 !-translate-y-1/2 !w-full !max-w-lg !h-auto max-h-[85vh]">
        <DialogHeader className="border-b px-5 py-3 space-y-0 shrink-0">
          <DialogTitle className="text-base font-semibold">
            {t(($) => $.import_dialog.title)}
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs">
            {t(($) => $.import_dialog.description)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5">
          {step === "select" && (
            <FileUploadStep
              fileName={fileName}
              validationErrors={validationErrors}
              onDrop={handleDrop}
              onFileSelect={handleFile}
              fileInputRef={fileInputRef}
              onBackToFile={() => {
                setValidationErrors([]);
                setFileName("");
              }}
              t={t}
            />
          )}

          {step === "confirm" && counts && (
            <SummaryStep
              counts={counts}
              runtimes={runtimes}
              runtimesLoading={runtimesLoading}
              needsRuntimePick={needsRuntimePick}
              selectedRuntimeId={selectedRuntimeId}
              onRuntimeChange={setSelectedRuntimeId}
              fileName={fileName}
              onBackToFile={goBackToSelect}
              isImporting={isImporting}
              onStartImport={handleStartImport}
              t={t}
            />
          )}

          {step === "importing" && (
            <ImportingStep progress={progress} t={t} />
          )}

          {step === "result" && result && (
            <ResultStep result={result} onClose={handleClose} t={t} />
          )}
        </div>

        {step === "select" && (
          <div className="flex items-center justify-end gap-2 border-t bg-background px-5 py-3 shrink-0">
            <Button variant="ghost" onClick={handleClose}>
              {t(($) => $.import_dialog.cancel)}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---- File upload step ----

function FileUploadStep({
  fileName,
  validationErrors,
  onDrop,
  onFileSelect,
  fileInputRef,
  onBackToFile,
  t,
}: {
  fileName: string;
  validationErrors: { message: string }[];
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (f: File) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onBackToFile: () => void;
  t: AgentsT;
}) {
  const hasError = validationErrors.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {hasError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-destructive">
              {t(($) => $.import_dialog.validation_error_title)}
            </p>
            <ul className="mt-1 text-xs text-destructive/80 list-disc list-inside space-y-0.5">
              {validationErrors.map((e, i) => (
                <li key={i}>{e.message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center cursor-pointer transition-colors hover:border-muted-foreground/50 hover:bg-muted/30"
      >
        {fileName ? (
          <>
            <FileText className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm">{fileName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t(($) => $.import_dialog.click_to_change)}
              </p>
            </div>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm">{t(($) => $.import_dialog.drop_hint)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t(($) => $.import_dialog.file_format_hint)}
              </p>
            </div>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelect(file);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
      </div>

      {hasError && (
        <Button variant="outline" size="sm" onClick={onBackToFile} className="self-center">
          {t(($) => $.import_dialog.try_another_file)}
        </Button>
      )}
    </div>
  );
}

// ---- Summary + Runtime selection step ----

function SummaryStep({
  counts,
  runtimes,
  runtimesLoading,
  needsRuntimePick,
  selectedRuntimeId,
  onRuntimeChange,
  fileName,
  onBackToFile,
  isImporting,
  onStartImport,
  t,
}: {
  counts: { skills: number; agents: number; squads: number };
  runtimes: AgentRuntime[];
  runtimesLoading: boolean;
  needsRuntimePick: boolean;
  selectedRuntimeId: string;
  onRuntimeChange: (id: string) => void;
  fileName: string;
  onBackToFile: () => void;
  isImporting: boolean;
  onStartImport: () => void;
  t: AgentsT;
}) {
  const canImport = !!selectedRuntimeId && !isImporting && !runtimesLoading;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm truncate">{fileName}</span>
        <button
          type="button"
          onClick={onBackToFile}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          {t(($) => $.import_dialog.change_file)}
        </button>
      </div>

      <div className="rounded-lg border p-4 space-y-2">
        <p className="text-sm font-medium">{t(($) => $.import_dialog.import_summary)}</p>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>{t(($) => $.import_dialog.skills_count, { count: counts.skills })}</p>
          <p>{t(($) => $.import_dialog.agents_count, { count: counts.agents })}</p>
          <p>{t(($) => $.import_dialog.squads_count, { count: counts.squads })}</p>
        </div>
      </div>

      {needsRuntimePick ? (
        <div>
          <p className="text-sm font-medium mb-1.5">{t(($) => $.import_dialog.runtime_label)}</p>
          <Select value={selectedRuntimeId} onValueChange={(v) => v && onRuntimeChange(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t(($) => $.import_dialog.runtime_placeholder)} />
            </SelectTrigger>
            <SelectContent>
              {runtimes.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t(($) => $.import_dialog.runtime_auto, {
            name: runtimes[0]?.name ?? "",
          })}
        </p>
      )}

      <Button onClick={onStartImport} disabled={!canImport} className="w-full">
        <FileUp className="h-4 w-4" />
        {t(($) => $.import_dialog.start_import)}
      </Button>
    </div>
  );
}

// ---- Importing (progress) step ----

function ImportingStep({
  progress,
  t,
}: {
  progress: string;
  t: AgentsT;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <div className="text-center">
        <p className="text-sm font-medium">{t(($) => $.import_dialog.importing)}</p>
        <p className="text-xs text-muted-foreground mt-1">{progress}</p>
      </div>
    </div>
  );
}

// ---- Result step ----

function ResultStep({
  result,
  onClose,
  t,
}: {
  result: ImportResult;
  onClose: () => void;
  t: AgentsT;
}) {
  const totalSuccess =
    result.skills.created +
    result.agents.created +
    result.squads.created;
  const totalSkipped = result.skills.skipped;
  const totalFailures =
    result.skills.failures.length +
    result.agents.failures.length +
    result.squads.failures.length;

  const hasFailures = totalFailures > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {hasFailures ? (
          <AlertCircle className="h-6 w-6 text-amber-500 shrink-0" />
        ) : (
          <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
        )}
        <div>
          <p className="text-sm font-medium">
            {hasFailures
              ? t(($) => $.import_dialog.result_partial_title)
              : t(($) => $.import_dialog.result_success_title)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t(($) => $.import_dialog.result_summary, {
              created: totalSuccess,
              skipped: totalSkipped,
              failed: totalFailures,
            })}
          </p>
        </div>
      </div>

      <div className="rounded-lg border divide-y">
        <ResultCategory
          label={t(($) => $.import_dialog.category_skills)}
          created={result.skills.created}
          skipped={result.skills.skipped}
          total={result.skills.total}
          failures={result.skills.failures}
        />
        <ResultCategory
          label={t(($) => $.import_dialog.category_agents)}
          created={result.agents.created}
          total={result.agents.total}
          failures={result.agents.failures}
        />
        <ResultCategory
          label={t(($) => $.import_dialog.category_squads)}
          created={result.squads.created}
          total={result.squads.total}
          failures={result.squads.failures}
        />
      </div>

      {hasFailures && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-xs font-medium text-destructive mb-2">
            {t(($) => $.import_dialog.failure_details)}
          </p>
          <ul className="space-y-1">
            {result.skills.failures.map((f, i) => (
              <li key={`skill-${i}`} className="text-xs text-destructive/80 flex items-start gap-1.5">
                <XCircle className="h-3 w-3 shrink-0 mt-0.5" />
                <span><span className="font-medium">{f.name}</span>: {f.error}</span>
              </li>
            ))}
            {result.agents.failures.map((f, i) => (
              <li key={`agent-${i}`} className="text-xs text-destructive/80 flex items-start gap-1.5">
                <XCircle className="h-3 w-3 shrink-0 mt-0.5" />
                <span><span className="font-medium">{f.name}</span>: {f.error}</span>
              </li>
            ))}
            {result.squads.failures.map((f, i) => (
              <li key={`squad-${i}`} className="text-xs text-destructive/80 flex items-start gap-1.5">
                <XCircle className="h-3 w-3 shrink-0 mt-0.5" />
                <span><span className="font-medium">{f.name}</span>: {f.error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button onClick={onClose} className="w-full">
        {t(($) => $.import_dialog.done)}
      </Button>
    </div>
  );
}

function ResultCategory({
  label,
  created,
  skipped,
  total,
  failures,
}: {
  label: string;
  created: number;
  skipped?: number;
  total: number;
  failures: { name: string; error?: string }[];
}) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-1.5 text-xs">
        {created > 0 && (
          <span className="text-green-600 font-medium">{created} created</span>
        )}
        {skipped !== undefined && skipped > 0 && (
          <span className="text-muted-foreground">{skipped} skipped</span>
        )}
        {failures.length > 0 && (
          <span className="text-destructive font-medium">{failures.length} failed</span>
        )}
        {created === 0 && (skipped === undefined || skipped === 0) && failures.length === 0 && (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}
