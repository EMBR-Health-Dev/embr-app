import type { Metadata } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { BrandWordmark } from "../../components/brand-wordmark";
import { LanguageSwitcher } from "../../components/language-switcher";
import {
  CtaLink,
  Eyebrow,
  REGISTRATION_OPEN,
  START_HREF,
  container,
} from "../../components/landing/cta-link";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Beta");
  // For invited testers: reachable by link, kept out of search results.
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

const FEEDBACK_EMAIL = "info@embrhealthcare.com";

const ASK = ["checkIn", "firstBrief", "tellUs"] as const;
const START = ["signUp", "verify", "welcome", "phone"] as const;
const WEEK = ["logToday", "lifeStage", "aWeek", "firstBrief"] as const;
const LOGIN = ["email", "show", "link", "reset"] as const;
const LIMITS = ["diagnosis", "brief", "encrypted", "yours", "beta"] as const;
const HELPS = ["what", "screenshot", "missing", "nearlyGaveUp"] as const;

const sectionHeading = "font-display text-heading-l text-foreground sm:text-heading-xl";
const body = "text-body-m leading-relaxed text-graphite-700";

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t border-border-subtle">
      <div
        className={`${container} grid grid-cols-1 gap-6 py-14 sm:py-16 lg:grid-cols-12 lg:gap-10`}
      >
        <h2 id={id} className={`${sectionHeading} lg:col-span-4`}>
          {title}
        </h2>
        <div className="max-w-2xl lg:col-span-8">{children}</div>
      </div>
    </section>
  );
}

/** Numbered steps, numbered the way the landing page numbers its loop. */
function Steps({ items }: { items: { title: string; body?: string }[] }) {
  return (
    <ol className="divide-y divide-border-subtle rounded-sm border border-border-subtle">
      {items.map((item, i) => (
        <li key={item.title} className="flex gap-4 px-4 py-4 sm:px-5">
          <span className="pt-0.5 font-mono text-caption text-muted-foreground" aria-hidden="true">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span>
            <span className="block text-body-m font-medium text-foreground">{item.title}</span>
            {item.body && <span className={`mt-1 block ${body}`}>{item.body}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The tester welcome guide, public so it can be sent to anyone invited
 * to the beta. Same copy as the guide doc, in EN and JA.
 */
export default function BetaGuidePage() {
  const t = useTranslations("Beta");
  const tAccess = useTranslations("Landing.earlyAccess");
  const tFooter = useTranslations("Landing.footer");

  return (
    <>
      <header className="border-b border-border-subtle">
        <div className={`${container} flex min-h-16 items-center justify-between gap-4`}>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <BrandWordmark className="h-[15px]" />
          </Link>
          <LanguageSwitcher />
        </div>
      </header>

      <main id="main">
        <section aria-labelledby="beta-heading">
          <div className={`${container} pb-14 pt-14 sm:pb-20 sm:pt-20`}>
            <Eyebrow>{t("eyebrow")}</Eyebrow>
            <h1
              id="beta-heading"
              className="mt-6 max-w-3xl text-balance font-display [word-break:auto-phrase] text-display-m text-foreground sm:text-display-xl"
            >
              {/* Phrases kept whole: Safari does not apply word-break:auto-phrase. */}
              {t.rich("headline", {
                phrase: (chunks) => <span className="inline-block">{chunks}</span>,
              })}
            </h1>
            <p className="mt-6 max-w-2xl text-body-l text-graphite-700 sm:text-[1.25rem] sm:leading-relaxed">
              {t("lead")}
            </p>
            <p className="mt-4 max-w-2xl text-body-m leading-relaxed text-graphite-700">
              {t("about")}
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <CtaLink href={START_HREF}>
                {REGISTRATION_OPEN ? t("createAccount") : tAccess("label")}
              </CtaLink>
              <CtaLink href="/login" variant="secondary">
                {t("logIn")}
              </CtaLink>
            </div>
          </div>
        </section>

        <Section id="ask" title={t("ask.title")}>
          <Steps items={ASK.map((k) => ({ title: t(`ask.items.${k}`) }))} />
        </Section>

        <Section id="start" title={t("start.title")}>
          <p className={`mb-6 ${body}`}>{t("start.intro")}</p>
          <Steps
            items={START.map((k) => ({
              title: t(`start.steps.${k}.title`),
              body: t(`start.steps.${k}.body`),
            }))}
          />
          <p className={`mt-6 ${body}`}>{t("start.language")}</p>
        </Section>

        <Section id="week" title={t("week.title")}>
          <p className={`mb-6 ${body}`}>{t("week.intro")}</p>
          <Steps items={WEEK.map((k) => ({ title: t(`week.items.${k}`) }))} />
          <p className={`mt-6 ${body}`}>{t("week.quietDays")}</p>
          <p className={`mt-4 ${body}`}>{t("week.brief")}</p>
        </Section>

        <Section id="login" title={t("login.title")}>
          <p className={`mb-6 ${body}`}>{t("login.intro")}</p>
          <Steps items={LOGIN.map((k) => ({ title: t(`login.steps.${k}`) }))} />
          <p className={`mt-6 ${body}`}>
            {t("login.stillStuck")}{" "}
            <a
              href={`mailto:${FEEDBACK_EMAIL}`}
              className="font-medium text-lilac-700 underline underline-offset-2"
            >
              {FEEDBACK_EMAIL}
            </a>
            . {t("login.neverPassword")}
          </p>
        </Section>

        <Section id="record" title={t("limits.title")}>
          <p className={`mb-6 ${body}`}>{t("limits.intro")}</p>
          <dl className="divide-y divide-border-subtle rounded-sm border border-border-subtle">
            {LIMITS.map((k) => (
              <div key={k} className="px-4 py-4 sm:px-5">
                <dt className="text-body-m font-medium text-foreground">
                  {t(`limits.items.${k}.title`)}
                </dt>
                <dd className={`mt-1 ${body}`}>{t(`limits.items.${k}.body`)}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="feedback" title={t("feedback.title")}>
          <p className={body}>{t("feedback.how")}</p>
          <p className={`mt-6 mb-4 text-body-m font-medium text-foreground`}>
            {t("feedback.helpsTitle")}
          </p>
          <ul className="flex flex-col gap-2">
            {HELPS.map((k) => (
              <li key={k} className={`flex gap-3 ${body}`}>
                <span
                  aria-hidden="true"
                  className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-lilac-500"
                />
                <span>{t(`feedback.helps.${k}`)}</span>
              </li>
            ))}
          </ul>
          <p className={`mt-6 ${body}`}>{t("feedback.iphone")}</p>
        </Section>

        <section aria-labelledby="beta-cta" className="border-t border-border-subtle">
          <div className={`${container} py-20 text-center sm:py-24`}>
            <h2
              id="beta-cta"
              className="mx-auto max-w-2xl text-balance font-display text-display-m text-foreground"
            >
              {t("closing")}
            </h2>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <CtaLink href={START_HREF}>
                {REGISTRATION_OPEN ? t("createAccount") : tAccess("label")}
              </CtaLink>
              <CtaLink href="/login" variant="secondary">
                {t("logIn")}
              </CtaLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle">
        <div className={`${container} py-10`}>
          <BrandWordmark className="h-5 text-foreground" />
          <p className="mt-6 max-w-3xl text-caption text-muted-foreground">
            {tFooter("disclaimer")}
          </p>
        </div>
      </footer>
    </>
  );
}
