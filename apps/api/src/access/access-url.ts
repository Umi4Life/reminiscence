import type { AppConfig } from "@queue-reminiscence/config";

export function buildPublicAccessUrl(config: AppConfig, accessCode: string): string {
  return new URL(`/q/${accessCode}`, config.publicAppUrl).toString();
}

export function buildQrSvgUrl(config: AppConfig, accessCode: string): string {
  const base = config.apiPublicBaseUrl.replace(/\/$/, "");
  return `${base}/qr/${encodeURIComponent(accessCode)}.svg`;
}
