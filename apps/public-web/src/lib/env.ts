import { env } from "$env/dynamic/public";

export const API_BASE_URL: string = env.PUBLIC_API_BASE_URL ?? "http://localhost:3002/api";
