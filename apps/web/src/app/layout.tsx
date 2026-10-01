import type { Metadata } from "next";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "./globals.css";
import { AuthProvider } from "../lib/auth-context";

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
  description: "Perimenopause and menopause health, understood.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${instrumentSerif.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-background text-foreground antialiased">
        <NextIntlClientProvider>
          <AuthProvider>{children}</AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
