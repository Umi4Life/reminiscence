import type { ApiError, ApiErrorBody } from "./errors";

export interface ApiSuccessResponse<T> {
  ok: true;
  data: T;
}

export interface ApiFailureResponse {
  ok: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiFailureResponse;

export function apiSuccess<T>(data: T): ApiSuccessResponse<T> {
  return {
    ok: true,
    data,
  };
}

export function apiFailure(error: ApiError): ApiFailureResponse {
  return {
    ok: false,
    error: error.toBody(),
  };
}
