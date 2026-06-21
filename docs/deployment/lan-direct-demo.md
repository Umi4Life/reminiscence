# LAN Direct Demo — Homelab Host Without Traefik

Use this mode when you want to demo Queue Reminiscence from a homelab machine by opening the app containers directly on LAN ports, for example:

- Display app: `http://192.168.1.213:3000`
- Admin app: `http://192.168.1.213:3001`
- API: `http://192.168.1.213:3002`

This is intentionally different from the Traefik/HTTPS homelab deployment. Treat it like local development with a LAN IP instead of `localhost`.

## When to use this

Use LAN direct mode when:

- you are testing on a phone or another device on the same network;
- you are bypassing Traefik, nginx, Caddy, or any other reverse proxy;
- each app is reached through its own exposed port (`3000`, `3001`, `3002`).

Do **not** use this mode for production internet-facing deployment. For that, use the Traefik or published-image deployment guides and HTTPS hostnames.

## Required environment shape

Replace `192.168.1.213` with the LAN IP or hostname of the machine running the containers:

```env
PUBLIC_APP_URL=http://192.168.1.213:3000
ADMIN_APP_URL=http://192.168.1.213:3001
API_PUBLIC_BASE_URL=http://192.168.1.213:3002/api
API_ADMIN_BASE_URL=http://192.168.1.213:3002/api
PUBLIC_API_BASE_URL=http://192.168.1.213:3002/api
TRUST_PROXY=false
```

Important details:

- `PUBLIC_APP_URL` and `ADMIN_APP_URL` are the origins the API allows for CORS and session/cookie behavior.
- `API_PUBLIC_BASE_URL` and `API_ADMIN_BASE_URL` are the API's own configured public/admin API URLs.
- `PUBLIC_API_BASE_URL` is the browser-facing API URL used by the web apps.
- `TRUST_PROXY=false` because there is no trusted TLS-terminating reverse proxy in front of the API.

## The `/api` trap

Do **not** set the web apps' browser API URL to `/api` in LAN direct mode.

`PUBLIC_API_BASE_URL=/api` only works when a reverse proxy serves the web app and API from the same origin and routes `/api` to the API service. In LAN direct mode the admin app is on `:3001`, so `/api/admin/auth/login` would point at:

```text
http://192.168.1.213:3001/api/admin/auth/login
```

That is the admin-web service, not the API service. The symptom is usually a login failure or `404` for `/api/admin/...` in admin-web logs.

## Proxy flag rule

Set `TRUST_PROXY=true` only when a trusted reverse proxy terminates TLS and forwards client headers to the API.

For direct LAN HTTP ports, keep it false:

```env
TRUST_PROXY=false
```

Using proxy-mode origins while testing direct LAN ports commonly causes CORS rejection, secure-cookie mismatch, or misleading login failures.

## Quick verification

After starting or recreating the containers, verify the API accepts the admin LAN origin:

```bash
curl -i -X OPTIONS 'http://192.168.1.213:3002/api/admin/auth/login' \
  -H 'Origin: http://192.168.1.213:3001' \
  -H 'Access-Control-Request-Method: POST'
```

Expected signals:

- HTTP `204` for the preflight.
- `Access-Control-Allow-Origin: http://192.168.1.213:3001`.
- `Access-Control-Allow-Credentials: true`.

Then open `http://192.168.1.213:3001` and sign in with the configured seed/admin credentials.

## Switching back to Traefik/HTTPS

When returning to a proper homelab deployment behind Traefik:

- set `PUBLIC_APP_URL`, `ADMIN_APP_URL`, and API base URLs to HTTPS hostnames;
- use same-origin `/api` only if Traefik actually routes `/api` to the API service for that origin;
- set `TRUST_PROXY=true` only for the proxied API path;
- recreate the app containers so baked/runtime public environment values are refreshed.
