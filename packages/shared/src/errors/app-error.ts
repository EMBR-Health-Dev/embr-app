import { ErrorCode, ERROR_STATUS_MAP } from "./error-codes.js";

export interface AppErrorOptions {
  code: ErrorCode;
  message: string;
  /** Safe-to-log, not-safe-to-return-to-client debug context. */
  context?: Record<string, unknown>;
  /** Field-level validation issues, if applicable. */
  details?: Array<{ field: string; message: string }>;
  cause?: unknown;
}

/**
 * Base class for all application-thrown errors. Never throw a raw Error
 * from business logic — throw (or extend) AppError so the global error
 * handler can serialize a consistent, safe response shape.
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly context?: Record<string, unknown>;
  public readonly details?: Array<{ field: string; message: string }>;
  public readonly isOperational = true;

  constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
    this.statusCode = ERROR_STATUS_MAP[options.code];
    this.context = options.context;
    this.details = options.details;
    Error.captureStackTrace?.(this, AppError);
  }

  static validation(message: string, details?: Array<{ field: string; message: string }>) {
    return new AppError({ code: ErrorCode.VALIDATION_ERROR, message, details });
  }

  static unauthorized(message = "Authentication required") {
    return new AppError({ code: ErrorCode.UNAUTHORIZED, message });
  }

  static forbidden(message = "You do not have access to this resource") {
    return new AppError({ code: ErrorCode.FORBIDDEN, message });
  }

  static notFound(resource: string) {
    return new AppError({ code: ErrorCode.NOT_FOUND, message: `${resource} not found` });
  }

  static conflict(message: string) {
    return new AppError({ code: ErrorCode.CONFLICT, message });
  }

  static internal(message = "An unexpected error occurred", cause?: unknown) {
    return new AppError({ code: ErrorCode.INTERNAL_ERROR, message, cause });
  }

  static serviceUnavailable(message = "Service temporarily unavailable", cause?: unknown) {
    return new AppError({ code: ErrorCode.SERVICE_UNAVAILABLE, message, cause });
  }
}
