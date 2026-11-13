"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "../../lib/auth-context";
import { AppNav } from "../../components/app-nav";
import { BrandWordmark } from "../../components/brand-wordmark";
import { LanguageSwitcher } from "../../components/language-switcher";
import { ContactForm } from "../../components/contact-form";
import { SafetyNotice } from "../../components/safety-notice";

/** Each answer points at the place in the app that does it. */
const FAQ: Array<{ key: string; links: Array<{ href: string; label: string }> }> = [
  { key: "whatIsEmbr", links: [] },
  { key: "whatIsBrief", links: [{ href: "/brief", label: "brief" }] },
  { key: "sharing", links: [{ href: "/brief", label: "brief" }] },
  {
    key: "signIn",
    links: [
      { href: "/forgot-password", label: "resetPassword" },
      { href: "/login-link", label: "loginLink" },
    ],
  },
  { key: "verify", links: [{ href: "/settings", label: "settings" }] },
  { key: "export", links: [{ href: "/export", label: "export" }] },
  { key: "delete", links: [{ href: "/settings", label: "settings" }] },
  { key: "language", links: [{ href: "/settings", label: "settings" }] },
];

/** Only a plain app path is passed on with a message: never a query string. */
function safeFromPath(value: string | null): string | undefined {
  return value && /^\/[A-Za-z0-9/_-]{0,199}$/.test(value) ? value : undefined;
}

function HelpContent() {
  const t = useTranslations("Help");
  const { user, logout } = useAuth();
  const router = useRouter();
  const fromPage = safeFromPath(useSearchParams().get("from"));

  return (
    <div className="min-h-screen">
      {user ? (
        <AppNav
          userEmail={user.email}
          managesOrg={false}
          onLogout={() => {
            void logout().then(() => router.push("/login"));
          }}
        />
      ) : (
        <header className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-6 pt-6">
          <Link href="/" className="flex min-h-11 items-center" aria-label={t("backHome")}>
            <BrandWordmark className="h-[15px]" />
          </Link>
          <LanguageSwitcher />
        </header>
      )}

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="font-display text-heading-xl text-foreground">{t("title")}</h1>
        <p className="mt-3 text-sm text-foreground/60">{t("intro")}</p>

        <section className="mt-10" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="font-display text-heading-m text-foreground">
            {t("faqHeading")}
          </h2>
          <div className="mt-4 divide-y divide-border-subtle border-y border-border-subtle">
            {FAQ.map(({ key, links }) => (
              <details key={key} className="group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-3 text-body-s font-medium text-foreground marker:content-none">
                  {t(`faq.${key}.q`)}
                  <span
                    aria-hidden="true"
                    className="text-foreground/40 transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <div className="pb-4 text-sm text-foreground/75">
                  <p>{t(`faq.${key}.a`)}</p>
                  {links.length > 0 && (
                    <p className="mt-2 flex flex-wrap gap-x-4">
                      {links.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-2 sm:min-h-0"
                        >
                          {t(`links.${link.label}`)}
                        </Link>
                      ))}
                    </p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>

        <section id="contact" className="mt-12 scroll-mt-6" aria-labelledby="contact-heading">
          <h2 id="contact-heading" className="font-display text-heading-m text-foreground">
            {t("contactHeading")}
          </h2>
          <p className="mt-2 text-sm text-foreground/60">{t("contactIntro")}</p>
          <ContactForm defaultEmail={user?.email} fromPage={fromPage} />
        </section>

        <SafetyNotice />
      </main>
    </div>
  );
}

export default function HelpPage() {
  return (
    <Suspense fallback={null}>
      <HelpContent />
    </Suspense>
  );
}
