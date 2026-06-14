import { describe, expect, test } from "bun:test";

import { ConfigError, parseEnv } from "../src/env";

const validEnv = {
  DATABASE_URL: "postgres://user:***@localhost:5432/queue_reminiscence",
  PUBLIC_APP_URL: "http://localhost:3000",
  ADMIN_APP_URL: "http://localhost:3001",
  API_PUBLIC_BASE_URL: "http://localhost:3002/api",
  API_ADMIN_BASE_URL: "http://localhost:3002/api",
  SESSION_SECRET: "change-me-in-development",
  TOKEN_HMAC_SECRET: "change-me-in-development",
  RATE_LIMIT_HMAC_SECRET: "change-me-in-development",
  TRUST_PROXY: "true",
  ADMIN_SESSION_TTL_DAYS: "14",
  PUBLIC_MUTATION_SESSION_TTL_HOURS: "8",
};

describe("parseEnv", () => {
  test("parses a valid environment into typed app config", () => {
    expect(parseEnv(validEnv)).toEqual({
      databaseUrl: validEnv.DATABASE_URL,
      publicAppUrl: validEnv.PUBLIC_APP_URL,
      adminAppUrl: validEnv.ADMIN_APP_URL,
      apiPublicBaseUrl: validEnv.API_PUBLIC_BASE_URL,
      apiAdminBaseUrl: validEnv.API_ADMIN_BASE_URL,
      sessionSecret: validEnv.SESSION_SECRET,
      tokenHmacSecret: validEnv.TOKEN_HMAC_SECRET,
      rateLimitHmacSecret: validEnv.RATE_LIMIT_HMAC_SECRET,
      trustProxy: true,
      adminSessionTtlDays: 14,
      publicMutationSessionTtlHours: 8,
    });
  });

  test("trims leading and trailing whitespace from string values before returning config", () => {
    expect(
      parseEnv({ ...validEnv, PUBLIC_APP_URL: "  http://localhost:3000  " }).publicAppUrl,
    ).toBe("http://localhost:3000");
  });

  test("parses TRUST_PROXY case-insensitively as false", () => {
    expect(parseEnv({ ...validEnv, TRUST_PROXY: "FALSE" }).trustProxy).toBe(false);
  });

  test("throws a ConfigError listing missing and blank required values", () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        DATABASE_URL: undefined,
        SESSION_SECRET: "   ",
        TOKEN_HMAC_SECRET: "",
      }),
    ).toThrow(ConfigError);

    expect(() =>
      parseEnv({
        ...validEnv,
        DATABASE_URL: undefined,
        SESSION_SECRET: "   ",
        TOKEN_HMAC_SECRET: "",
      }),
    ).toThrow(/DATABASE_URL, SESSION_SECRET, TOKEN_HMAC_SECRET/);
  });

  test("rejects invalid TRUST_PROXY values", () => {
    expect(() => parseEnv({ ...validEnv, TRUST_PROXY: "yes" })).toThrow(
      /TRUST_PROXY must be true or false/,
    );
  });

  test("rejects invalid TTL values", () => {
    expect(() => parseEnv({ ...validEnv, ADMIN_SESSION_TTL_DAYS: "0" })).toThrow(
      /ADMIN_SESSION_TTL_DAYS must be a positive integer/,
    );

    expect(() => parseEnv({ ...validEnv, PUBLIC_MUTATION_SESSION_TTL_HOURS: "1.5" })).toThrow(
      /PUBLIC_MUTATION_SESSION_TTL_HOURS must be a positive integer/,
    );
  });

  test("rejects invalid URLs", () => {
    expect(() => parseEnv({ ...validEnv, PUBLIC_APP_URL: "not a url" })).toThrow(
      /PUBLIC_APP_URL must be a valid URL/,
    );
  });

  test("rejects placeholder secrets when NODE_ENV=production", () => {
    expect(() => parseEnv({ ...validEnv, NODE_ENV: "production" })).toThrow(
      /SESSION_SECRET must be a strong secret/,
    );
  });

  test("rejects too-short secrets when NODE_ENV=production", () => {
    const strong = "x".repeat(40);
    expect(() =>
      parseEnv({
        ...validEnv,
        NODE_ENV: "production",
        SESSION_SECRET: strong,
        TOKEN_HMAC_SECRET: strong,
        RATE_LIMIT_HMAC_SECRET: "too-short",
      }),
    ).toThrow(/RATE_LIMIT_HMAC_SECRET must be a strong secret/);
  });

  test("accepts strong distinct secrets when NODE_ENV=production", () => {
    const config = parseEnv({
      ...validEnv,
      NODE_ENV: "production",
      SESSION_SECRET: "a".repeat(40),
      TOKEN_HMAC_SECRET: "b".repeat(40),
      RATE_LIMIT_HMAC_SECRET: "c".repeat(40),
    });

    expect(config.sessionSecret).toBe("a".repeat(40));
  });

  test("does not enforce secret strength outside production", () => {
    // Placeholder secrets are accepted outside production; a config is returned.
    expect(parseEnv({ ...validEnv, NODE_ENV: "development" }).sessionSecret).toBe(
      validEnv.SESSION_SECRET,
    );
  });

  test("rejects unsafe URL schemes", () => {
    expect(() => parseEnv({ ...validEnv, PUBLIC_APP_URL: "javascript:alert(1)" })).toThrow(
      /PUBLIC_APP_URL must use http or https/,
    );

    expect(() => parseEnv({ ...validEnv, DATABASE_URL: "https://localhost/database" })).toThrow(
      /DATABASE_URL must use postgres or postgresql/,
    );
  });
});

describe("package root exports", () => {
  test("importing parser exports does not eagerly parse runtime environment", async () => {
    const root = await import(`../src/index.ts?cache=${Date.now()}-${Math.random()}`);

    expect(root.parseEnv).toBeTypeOf("function");
    expect(root.ConfigError).toBe(ConfigError);
  });
});
