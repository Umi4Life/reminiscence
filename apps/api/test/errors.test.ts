import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import {
  forbiddenError,
  notFoundError,
  rateLimitedError,
  unauthorizedError,
  validationError,
} from "../src/http/errors";
import { apiFailure } from "../src/http/response";

function createErrorProbeApp() {
  return new Elysia()
    .onError(({ error, set }) => {
      if ("status" in error && "code" in error && "toBody" in error) {
        const apiError = error as ReturnType<typeof validationError>;
        set.status = apiError.status;
        return apiFailure(apiError);
      }

      throw error;
    })
    .get("/validation", () => {
      throw validationError("Display name is required.");
    })
    .get("/unauthorized", () => {
      throw unauthorizedError();
    })
    .get("/forbidden", () => {
      throw forbiddenError();
    })
    .get("/not-found", () => {
      throw notFoundError();
    })
    .get("/rate-limited", () => {
      throw rateLimitedError();
    });
}

describe("API error conventions", () => {
  test("validation errors return 400 with standard body", async () => {
    const response = await createErrorProbeApp().handle(new Request("http://localhost/validation"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "validation_error",
        message: "Display name is required.",
      },
    });
  });

  test("unauthorized errors return 401", async () => {
    const response = await createErrorProbeApp().handle(
      new Request("http://localhost/unauthorized"),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "unauthorized",
        message: "Authentication required.",
      },
    });
  });

  test("forbidden errors return 403", async () => {
    const response = await createErrorProbeApp().handle(new Request("http://localhost/forbidden"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "forbidden",
        message: "You do not have permission to perform this action.",
      },
    });
  });

  test("not found errors return 404", async () => {
    const response = await createErrorProbeApp().handle(new Request("http://localhost/not-found"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "not_found",
        message: "Resource not found.",
      },
    });
  });

  test("rate limited errors return 429", async () => {
    const response = await createErrorProbeApp().handle(
      new Request("http://localhost/rate-limited"),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "rate_limited",
        message: "Too many requests. Try again shortly.",
      },
    });
  });
});
