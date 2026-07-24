import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EMBR",
  description: "Perimenopause and menopause health, understood.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bone text-navy antialiased">{children}</body>
    </html>
  );
}
