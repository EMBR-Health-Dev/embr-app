import type { ReactNode } from "react";

/**
 * Tags allowed in translated copy, for next-intl's t.rich. <b> marks the
 * one phrase in a passage the reader must not miss: semibold, full
 * foreground, never a colour of its own.
 */
export const richText = {
  b: (chunks: ReactNode) => <strong className="font-semibold text-foreground">{chunks}</strong>,
};
