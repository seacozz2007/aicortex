"use client";

import { useState, type ReactNode } from "react";
import {
  ExternalLink,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { cn } from "@aicortex/ui/lib/utils";
import { Button } from "@aicortex/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@aicortex/ui/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aicortex/ui/components/ui/popover";
import { useT } from "../../i18n";

export function DesignPreviewBrowserChrome({
  addressText,
  externalHref,
  onRefresh,
  commentMode = false,
  onCommentModeChange,
  designEnabled = true,
  sourcePanel,
  overflowMenu,
}: {
  addressText: string;
  externalHref?: string;
  onRefresh?: () => void;
  commentMode?: boolean;
  onCommentModeChange?: (enabled: boolean) => void;
  designEnabled?: boolean;
  sourcePanel?: ReactNode | ((close: () => void) => ReactNode);
  overflowMenu?: ReactNode;
}) {
  const { t } = useT("design");
  const [sourceOpen, setSourceOpen] = useState(false);
  const closeSource = () => setSourceOpen(false);
  const resolvedSourcePanel =
    typeof sourcePanel === "function" ? sourcePanel(closeSource) : sourcePanel;

  return (
    <div className="shrink-0 border-b bg-sidebar">
      <div className="flex h-9 items-center gap-1 px-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7 shrink-0 text-muted-foreground"
          onClick={() => onRefresh?.()}
          disabled={!onRefresh}
          title={t(($) => $.preview.chrome.refresh)}
          aria-label={t(($) => $.preview.chrome.refresh)}
        >
          <RefreshCw className="size-3.5" />
        </Button>

        {resolvedSourcePanel ? (
          <Popover open={sourceOpen} onOpenChange={setSourceOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-7 min-w-0 flex-1 items-center rounded-md border border-border/60 bg-muted/40 px-2.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                title={t(($) => $.preview.chrome.address)}
              >
                <span className="truncate font-mono">{addressText}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-3">
              {resolvedSourcePanel}
            </PopoverContent>
          </Popover>
        ) : (
          <div className="flex h-7 min-w-0 flex-1 items-center rounded-md border border-border/60 bg-muted/40 px-2.5">
            <span className="truncate font-mono text-[11px] text-muted-foreground">{addressText}</span>
          </div>
        )}

        {designEnabled && onCommentModeChange ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              "size-7 shrink-0",
              commentMode
                ? "bg-brand/15 text-brand hover:bg-brand/20 hover:text-brand"
                : "text-muted-foreground",
            )}
            onClick={() => onCommentModeChange(!commentMode)}
            title={t(($) => $.session.comment_mode)}
            aria-label={t(($) => $.session.comment_mode)}
            aria-pressed={commentMode}
          >
            <Sparkles className="size-3.5" />
          </Button>
        ) : null}

        {externalHref ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7 shrink-0 text-muted-foreground"
            asChild
          >
            <a
              href={externalHref}
              target="_blank"
              rel="noreferrer"
              title={t(($) => $.preview.open_external)}
              aria-label={t(($) => $.preview.open_external)}
            >
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        ) : null}

        {overflowMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-7 shrink-0 text-muted-foreground"
                title={t(($) => $.preview.chrome.more)}
                aria-label={t(($) => $.preview.chrome.more)}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {overflowMenu}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
