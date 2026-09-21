"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

interface NavLink {
  href: string;
  label: string;
}

/**
 * Shared top navigation for the authenticated product — replaces the
 * flat row of underlined text links each page used to build inline
 * (dashboard/page.tsx, trends/page.tsx, ...) with one real `<nav>`,
 * used consistently everywhere. Primary items match the brand
 * direction's information architecture (Home / Timeline / Signals /
 * Clinical Brief) against the routes that actually exist — "Record"
 * itself isn't a separate route (logging happens on the dashboard),
 * but the Timeline is its chronological detail view, placed right
 * after Home to keep Record → Understand → Prepare in reading order.
 * "Signals" is the product-facing name for what the /trends route
 * shows; the route itself stays as-is to avoid breaking existing
 * links.
 *
 * Settings/Treatments/Export/Organization keep working (nothing here
 * removes a route) but move into a secondary "More" disclosure on
 * desktop, rather than competing with the primary items for attention
 * — Settings doesn't need the same visual weight as the four record/
 * understand/prepare items on every page view. Below the `md`
 * breakpoint the primary row has nowhere to go without wrapping, so it
 * collapses into a single unified menu (primary + secondary links,
 * stacked) instead — two native `<details>` elements, swapped by
 * breakpoint, so both stay keyboard-operable and screen-reader
 * navigable with no menu-open/closed JS state to get wrong.
 */
export function AppNav({
  userEmail,
  managesOrg,
  onLogout,
}: {
  userEmail: string;
  managesOrg: boolean;
  onLogout: () => void;
}) {
  const t = useTranslations("Nav");
  const pathname = usePathname();

  const primaryLinks: NavLink[] = [
    { href: "/dashboard", label: t("home") },
    { href: "/timeline", label: t("timeline") },
    { href: "/trends", label: t("signals") },
    { href: "/brief", label: t("clinicalBrief") },
  ];

  const secondaryLinks: NavLink[] = [
    { href: "/treatments", label: t("treatments") },
    { href: "/export", label: t("export") },
    ...(managesOrg ? [{ href: "/organization", label: t("organization") }] : []),
    { href: "/settings", label: t("settings") },
  ];

  function isActive(href: string): boolean {
    return pathname === href;
  }

  return (
    <header className="border-b border-border-subtle">
      <nav
        aria-label={t("navigationLabel")}
        className="mx-auto flex max-w-3xl items-center justify-between gap-x-6 px-6 py-4"
      >
        <Link
          href="/dashboard"
          className="font-display text-heading-m text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          EMBR
        </Link>

        {/* Desktop / tablet: full primary row + secondary "More" menu. */}
        <div
          data-testid="app-nav-desktop"
          className="hidden flex-1 items-center justify-end gap-x-5 text-sm md:flex"
        >
          <ul className="flex items-center gap-x-5">
            {primaryLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={`font-medium underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    isActive(link.href)
                      ? "text-foreground underline decoration-primary decoration-2"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <details className="group relative">
            <summary className="cursor-pointer list-none font-medium text-muted-foreground marker:content-none hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {t("more")}
            </summary>
            <div className="absolute right-0 z-10 mt-2 flex min-w-40 flex-col gap-1 rounded border border-border bg-background p-2 shadow-subtle">
              {secondaryLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-sm px-2 py-1.5 text-foreground hover:bg-muted"
                >
                  {link.label}
                </Link>
              ))}
              <div className="my-1 h-px bg-border-subtle" aria-hidden="true" />
              <span className="truncate px-2 py-1 text-xs text-muted-foreground">{userEmail}</span>
              <button
                onClick={onLogout}
                className="rounded-sm px-2 py-1.5 text-left text-foreground hover:bg-muted"
              >
                {t("logout")}
              </button>
            </div>
          </details>
        </div>

        {/* Mobile: one unified menu — primary + secondary links stacked. */}
        <details data-testid="app-nav-mobile" className="group relative md:hidden">
          <summary
            aria-label={t("menu")}
            className="cursor-pointer list-none font-medium text-muted-foreground marker:content-none hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("menu")}
          </summary>
          <div className="absolute right-0 z-10 mt-2 flex min-w-48 flex-col gap-1 rounded border border-border bg-background p-2 shadow-subtle">
            {primaryLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={`rounded-sm px-2 py-1.5 font-medium ${
                  isActive(link.href)
                    ? "text-foreground underline decoration-primary decoration-2 underline-offset-4"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="my-1 h-px bg-border-subtle" aria-hidden="true" />
            {secondaryLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-sm px-2 py-1.5 text-foreground hover:bg-muted"
              >
                {link.label}
              </Link>
            ))}
            <div className="my-1 h-px bg-border-subtle" aria-hidden="true" />
            <span className="truncate px-2 py-1 text-xs text-muted-foreground">{userEmail}</span>
            <button
              onClick={onLogout}
              className="rounded-sm px-2 py-1.5 text-left text-foreground hover:bg-muted"
            >
              {t("logout")}
            </button>
          </div>
        </details>
      </nav>
    </header>
  );
}
