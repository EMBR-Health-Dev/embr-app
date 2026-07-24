import type { ApiErrorResponse, HealthCheckResponse } from "@embr/types";

export interface EmbrSdkConfig {
  baseUrl: string;
  getAccessToken?: () => string | undefined;
}

/**
 * Minimal typed HTTP client. From Milestone 2 onward, endpoint methods
 * here are generated from docs/openapi.yaml rather than hand-written, to
 * guarantee the SDK never drifts from the API contract.
 */
export class EmbrSdk {
  constructor(private readonly config: EmbrSdkConfig) {}

  async getHealth(): Promise<HealthCheckResponse> {
    return this.request<HealthCheckResponse>("/health/ready");
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = this.config.getAccessToken?.();
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ApiErrorResponse | null;
      throw new Error(body?.error.message ?? `Request failed with status ${res.status}`);
    }

    return res.json() as Promise<T>;
  }
}
