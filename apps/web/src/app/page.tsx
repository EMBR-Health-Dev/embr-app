import type { HealthCheckResponse } from "@embr/types";

async function getApiHealth(): Promise<HealthCheckResponse | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/health/ready`, {
      cache: "no-store",
    });
    return (await res.json()) as HealthCheckResponse;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const health = await getApiHealth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold text-navy">EMBR Platform</h1>
      <p className="text-teal">Milestone 1 — production foundation</p>
      <p className="text-sm text-navy/60">API status: {health?.status ?? "unreachable"}</p>
    </main>
  );
}
