import Link from "next/link";
import { useTranslations } from "next-intl";
import { CtaLink, Eyebrow, START_HREF, container } from "./cta-link";
import { BriefMockup, RecordMockup } from "./mockups";

const PRODUCT_POINTS = ["record", "signals", "brief"] as const;
const BRIEF_POINTS = ["contents", "evidence", "questions", "pdf"] as const;
const EVIDENCE_POINTS = ["dated", "consistent", "descriptive"] as const;
const PRIVACY_POINTS = ["yours", "export", "delete", "sessions", "employer"] as const;

export function ProductSection() {
  const t = useTranslations("Landing.product");

  return (
    <section id="product" aria-labelledby="product-heading" className="scroll-mt-4">
      <div className={`${container} grid gap-14 py-20 sm:py-28 lg:grid-cols-12 lg:gap-16`}>
        <div className="lg:col-span-6">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2
            id="product-heading"
            className="mt-5 font-display text-display-m text-foreground sm:text-display-l"
          >
            {t("headline")}
          </h2>
          <p className="mt-6 text-body-l text-graphite-700">{t("body1")}</p>
          <p className="mt-4 text-body-m text-graphite-700">{t("body2")}</p>
          <dl className="mt-10 space-y-6">
            {PRODUCT_POINTS.map((p) => (
              <div key={p} className="border-l-2 border-primary pl-5">
                <dt className="font-medium text-foreground">{t(`points.${p}.title`)}</dt>
                <dd className="mt-1 text-body-s text-graphite-700">{t(`points.${p}.body`)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="lg:col-span-6 lg:pt-16">
          <RecordMockup />
        </div>
      </div>
    </section>
  );
}

export function BriefSection() {
  const t = useTranslations("Landing.brief");

  return (
    <section
      id="brief"
      aria-labelledby="brief-heading"
      className="scroll-mt-4 bg-graphite-900 text-pearl-50"
    >
      <div className={`${container} grid gap-14 py-20 sm:py-28 lg:grid-cols-12 lg:gap-16`}>
        <div className="lg:col-span-5">
          <Eyebrow tone="inverse">{t("eyebrow")}</Eyebrow>
          <h2 id="brief-heading" className="mt-5 font-display text-display-m sm:text-display-l">
            {t("headline")}
          </h2>
          <p className="mt-6 text-body-l text-pearl-50/85">{t("body")}</p>
          <p className="mt-6 border-l-2 border-lilac-400 pl-4 text-body-m font-medium">
            {t("disclaimer")}
          </p>
          <ul className="mt-10 space-y-4">
            {BRIEF_POINTS.map((p) => (
              <li key={p} className="flex gap-3 text-body-s text-pearl-50/85">
                <span
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-lilac-400"
                  aria-hidden="true"
                />
                {t(`points.${p}`)}
              </li>
            ))}
          </ul>
          <p className="mt-10 text-body-s text-pearl-50/70">{t("clinician")}</p>
        </div>
        <div className="lg:col-span-7">
          <BriefMockup />
        </div>
      </div>
    </section>
  );
}

export function EvidenceSection() {
  const t = useTranslations("Landing.evidence");

  return (
    <section aria-labelledby="evidence-heading" className="border-b border-border-subtle">
      <div className={`${container} py-20 sm:py-28`}>
        <div className="max-w-3xl">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2
            id="evidence-heading"
            className="mt-5 font-display text-display-m text-foreground sm:text-display-l"
          >
            {t("headline")}
          </h2>
          <p className="mt-6 text-body-l text-graphite-700">{t("body1")}</p>
          <p className="mt-4 text-body-m text-graphite-700">{t("body2")}</p>
          <p className="mt-4 text-body-m text-graphite-700">{t("body3")}</p>
        </div>
        <ul className="mt-14 grid gap-px overflow-hidden rounded-sm border border-border-subtle bg-border-subtle md:grid-cols-3">
          {EVIDENCE_POINTS.map((p) => (
            <li key={p} className="bg-background p-6 sm:p-8">
              <h3 className="font-display text-heading-m text-foreground">
                {t(`points.${p}.title`)}
              </h3>
              <p className="mt-3 text-body-s text-graphite-700">{t(`points.${p}.body`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function PrivacySection() {
  const t = useTranslations("Landing.privacy");

  return (
    <section id="privacy" aria-labelledby="privacy-heading" className="scroll-mt-4 bg-lilac-100">
      <div className={`${container} grid gap-12 py-20 sm:py-28 lg:grid-cols-12 lg:gap-16`}>
        <div className="lg:col-span-4">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 id="privacy-heading" className="mt-5 font-display text-display-m text-foreground">
            {t("headline")}
          </h2>
          <p className="mt-6 text-body-m text-graphite-700">{t("body")}</p>
        </div>
        <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:col-span-8">
          {PRIVACY_POINTS.map((p) => (
            <div key={p} className="border-t border-lilac-300 pt-4">
              <dt className="font-medium text-foreground">{t(`points.${p}.title`)}</dt>
              <dd className="mt-2 text-body-s text-graphite-700">{t(`points.${p}.body`)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function ClosingCta() {
  const t = useTranslations("Landing.cta");
  const tHero = useTranslations("Landing.hero");

  return (
    <section aria-labelledby="cta-heading">
      <div className={`${container} py-24 text-center sm:py-32`}>
        <h2
          id="cta-heading"
          className="mx-auto max-w-3xl text-balance font-display text-display-m text-foreground sm:text-display-xl"
        >
          {t("headline")}
        </h2>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <CtaLink href={START_HREF}>{t("primary")}</CtaLink>
          <CtaLink href="#product" variant="secondary">
            {t("secondary")}
          </CtaLink>
        </div>
        <p className="mx-auto mt-5 max-w-xl text-body-s text-muted-foreground">{tHero("trust")}</p>
      </div>
    </section>
  );
}

const footerLink =
  "rounded-sm text-body-s text-graphite-700 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Privacy and Terms are intentionally absent: no such pages exist in
 * apps/web yet, and a dead link is worse than none. Add them here once
 * the pages ship.
 */
export function LandingFooter() {
  const t = useTranslations("Landing.footer");

  return (
    <footer className="border-t border-border-subtle">
      <div
        className={`${container} flex flex-col gap-10 py-12 sm:flex-row sm:items-start sm:justify-between`}
      >
        <div>
          <p className="font-display text-heading-l text-foreground">EMBR</p>
          <p className="mt-1 text-body-s text-graphite-700">{t("tagline")}</p>
        </div>
        <nav aria-label={t("label")}>
          <ul className="flex flex-wrap gap-x-6 gap-y-3">
            <li>
              <a href="#product" className={footerLink}>
                {t("product")}
              </a>
            </li>
            <li>
              <Link href="/login" className={footerLink}>
                {t("logIn")}
              </Link>
            </li>
            <li>
              <Link href={START_HREF} className={footerLink}>
                {t("createAccount")}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className={`${container} pb-12`}>
        <p className="max-w-3xl border-t border-border-subtle pt-6 text-caption text-muted-foreground">
          {t("disclaimer")}
        </p>
      </div>
    </footer>
  );
}
