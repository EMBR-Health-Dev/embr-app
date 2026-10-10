import { useTranslations } from "next-intl";
import { Eyebrow, container } from "./cta-link";

const MOMENTS = ["m1", "m2", "m3", "m4"] as const;
const STEPS = ["track", "patterns", "brief", "care"] as const;

export function ProductStory() {
  const t = useTranslations("Landing.story");

  return (
    <>
      <section aria-labelledby="story-heading" className="bg-lilac-100">
        <div
          className={`${container} grid grid-cols-1 gap-12 py-20 sm:py-28 lg:grid-cols-12 lg:gap-16`}
        >
          <div className="lg:col-span-5">
            <Eyebrow>{t("eyebrow")}</Eyebrow>
            <h2
              id="story-heading"
              className="mt-5 font-display text-display-m text-foreground sm:text-display-l"
            >
              {t("headline")}
            </h2>
          </div>
          <div className="lg:col-span-7">
            <ul className="border-t border-lilac-300">
              {MOMENTS.map((m) => (
                <li
                  key={m}
                  className="border-b border-lilac-300 py-4 font-display text-heading-m italic text-graphite-700 sm:text-heading-l"
                >
                  {t(`moments.${m}`)}
                </li>
              ))}
            </ul>
            <p className="mt-8 max-w-xl text-body-l text-graphite-700">{t("body")}</p>
            <p className="mt-4 text-body-l font-medium text-foreground">{t("kicker")}</p>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        aria-labelledby="how-heading"
        className="scroll-mt-4 border-b border-border-subtle"
      >
        <div className={`${container} py-20 sm:py-28`}>
          <h2
            id="how-heading"
            className="font-display text-heading-xl text-foreground sm:text-display-m"
          >
            {t("stepsHeading")}
          </h2>
          <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {STEPS.map((step, i) => (
              <li key={step} className="border-t-2 border-foreground pt-5">
                <p className="flex items-baseline gap-3 text-caption font-medium uppercase tracking-[0.14em] text-graphite-700">
                  <span className="font-mono" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {t(`steps.${step}.label`)}
                </p>
                <h3 className="mt-4 font-display text-heading-m text-foreground">
                  {t(`steps.${step}.title`)}
                </h3>
                <p className="mt-3 text-body-s text-graphite-700">{t(`steps.${step}.body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
