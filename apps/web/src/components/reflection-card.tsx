import { useTranslations } from "next-intl";
import type { ReflectionDto } from "@embr/types";

export function ReflectionCard({
  reflection,
  onDismiss,
}: {
  reflection: ReflectionDto;
  onDismiss: (id: string) => void;
}) {
  const t = useTranslations("Dashboard");
  const tEnum = useTranslations("Enums");

  return (
    <div className="flex items-start justify-between gap-3 rounded border border-teal/20 bg-teal/5 px-4 py-3">
      <p className="text-sm font-medium text-teal">
        {reflection.type === "weekly_frequency"
          ? `${t("thisWeek", { count: reflection.totalCount })} · ${t("mostCommon", { category: tEnum(`category.${reflection.topCategory}`) })}`
          : t("loggingStreak", { days: reflection.days })}
      </p>
      <button
        onClick={() => onDismiss(reflection.id)}
        aria-label={t("dismissReflection")}
        className="shrink-0 text-teal/60 hover:text-teal"
      >
        ×
      </button>
    </div>
  );
}
