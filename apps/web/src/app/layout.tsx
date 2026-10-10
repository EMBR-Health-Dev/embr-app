import type { Metadata } from "next";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import "./globals.css";
import { AuthProvider } from "../lib/auth-context";
import { PublicBrandBar } from "../components/public-brand-bar";
import { TEXT_SIZE_COOKIE, textSizeFromCookie } from "../display/text-size";
import { TextSizeProvider } from "../display/text-size-context";

// Self-hosted (not next/font/google): a live Google Fonts fetch at build
// time is a network dependency CI shouldn't have, and it has failed
// intermittently in practice. These .ttf files are the same OFL-licensed
// sources Google Fonts serves, vendored from github.com/google/fonts.
const instrumentSerif = localFont({
  src: [
    { path: "../fonts/InstrumentSerif-Regular.ttf", weight: "400", style: "normal" },
    { path: "../fonts/InstrumentSerif-Italic.ttf", weight: "400", style: "italic" },
  ],
  variable: "--font-display",
});

const inter = localFont({
  src: "../fonts/Inter.ttf",
  weight: "100 900",
  variable: "--font-body",
});

const jetbrainsMono = localFont({
  src: "../fonts/JetBrainsMono.ttf",
  weight: "100 800",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "EMBR",
  description:
    "EMBR helps you track symptoms, see patterns over time, and turn your experience into evidence for your healthcare conversations.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const textSize = textSizeFromCookie((await cookies()).get(TEXT_SIZE_COOKIE)?.value);

  return (
    <html
      lang={locale}
      data-text-size={textSize === "standard" ? undefined : textSize}
      className={`${instrumentSerif.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-background text-foreground antialiased">
        <NextIntlClientProvider>
          <TextSizeProvider value={textSize}>
            <AuthProvider>
              <PublicBrandBar />
              {children}
            </AuthProvider>
          </TextSizeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
