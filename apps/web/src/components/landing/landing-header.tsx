"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "../../lib/auth-context";
import { LanguageSwitcher } from "../language-switcher";
import { CtaLink, REGISTRATION_OPEN, START_HREF, container } from "./cta-link";
import { BrandWordmark } from "../brand-wordmark";

const navLink =
  "rounded-sm text-sm text-graphite-700 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Public header. Client-side only because of the one auth-aware slot:
 * a signed-in visitor gets a way back into the app instead of the
 * sign-up CTA. `/` deliberately never redirects anyone — the page has
 * to stay reachable (and return 200 for the deploy health check).
 */
export function LandingHeader() {
  const t = useTranslations("Landing.nav");
  const tAccess = useTranslations("Landing.earlyAccess");
  const { user } = useAuth();

  return (
    <header className="border-b border-border-subtle">
      <div
        className={`${container} flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4`}
      >
        <Link
          href="/"
          aria-label={t("home")}
          className="flex min-h-11 items-center rounded-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <BrandWordmark className="h-[15px]" />
        </Link>

        <nav aria-label={t("label")} className="hidden items-center gap-6 lg:flex">
          <a href="#product" className={navLink}>
            {t("product")}
          </a>
          <a href="#how-it-works" className={navLink}>
            {t("howItWorks")}
          </a>
          <a href="#brief" className={navLink}>
            {t("brief")}
          </a>
          <a href="#privacy" className={navLink}>
            {t("privacy")}
          </a>
        </nav>

        <div className="flex items-center gap-3 sm:gap-5">
          <LanguageSwitcher />
          {user ? (
            <CtaLink href="/dashboard" size="sm">
              {t("dashboard")}
            </CtaLink>
          ) : (
            <>
              <Link href="/login" className={navLink}>
                {t("logIn")}
              </Link>
              {/* Hidden on narrow screens: there's no room beside the
                  logo, switcher and Log in, and the hero's own primary
                  CTA sits directly below. */}
              <CtaLink href={START_HREF} size="sm" className="hidden sm:inline-flex">
                {REGISTRATION_OPEN ? t("start") : tAccess("label")}
              </CtaLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
