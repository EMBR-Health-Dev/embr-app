import type { Metadata } from "next";
import localFont from "next/font/local";
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
  title: "EMBR Admin",
  description: "Internal operations console for the EMBR platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      {/* bg-background/text-foreground resolve to admin's dark-theme CSS
          variables (globals.css) — same classes as web, different
          rendered colors, per the semantic token architecture. */}
      <body className="bg-background text-foreground antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
