"use client";

import { cn } from "@aicortex/ui/lib/utils";
import { Markdown } from "../../common/markdown";
import { ChatContent } from "./chat-content";

interface ChatBubbleProps {
  role: "user" | "agent";
  content: string;
  /** Show a blinking cursor to indicate streaming in progress. */
  streaming?: boolean;
  className?: string;
  /**
   * When true, embedded <question-form> blocks are interactive (user can fill
   * and submit). Defaults to false — forms render as read-only in history.
   */
  interactive?: boolean;
  /**
   * When a message contains a <question-form> and the user submits it, this
   * callback fires with the formatted prose answer text.
   */
  onFormSubmit?: (text: string) => void;
  /**
   * For rendering history: the content of the NEXT user message. If it starts
   * with "[form answers — ...]", we parse it to pre-fill the locked form.
   */
  nextUserContent?: string;
}

/**
 * Shared chat bubble used by both the regular ChatWindow and the public
 * EndUser chat view. Keeps message rendering visually consistent everywhere.
 *
 * If an agent message contains <question-form>...</question-form> blocks,
 * those are extracted and rendered as interactive form components instead
 * of raw markdown. The surrounding prose is still rendered normally.
 */
export function ChatBubble({
  role,
  content,
  streaming,
  className,
  interactive = false,
  onFormSubmit,
  nextUserContent,
}: ChatBubbleProps) {
  const isUser = role === "user";

  // Forms are only interactive when NOT streaming (form could change
  // mid-stream) and the submit callback is wired.
  const formInteractive = interactive && !streaming && !!onFormSubmit;

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start", className)}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm break-words",
          isUser
            ? "bg-muted"
            : "bg-card border",
        )}
      >
        {isUser ? (
          <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <Markdown>{content}</Markdown>
          </div>
        ) : (
          <>
            <ChatContent
              content={content}
              interactive={formInteractive}
              onFormSubmit={onFormSubmit}
              nextUserContent={nextUserContent}
            />
            {streaming && (
              <span className="inline-block w-1.5 h-4 bg-foreground/60 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
            )}
          </>
        )}
      </div>
    </div>
  );
}
