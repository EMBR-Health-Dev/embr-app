import { useTranslations } from "next-intl";
import { Eyebrow, container } from "./cta-link";

const STAGES = ["capture", "compute", "trace", "explain"] as const;
const SPECS = ["version", "determinism", "aiRole", "region", "audit"] as const;

// A faint engineering grid behind the section, drawn from the border
// token so it follows the light and dark themes.
const GRID = {
  backgroundImage:
    "linear-gradient(rgb(var(--border-subtle)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--border-subtle)) 1px, transparent 1px)",
  backgroundSize: "28px 28px",
};

/**
 * How EMBR turns a record into evidence, shown as the pipeline it is.
 * Every figure here is a real value from the code (taxonomy size,
 * thresholds, interpretation version), not marketing: keep them in
 * step with apps/api if a rule changes.
 */
export function EngineSection() {
  const t = useTranslations("Landing.engine");

  return (
    <section
      id="engine"
      aria-labelledby="engine-heading"
      className="scroll-mt-4 border-y border-border-subtle"
      style={GRID}
    >
      <div className={`${container} py-20 sm:py-28`}>
        <div className="max-w-3xl">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2
            id="engine-heading"
            className="mt-5 font-display text-display-m text-foreground sm:text-display-l"
          >
            {t("headline")}
          </h2>
          <p className="mt-6 text-body-l text-graphite-700">{t("body")}</p>
        </div>

        <ol className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STAGES.map((stage, i) => (
            <li
              key={stage}
              className="relative flex flex-col rounded-sm border border-border bg-background p-6"
            >
              <div className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.12em]">
                <span className="text-lilac-700">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-graphite-500">{t(`stages.${stage}.label`)}</span>
              </div>
              <h3 className="mt-5 font-display text-heading-m text-foreground">
                {t(`stages.${stage}.title`)}
              </h3>
              <p className="mt-3 flex-1 text-body-s text-graphite-700">
                {t(`stages.${stage}.body`)}
              </p>
              <code className="mt-5 block rounded-sm bg-lilac-100 px-3 py-2 font-mono text-xs text-lilac-700">
                {t(`stages.${stage}.spec`)}
              </code>
              {i < STAGES.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute -right-3 top-1/2 hidden h-px w-2 bg-border lg:block"
                />
              )}
            </li>
          ))}
        </ol>

        <dl className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-border bg-border font-mono text-xs sm:grid-cols-2 lg:grid-cols-5">
          {SPECS.map((spec) => (
            <div key={spec} className="bg-background px-4 py-3">
              <dt className="uppercase tracking-[0.1em] text-graphite-500">
                {t(`specs.${spec}.key`)}
              </dt>
              <dd className="mt-1 text-foreground">{t(`specs.${spec}.value`)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
