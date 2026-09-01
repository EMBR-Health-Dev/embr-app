"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "../../../lib/auth-context";
import { api } from "../../../lib/api";
import { ApiError } from "../../../lib/api-client";
import { Button } from "../../../components/button";

type Status = "checking" | "accepting" | "accepted" | "already-member" | "wrong-account" | "error";

function AcceptInviteScreen() {
  const t = useTranslations("AcceptInvite");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { user, loading, logout } = useAuth();

  const [status, setStatus] = useState<Status>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  // Guards against the effect firing twice (React Strict Mode, or the
  // user/token dependency settling in two steps as auth loads) and
  // accidentally double-submitting the accept call — the API is
  // idempotent about it either way (a second accept just 409s), but
  // there's no reason to rely on that when a ref this cheap avoids it.
  const attempted = useRef(false);

  useEffect(() => {
    // The missing-token and needs-auth cases are handled as direct
    // render-time checks below (see the two early returns right after
    // this effect) — they're derivable synchronously from token/user/
    // loading with no async work involved, so routing them through
    // setState-in-an-effect would just be an unnecessary extra render
    // (see react.dev/learn/you-might-not-need-an-effect).
    if (loading || !token || !user) return;

    if (attempted.current) return;
    attempted.current = true;

    // Starting the actual async accept call is the one part of this
    // effect that legitimately sets state synchronously before an
    // async continuation — matches React's own documented
    // fetch-in-effect pattern
    // (react.dev/learn/synchronizing-with-effects#fetching-data).
    setStatus("accepting");
    api.organizations.invites
      .accept(token)
      .then(async () => {
        setStatus("accepted");
        // Best-effort, purely for a friendlier confirmation message —
        // the join itself already succeeded regardless of whether this
        // lookup works.
        try {
          const memberships = await api.organizations.mine();
          const joined = memberships[memberships.length - 1];
          if (joined) setOrgName(joined.organizationName);
        } catch {
          // Ignore.
        }
      })
      .catch((err: unknown) => {
        // The service throws a 409 both for "already a member of this
        // org" and (via the generic conflict path) other conflicts, but
        // acceptInvite's only 409 case is "already a member" — safe to
        // treat as the friendly case rather than a real error.
        if (err instanceof ApiError && err.status === 409) {
          setStatus("already-member");
        } else if (err instanceof ApiError && err.status === 403) {
          // acceptInvite's only 403 case: signed in, but as someone
          // whose email doesn't match who the invite was sent to. Not
          // a dead end — logging out and signing back in as the right
          // person resolves it, so offer that directly rather than a
          // generic error.
          setStatus("wrong-account");
        } else {
          setStatus("error");
          setErrorMessage(err instanceof ApiError ? err.message : t("genericError"));
        }
      });
  }, [loading, user, token, t]);

  if (loading) {
    return <p className="text-navy/50">{tCommon("loading")}</p>;
  }

  if (!token) {
    return (
      <div className="w-full max-w-sm text-center">
        <h1 className="font-display text-2xl text-navy">{t("couldntAccept")}</h1>
        <p className="mt-3 text-sm text-red-600">{t("missingToken")}</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block text-sm font-medium text-teal underline underline-offset-2"
        >
          {t("goToDashboard")}
        </Link>
      </div>
    );
  }

  if (!user) {
    const returnTo = `/organizations/accept-invite?token=${encodeURIComponent(token)}`;
    const encoded = encodeURIComponent(returnTo);
    return (
      <div className="w-full max-w-sm text-center">
        <h1 className="font-display text-2xl text-navy">{t("youveBeenInvited")}</h1>
        <p className="mt-3 text-sm text-navy/60">{t("loginPrompt")}</p>
        <div className="mt-6 flex flex-col gap-3">
          <Button className="w-full" onClick={() => router.push(`/login?redirect=${encoded}`)}>
            {t("logIn")}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => router.push(`/register?redirect=${encoded}`)}
          >
            {t("createAccount")}
          </Button>
        </div>
      </div>
    );
  }

  if (status === "checking" || status === "accepting") {
    return <p className="text-navy/50">{tCommon("loading")}</p>;
  }

  if (status === "accepted") {
    return (
      <div className="w-full max-w-sm text-center">
        <h1 className="font-display text-2xl text-navy">{t("youreIn")}</h1>
        <p className="mt-3 text-sm text-navy/60">
          {orgName
            ? t.rich("joinedNamed", {
                orgName,
                strong: (chunks) => <span className="font-medium text-navy">{chunks}</span>,
              })
            : t("joinedUnnamed")}
        </p>
        <p className="mt-4 rounded border border-teal/20 bg-teal/5 p-3 text-left text-sm text-navy/70">
          {t("privacyNote")}
        </p>
        <Button className="mt-6" onClick={() => router.push("/organization")}>
          {t("goToOrganization")}
        </Button>
      </div>
    );
  }

  if (status === "already-member") {
    return (
      <div className="w-full max-w-sm text-center">
        <h1 className="font-display text-2xl text-navy">{t("alreadyMember")}</h1>
        <p className="mt-3 text-sm text-navy/60">{t("alreadyMemberBody")}</p>
        <Button className="mt-6" onClick={() => router.push("/organization")}>
          {t("goToOrganization")}
        </Button>
      </div>
    );
  }

  if (status === "wrong-account") {
    const returnTo = `/organizations/accept-invite?token=${encodeURIComponent(token)}`;
    const encoded = encodeURIComponent(returnTo);

    async function logOutAndRetry() {
      setLoggingOut(true);
      try {
        await logout();
        router.push(`/login?redirect=${encoded}`);
      } finally {
        setLoggingOut(false);
      }
    }

    return (
      <div className="w-full max-w-sm text-center">
        <h1 className="font-display text-2xl text-navy">{t("wrongAccount")}</h1>
        <p className="mt-3 text-sm text-navy/60">
          {t.rich("wrongAccountBody", {
            email: user?.email ?? "",
            strong: (chunks) => <span className="font-medium text-navy">{chunks}</span>,
          })}
        </p>
        <Button className="mt-6 w-full" disabled={loggingOut} onClick={() => void logOutAndRetry()}>
          {loggingOut ? t("loggingOut") : t("logOutAndRetry")}
        </Button>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-sm font-medium text-teal underline underline-offset-2"
        >
          {t("stayAndGoToDashboard")}
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm text-center">
      <h1 className="font-display text-2xl text-navy">{t("couldntAccept")}</h1>
      <p className="mt-3 text-sm text-red-600">{errorMessage}</p>
      <Link
        href="/dashboard"
        className="mt-6 inline-block text-sm font-medium text-teal underline underline-offset-2"
      >
        {t("goToDashboard")}
      </Link>
    </div>
  );
}

export default function AcceptInvitePage() {
  const t = useTranslations("Common");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <Suspense fallback={<p className="text-navy/50">{t("loading")}</p>}>
        <AcceptInviteScreen />
      </Suspense>
    </main>
  );
}
