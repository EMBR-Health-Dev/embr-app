/**
 * Thrown by `createApiClient`'s `apiFetch` for any non-2xx response.
 * Previously defined identically in apps/web, apps/admin, and
 * apps/mobile's own api-client.ts files — consolidated here since none
 * of the three copies had any platform-specific behavior.
 */
export class ApiError extends Error {
  code: string;
  status: number;
  details?: Array<{ field: string; message: string }>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
