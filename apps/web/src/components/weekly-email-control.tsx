"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "../lib/api";

/**
 * The weekly reminder email: off until she turns it on. The email
 * carries nothing from her record (see the API's weekly-email.ts).
 */
export function WeeklyEmailControl() {
  const t = useTranslations("Settings");
  const id = useId();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.notifications
      .get()
      .then((prefs) => setEnabled(prefs.weeklyEmail))
      .catch(() => setEnabled(false));
  }, []);

  async function update(next: boolean) {
    setSaving(true);
    setFailed(false);
    try {
      const prefs = await api.notifications.patch({ weeklyEmail: next });
      setEnabled(prefs.weeklyEmail);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  if (enabled === null) return null;

  return (
    <>
      <div className="mt-4 flex items-center gap-3">
        <input
          id={id}
          type="checkbox"
          checked={enabled}
          disabled={saving}
          onChange={(e) => void update(e.target.checked)}
          className="h-5 w-5 accent-lilac-700 disabled:opacity-60"
        />
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {t("weeklyEmailToggle")}
        </label>
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 text-sm text-foreground/70">
        {failed ? t("weeklyEmailError") : enabled ? t("weeklyEmailOn") : null}
      </p>
    </>
  );
}
