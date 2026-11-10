import type { Metadata } from "next";

// A shared BRIEF is for one clinician, never for search engines, and the
// address carries its token: no indexing, no referrer.
export const metadata: Metadata = {
  title: "Shared EMBR BRIEF",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function SharedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
