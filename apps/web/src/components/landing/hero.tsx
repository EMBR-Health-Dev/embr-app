import { useTranslations } from "next-intl";
import { CtaLink, Eyebrow, REGISTRATION_OPEN, START_HREF, container } from "./cta-link";
import { HeroIllustration } from "./hero-illustration";
import { BriefIcon, HeartPulseIcon, PatternIcon } from "../little-icons";

const LOOP = ["record", "patterns", "prepare"] as const;
const LOOP_ICONS = {
  record: HeartPulseIcon,
  patterns: PatternIcon,
  prepare: BriefIcon,
} as const;

export function Hero() {
  const t = useTranslations("Landing.hero");
  const tAccess = useTranslations("Landing.earlyAccess");

  return (
    <section aria-labelledby="hero-heading" className="border-b border-border-subtle">
      <div className={`${container} pb-16 pt-14 sm:pb-24 sm:pt-20 lg:pb-28 lg:pt-28`}>
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <Eyebrow>{t("eyebrow")}</Eyebrow>
            <h1
              id="hero-heading"
              className="mt-6 max-w-4xl text-balance font-display [word-break:auto-phrase] text-[2.75rem] leading-[1.05] text-foreground sm:text-[4rem] lg:text-[4.5rem]"
            >
              {t("headline")}
            </h1>
            <p className="mt-6 max-w-2xl text-body-l text-graphite-700 sm:mt-8 sm:text-[1.25rem] sm:leading-relaxed">
              {t("lead")}
            </p>
            <p className="mt-4 max-w-2xl text-body-l font-medium text-foreground sm:text-[1.25rem] sm:leading-relaxed">
              {t("body")}
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <CtaLink href={START_HREF}>
                {REGISTRATION_OPEN ? t("primaryCta") : tAccess("label")}
              </CtaLink>
              <CtaLink href="#how-it-works" variant="secondary">
                {t("secondaryCta")}
              </CtaLink>
            </div>
            {!REGISTRATION_OPEN && (
              <p className="mt-5 max-w-xl text-body-s text-graphite-700">{tAccess("note")}</p>
            )}
            <p className="mt-2 max-w-xl text-body-s text-muted-foreground">{t("trust")}</p>
          </div>
          <div className="hidden sm:block lg:col-span-5">
            <HeroIllustration />
          </div>
        </div>

        <ol
          aria-label={t("loopLabel")}
          className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-border-subtle bg-border-subtle sm:mt-20 sm:grid-cols-3"
        >
          {LOOP.map((step, i) => {
            const StepIcon = LOOP_ICONS[step];
            return (
              <li key={step} className="flex items-center gap-3 bg-background px-4 py-4 sm:px-5">
                <StepIcon size={20} className="shrink-0 text-lilac-700" />
                <span className="font-mono text-caption text-muted-foreground" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-body-s font-medium text-foreground">{t(`loop.${step}`)}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
