import { env } from "$env/dynamic/public";

export const API_BASE_URL: string = env.PUBLIC_API_BASE_URL ?? "/api";
export const PUBLIC_APP_URL: string = env.PUBLIC_APP_URL ?? "http://localhost:3000";
