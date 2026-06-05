"use client";

import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@aicortex/ui/components/ui/dialog";
import { Button } from "@aicortex/ui/components/ui/button";
import { endUserMessagesOptions } from "@aicortex/core/enduser/queries";
import type { EndUserSession, EndUserMessage } from "@aicortex/core/types";
import { useT } from "../i18n";

interface EndUserMessageHistoryDialogProps {
  session: EndUserSession;
  onClose: () => void;
}

export function EndUserMessageHistoryDialog({ session, onClose }: EndUserMessageHistoryDialogProps) {
  const { t } = useT("enduser");
  const { data: messages = [], isLoading } = useQuery(endUserMessagesOptions(session.id));

  const grouped = messages.reduce<Record<string, EndUserMessage[]>>((acc, msg) => {
    const group = acc[msg.visitor_id] ?? [];
    group.push(msg);
    acc[msg.visitor_id] = group;
    return acc;
  }, {});

  const visitorIds = Object.keys(grouped);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogHeader>
        <DialogTitle>{t(($) => $.message_history.title, { title: session.title })}</DialogTitle>
      </DialogHeader>
      <div className="max-h-96 overflow-y-auto space-y-4">
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground">{t(($) => $.public.loading)}</p>
        ) : visitorIds.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">{t(($) => $.message_history.no_messages)}</p>
        ) : (
          visitorIds.map((visitorId) => (
            <div key={visitorId} className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground px-1">
                {t(($) => $.message_history.visitor, { id: visitorId.slice(0, 8) })}
              </p>
              {grouped[visitorId]?.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-1.5 text-xs ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
      <DialogFooter>
        <Button size="sm" onClick={onClose}>{t(($) => $.message_history.close)}</Button>
      </DialogFooter>
    </Dialog>
  );
}
