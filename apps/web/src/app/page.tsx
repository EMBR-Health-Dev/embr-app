import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { LandingHeader } from "../components/landing/landing-header";
import { Hero } from "../components/landing/hero";
import { ProductStory } from "../components/landing/product-story";
import {
  BriefSection,
  ClosingCta,
  EvidenceSection,
  LandingFooter,
  PrivacySection,
  ProductSection,
} from "../components/landing/sections";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Landing.meta");
  const title = t("title");
  const description = t("description");
  return {
    title,
    description,
    // No og:image on purpose — there's no approved share asset yet.
    openGraph: { type: "website", siteName: "EMBR", title, description },
    twitter: { card: "summary", title, description },
  };
}

/**
 * Public landing page. Previously `/` only redirected (to /dashboard or
 * /login); now it renders for everyone, signed in or not. Signed-in
 * visitors get an "Open your dashboard" link in the header instead of
 * an automatic redirect, so the public page stays reachable and `/`
 * keeps returning 200 for the Railway health check.
 */
export default function HomePage() {
  const t = useTranslations("Landing");

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:outline focus:outline-2 focus:outline-ring"
      >
        {t("skipToContent")}
      </a>
      <LandingHeader />
      <main id="main">
        <Hero />
        <ProductStory />
        <ProductSection />
        <BriefSection />
        <EvidenceSection />
        <PrivacySection />
        <ClosingCta />
      </main>
      <LandingFooter />
    </>
  );
}
