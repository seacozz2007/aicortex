"use client";

import { useT } from "../../i18n";

export function DesignPreviewCommentHint({
  annotatedCount,
  onDismiss,
}: {
  annotatedCount: number;
  onDismiss?: () => void;
}) {
  const { t } = useT("design");

  return (
    <div className="pointer-events-auto absolute left-3 top-14 z-20 max-w-[min(360px,calc(100%-24px))] rounded-xl border border-white/10 bg-[#141418]/92 px-3 py-2.5 text-[11px] text-white shadow-lg backdrop-blur-md">
      <p className="leading-relaxed text-white/80">
        {annotatedCount === 0
          ? t(($) => $.preview.hint.no_targets)
          : t(($) => $.preview.hint.pick_target)}
      </p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-1.5 text-[10px] text-white/45 hover:text-white/70"
        >
          {t(($) => $.preview.hint.dismiss)}
        </button>
      ) : null}
    </div>
  );
}
