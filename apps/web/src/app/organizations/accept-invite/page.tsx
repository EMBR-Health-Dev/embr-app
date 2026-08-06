"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../../../lib/auth-context";
import { api } from "../../../lib/api";
import { ApiError } from "../../../lib/api-client";
import { Button } from "../../../components/button";

type Status = "accepting" | "joined" | "error";

function AcceptInviteContent() {
  const token = useSearchParams().get("token");
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<Status>("accepting");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (loading || !user || !token) return;
    let cancelled = false;

    api.organizations
      .acceptInvite(token)
      .then(() => {
        if (!cancelled) setStatus("joined");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(
          err instanceof ApiError ? err.message : "Something went wrong. Try again in a moment.",
        );
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [loading, user, token]);

  if (!token) {
    return (
      <p className="text-sm text-red-600">
        This invite link is missing its token — check the link in your email and try again.
      </p>
    );
  }

  if (loading) return null;

  if (!user) {
    // Preserve the token through the login round trip via `next`; a
    // brand-new user goes through /register instead, then follows the
    // same email link back here once their account exists and their
    // email is verified — no `next` to carry there, since register
    // doesn't log the user in directly (see Milestone 2).
    const nextPath = `/organizations/accept-invite?token=${encodeURIComponent(token)}`;
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className="text-sm text-navy/70">
          Log in or create an account to accept this invitation.
        </p>
        <div className="flex flex-col gap-3">
          <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>
            <Button className="w-full">Log in</Button>
          </Link>
          <Link href="/register">
            <Button variant="ghost" className="w-full">
              Create an account
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (status === "accepting") {
    return <p className="text-sm text-navy/60">Accepting invitation…</p>;
  }

  if (status === "joined") {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className="text-sm text-navy/70">You&apos;ve joined the organization.</p>
        <Link href="/dashboard">
          <Button className="w-full">Go to dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 text-center">
      <p className="text-sm text-red-600">{errorMessage}</p>
      <Link
        href="/dashboard"
        className="text-sm font-medium text-teal underline underline-offset-2"
      >
        Go to dashboard
      </Link>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl text-navy text-center">Organization invite</h1>
        <div className="mt-8">
          <Suspense fallback={null}>
            <AcceptInviteContent />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
