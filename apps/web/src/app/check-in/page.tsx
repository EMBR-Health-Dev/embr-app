import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FIRST_CHECK_IN_ENABLED } from "../../lib/first-check-in";
import { FirstCheckIn } from "./first-check-in";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("FirstCheckIn");
  // Shared by link while it is tested; kept out of search results.
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/** The account free first check in. Off in a build without the flag. */
export default function FirstCheckInPage() {
  if (!FIRST_CHECK_IN_ENABLED) notFound();
  return <FirstCheckIn />;
}
