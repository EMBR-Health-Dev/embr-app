"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

/** True only when she has said she is postmenopausal. Cycle length and
 * period tracking are hidden for her, but bleeding can still be logged:
 * it belongs in her record. Unanswered or unknown keeps the full view. */
export function isPostmenopause(lifeStage: string | null | undefined): boolean {
  return lifeStage === "POSTMENOPAUSE";
}

/** Her self reported life stage, fetched once per mount. undefined while
 * loading, null when unanswered or the request failed. */
export function useLifeStage(enabled = true): string | null | undefined {
  const [lifeStage, setLifeStage] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    api.onboarding
      .get()
      .then((profile) => setLifeStage(profile.lifeStage))
      .catch(() => setLifeStage(null));
  }, [enabled]);

  return lifeStage;
}
