import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EMBR Admin",
  description: "Internal operations console for the EMBR platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-navy text-bone antialiased">{children}</body>
    </html>
  );
}
