"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { OnboardingProvider } from "../../lib/onboarding-context";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bone">
        <p className="text-navy/50">Loading…</p>
      </main>
    );
  }

  return <OnboardingProvider>{children}</OnboardingProvider>;
}
