export type ApiErrorCode =
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited";

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }

  toBody(): ApiErrorBody {
    return {
      code: this.code,
      message: this.message,
    };
  }
}

export function validationError(message: string): ApiError {
  return new ApiError("validation_error", message, 400);
}

export function unauthorizedError(message = "Authentication required."): ApiError {
  return new ApiError("unauthorized", message, 401);
}

export function forbiddenError(
  message = "You do not have permission to perform this action.",
): ApiError {
  return new ApiError("forbidden", message, 403);
}

export function notFoundError(message = "Resource not found."): ApiError {
  return new ApiError("not_found", message, 404);
}

export function rateLimitedError(message = "Too many requests. Try again shortly."): ApiError {
  return new ApiError("rate_limited", message, 429);
}
