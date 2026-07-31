"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../../lib/auth-context";
import { api } from "../../../lib/api";
import { ApiError } from "../../../lib/api-client";
import { Button } from "../../../components/button";

type Status =
  | "checking"
  | "needs-auth"
  | "accepting"
  | "accepted"
  | "already-member"
  | "wrong-account"
  | "error";

function AcceptInviteScreen() {
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
    if (loading) return;

    if (!token) {
      setStatus("error");
      setErrorMessage(
        "This invite link is missing its token — check that you copied the whole link from the email.",
      );
      return;
    }

    if (!user) {
      setStatus("needs-auth");
      return;
    }

    if (attempted.current) return;
    attempted.current = true;

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
          setErrorMessage(
            err instanceof ApiError
              ? err.message
              : "Something went wrong accepting that invite. Try again in a moment.",
          );
        }
      });
  }, [loading, user, token]);

  if (loading || status === "checking" || status === "accepting") {
    return <p className="text-navy/50">Loading…</p>;
  }

  if (status === "needs-auth") {
    const returnTo = `/organizations/accept-invite?token=${encodeURIComponent(token ?? "")}`;
    const encoded = encodeURIComponent(returnTo);
    return (
      <div className="w-full max-w-sm text-center">
        <h1 className="font-display text-2xl text-navy">You&apos;ve been invited</h1>
        <p className="mt-3 text-sm text-navy/60">
          Log in or create an EMBR account using the same email this invite was sent to, and
          you&apos;ll come right back here to join.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Button className="w-full" onClick={() => router.push(`/login?redirect=${encoded}`)}>
            Log in
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => router.push(`/register?redirect=${encoded}`)}
          >
            Create an account
          </Button>
        </div>
      </div>
    );
  }

  if (status === "accepted") {
    return (
      <div className="w-full max-w-sm text-center">
        <h1 className="font-display text-2xl text-navy">You&apos;re in</h1>
        <p className="mt-3 text-sm text-navy/60">
          {orgName ? (
            <>
              You&apos;ve joined <span className="font-medium text-navy">{orgName}</span>.
            </>
          ) : (
            "You've joined the organization."
          )}
        </p>
        <Button className="mt-6" onClick={() => router.push("/organization")}>
          Go to organization
        </Button>
      </div>
    );
  }

  if (status === "already-member") {
    return (
      <div className="w-full max-w-sm text-center">
        <h1 className="font-display text-2xl text-navy">Already a member</h1>
        <p className="mt-3 text-sm text-navy/60">
          You&apos;re already part of this organization — nothing more to do here.
        </p>
        <Button className="mt-6" onClick={() => router.push("/organization")}>
          Go to organization
        </Button>
      </div>
    );
  }

  if (status === "wrong-account") {
    const returnTo = `/organizations/accept-invite?token=${encodeURIComponent(token ?? "")}`;
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
        <h1 className="font-display text-2xl text-navy">Wrong account</h1>
        <p className="mt-3 text-sm text-navy/60">
          This invitation was sent to a different email address than{" "}
          <span className="font-medium text-navy">{user?.email}</span>, the account you&apos;re
          currently signed into. Log out and sign back in with the email the invite was sent to.
        </p>
        <Button className="mt-6 w-full" disabled={loggingOut} onClick={() => void logOutAndRetry()}>
          {loggingOut ? "Logging out…" : "Log out and try again"}
        </Button>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-sm font-medium text-teal underline underline-offset-2"
        >
          Stay signed in and go to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm text-center">
      <h1 className="font-display text-2xl text-navy">Couldn&apos;t accept that invite</h1>
      <p className="mt-3 text-sm text-red-600">{errorMessage}</p>
      <Link
        href="/dashboard"
        className="mt-6 inline-block text-sm font-medium text-teal underline underline-offset-2"
      >
        Go to dashboard
      </Link>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <Suspense fallback={<p className="text-navy/50">Loading…</p>}>
        <AcceptInviteScreen />
      </Suspense>
    </main>
  );
}
