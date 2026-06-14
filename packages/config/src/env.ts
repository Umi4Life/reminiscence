const REQUIRED_ENV_NAMES = [
  "DATABASE_URL",
  "PUBLIC_APP_URL",
  "ADMIN_APP_URL",
  "API_PUBLIC_BASE_URL",
  "API_ADMIN_BASE_URL",
  "SESSION_SECRET",
  "TOKEN_HMAC_SECRET",
  "RATE_LIMIT_HMAC_SECRET",
  "TRUST_PROXY",
  "ADMIN_SESSION_TTL_DAYS",
  "PUBLIC_MUTATION_SESSION_TTL_HOURS",
] as const;

type RequiredEnvName = (typeof REQUIRED_ENV_NAMES)[number];
type HttpUrlEnvName = Exclude<RequiredEnvName, "DATABASE_URL">;

export interface AppConfig {
  databaseUrl: string;
  publicAppUrl: string;
  adminAppUrl: string;
  apiPublicBaseUrl: string;
  apiAdminBaseUrl: string;
  sessionSecret: string;
  tokenHmacSecret: string;
  rateLimitHmacSecret: string;
  trustProxy: boolean;
  adminSessionTtlDays: number;
  publicMutationSessionTtlHours: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const SECRET_ENV_NAMES = [
  "SESSION_SECRET",
  "TOKEN_HMAC_SECRET",
  "RATE_LIMIT_HMAC_SECRET",
] as const satisfies readonly RequiredEnvName[];

const MIN_PRODUCTION_SECRET_LENGTH = 32;

// Example/placeholder values that must never be accepted in production.
const PLACEHOLDER_SECRETS = new Set(["change-me", "change-me-in-development"]);

export function parseEnv(input: Record<string, string | undefined>): AppConfig {
  const values = readRequiredValues(input);
  assertStrongProductionSecrets(values, input.NODE_ENV === "production");

  return {
    databaseUrl: parseDatabaseUrl(values.DATABASE_URL),
    publicAppUrl: parseHttpUrl(values.PUBLIC_APP_URL, "PUBLIC_APP_URL"),
    adminAppUrl: parseHttpUrl(values.ADMIN_APP_URL, "ADMIN_APP_URL"),
    apiPublicBaseUrl: parseHttpUrl(values.API_PUBLIC_BASE_URL, "API_PUBLIC_BASE_URL"),
    apiAdminBaseUrl: parseHttpUrl(values.API_ADMIN_BASE_URL, "API_ADMIN_BASE_URL"),
    sessionSecret: values.SESSION_SECRET,
    tokenHmacSecret: values.TOKEN_HMAC_SECRET,
    rateLimitHmacSecret: values.RATE_LIMIT_HMAC_SECRET,
    trustProxy: parseBoolean(values.TRUST_PROXY, "TRUST_PROXY"),
    adminSessionTtlDays: parsePositiveInteger(
      values.ADMIN_SESSION_TTL_DAYS,
      "ADMIN_SESSION_TTL_DAYS",
    ),
    publicMutationSessionTtlHours: parsePositiveInteger(
      values.PUBLIC_MUTATION_SESSION_TTL_HOURS,
      "PUBLIC_MUTATION_SESSION_TTL_HOURS",
    ),
  };
}

function readRequiredValues(
  input: Record<string, string | undefined>,
): Record<RequiredEnvName, string> {
  const missing = REQUIRED_ENV_NAMES.filter((name) => isBlank(input[name]));

  if (missing.length > 0) {
    throw new ConfigError(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return Object.fromEntries(
    REQUIRED_ENV_NAMES.map((name) => [name, input[name]?.trim()]),
  ) as Record<RequiredEnvName, string>;
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0;
}

/**
 * In production, presence is not enough: reject secrets that are placeholders or
 * too short to be high-entropy. Kept production-only so local dev, tests, and
 * seeding can keep using the documented `change-me` placeholders.
 */
function assertStrongProductionSecrets(
  values: Record<RequiredEnvName, string>,
  isProduction: boolean,
): void {
  if (!isProduction) {
    return;
  }

  for (const name of SECRET_ENV_NAMES) {
    const value = values[name];

    if (PLACEHOLDER_SECRETS.has(value) || value.length < MIN_PRODUCTION_SECRET_LENGTH) {
      throw new ConfigError(
        `${name} must be a strong secret (at least ${MIN_PRODUCTION_SECRET_LENGTH} characters and not a placeholder) when NODE_ENV=production`,
      );
    }
  }
}

function parseDatabaseUrl(value: string): string {
  const url = parseUrl(value, "DATABASE_URL");

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new ConfigError("DATABASE_URL must use postgres or postgresql scheme");
  }

  return value;
}

function parseHttpUrl(value: string, name: HttpUrlEnvName): string {
  const url = parseUrl(value, name);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConfigError(`${name} must use http or https scheme`);
  }

  return value;
}

function parseUrl(value: string, name: RequiredEnvName): { protocol: string } {
  const Url = (globalThis as { URL?: new (url: string) => { protocol: string } }).URL;

  if (Url === undefined) {
    throw new ConfigError("URL parser is unavailable in this runtime");
  }

  try {
    return new Url(value);
  } catch {
    throw new ConfigError(`${name} must be a valid URL`);
  }
}

function parseBoolean(value: string, name: RequiredEnvName): boolean {
  const normalized = value.toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new ConfigError(`${name} must be true or false`);
}

function parsePositiveInteger(value: string, name: RequiredEnvName): number {
  if (!/^\d+$/.test(value)) {
    throw new ConfigError(`${name} must be a positive integer`);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ConfigError(`${name} must be a positive integer`);
  }

  return parsed;
}
