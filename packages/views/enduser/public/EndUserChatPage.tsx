"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock } from "lucide-react";
import { endUserPublicSessionOptions } from "@aicortex/core/enduser/queries";
import { EndUserChatView } from "./EndUserChatView";
import { useT } from "../../i18n";

interface EndUserChatPageProps {
  token: string;
}

export function EndUserChatPage({ token }: EndUserChatPageProps) {
  const { t } = useT("enduser");
  const { data: session, isLoading, error } = useQuery(endUserPublicSessionOptions(token));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground text-sm">{t(($) => $.public.loading)}</p>
      </div>
    );
  }

  if (error || !session || session.status !== "active") {
    const isExpired = session?.status === "expired";
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 px-4">
        <div className="flex flex-col items-center gap-2 text-center">
          {isExpired ? (
            <>
              <Clock className="h-10 w-10 text-muted-foreground" />
              <h1 className="text-lg font-semibold">{t(($) => $.public.expired_title)}</h1>
              <p className="text-sm text-muted-foreground max-w-md">{t(($) => $.public.expired_description)}</p>
            </>
          ) : (
            <>
              <AlertTriangle className="h-10 w-10 text-muted-foreground" />
              <h1 className="text-lg font-semibold">{t(($) => $.public.invalid_title)}</h1>
              <p className="text-sm text-muted-foreground max-w-md">{t(($) => $.public.invalid_description)}</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <EndUserChatView session={session} token={token} />
    </div>
  );
}
