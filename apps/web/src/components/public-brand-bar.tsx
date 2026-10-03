"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandWordmark } from "./brand-wordmark";

// Pages a person sees before the app's own navigation: sign in, account
// recovery, consent, invitations and onboarding. The landing page and
// the signed-in app carry the wordmark in their own headers.
const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/consent",
  "/organizations/accept-invite",
  "/onboarding",
];

/** The EMBR wordmark at the top of every pre-app page, linking home. */
export function PublicBrandBar() {
  const pathname = usePathname();
  if (!PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return null;
  }
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-10">
      <div className="px-6 pt-5 sm:px-8 sm:pt-6">
        <Link
          href="/"
          className="pointer-events-auto inline-flex min-h-11 items-center rounded-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <BrandWordmark className="h-[15px]" />
        </Link>
      </div>
    </header>
  );
}
