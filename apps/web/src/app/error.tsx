"use client";

import { useEffect, useState } from "react";
import { Button } from "../components/button";

// Deliberately not using next-intl here. This is the last-resort net
// for a render error anywhere in the tree below the root layout —
// exactly the moment something has already gone wrong, so it shouldn't
// depend on the same provider tree (NextIntlClientProvider included)
// that may have been involved in causing it. The locale cookie itself
// (see lib/i18n/locale.ts) is plain, dependency-free to read directly.
const COPY = {
  en: {
    title: "Something went wrong",
    body: "This page hit an unexpected error. Your data is safe — nothing here was saved or lost because of this.",
    retry: "Try again",
    home: "Go to dashboard",
  },
  ja: {
    title: "問題が発生しました",
    body: "このページで予期しないエラーが発生しました。データは保護されています — この件によって保存や消失が起きたわけではありません。",
    retry: "再試行",
    home: "ダッシュボードへ",
  },
};

function readLocaleCookie(): "en" | "ja" {
  if (typeof document === "undefined") return "en";
  const match = document.cookie.match(/(?:^|; )EMBR_LOCALE=(en|ja)/);
  return match?.[1] === "ja" ? "ja" : "en";
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale, setLocale] = useState<"en" | "ja">("en");

  useEffect(() => {
    // document.cookie isn't available during server rendering — this
    // reads the real locale once mounted client-side rather than
    // guessing it during SSR, same pattern already used elsewhere in
    // this app for a client-only value discovered after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocale(readLocaleCookie());
    // Server-side error monitoring already exists (Sentry, apps/api);
    // there is no client-side error reporting configured yet for
    // apps/web (see docs/DEPLOYMENT.md's "Known gap" note) — logging
    // here at least puts the error and its digest somewhere a person
    // looking at browser console output during a bug report can see
    // it, without adding a new dependency to actually ship it anywhere.
    console.error("Unhandled render error:", error);
  }, [error]);

  const t = COPY[locale];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-display text-heading-xl text-foreground">{t.title}</h1>
      <p className="max-w-sm text-sm text-foreground/60">{t.body}</p>
      <div className="mt-2 flex gap-3">
        <Button onClick={() => reset()}>{t.retry}</Button>
        <Button variant="ghost" onClick={() => (window.location.href = "/dashboard")}>
          {t.home}
        </Button>
      </div>
    </main>
  );
}
