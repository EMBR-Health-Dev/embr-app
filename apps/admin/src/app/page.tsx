"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { BrandWordmark } from "../components/brand-wordmark";

export default function AdminHomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/dashboard" : "/login");
  }, [loading, user, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="flex items-baseline gap-3 text-foreground">
        <BrandWordmark className="h-6" />
        <span className="text-sm font-medium uppercase tracking-[0.14em] text-foreground/70">
          Admin
        </span>
      </h1>
      <p className="text-sm text-foreground/50">Loading…</p>
    </main>
  );
}
