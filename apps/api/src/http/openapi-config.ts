// OpenAPI document metadata for `@elysia/openapi`. The path operations and
// schemas are generated from the route definitions; this module supplies the
// surrounding `info`, `servers`, `tags`, and security scheme declarations that
// used to live in the hand-maintained openapi.yaml.

import type { OpenAPIV3 } from "openapi-types";

export const API_TAGS = {
  health: "Health",
  adminAuth: "Admin Auth",
  adminOrganizations: "Admin Organizations",
  adminVenues: "Admin Venues",
  adminBoards: "Admin Boards",
  adminMemberships: "Admin Memberships",
  adminUsers: "Admin Users",
  publicAccess: "Public Access",
  publicBoards: "Public Boards",
  qr: "QR",
  display: "Display",
} as const;

// The error envelope, described inline for the one hand-written operation below.
const ERROR_ENVELOPE_SCHEMA: OpenAPIV3.SchemaObject = {
  type: "object",
  required: ["ok", "error"],
  properties: {
    ok: { type: "boolean", enum: [false] },
    error: {
      type: "object",
      required: ["code", "message"],
      properties: { code: { type: "string" }, message: { type: "string" } },
    },
  },
};

const SVG_SCHEMA: OpenAPIV3.SchemaObject = { type: "string" };

const QR_ACCESS_CODE_PARAM: OpenAPIV3.ParameterObject = {
  name: "accessCode",
  in: "path",
  required: true,
  description: "Raw board access code. The request URL ends in `.svg`.",
  schema: { type: "string" },
};

// `GET /api/qr/:accessCode.svg` cannot be auto-generated: the `@elysia/openapi`
// path parser does not emit an operation for the dotted path parameter
// (`:accessCode.svg`). Rather than change the public `.svg` URL contract, the
// operation is described here by hand and merged into the generated document.
const qrSvgPath: OpenAPIV3.PathsObject = {
  "/api/qr/{accessCode}.svg": {
    get: {
      summary: "Render QR code as SVG",
      description:
        "Generates an SVG QR code linking to the public access URL for the given access code. Returns 404 if the credential is inactive or expired.\n\nRate limit: 30 per min per IP.",
      tags: [API_TAGS.qr],
      parameters: [QR_ACCESS_CODE_PARAM],
      responses: {
        "200": {
          description: "SVG QR code document.",
          content: { "image/svg+xml": { schema: SVG_SCHEMA } },
        },
        "404": {
          description: "Access credential not found, inactive, or expired.",
          content: { "application/json": { schema: ERROR_ENVELOPE_SCHEMA } },
        },
        "429": {
          description: "Rate limit exceeded.",
          content: { "application/json": { schema: ERROR_ENVELOPE_SCHEMA } },
        },
      },
    },
  },
};

const DESCRIPTION = `Queue management API for arcade venues. Operators manage boards where
participants join and leave queues anonymously using a display name.

**Authentication surfaces**

| Surface | Mechanism |
|---------|-----------|
| Admin (operators/staff) | HttpOnly cookie \`qr_admin_session\` set by \`POST /api/admin/auth/login\` |
| Public (participants) | HttpOnly cookie \`qr_public_session\` set by \`POST /api/public/access/claim\` |
| Display devices | Opaque token in URL path — \`GET /api/display/{displayToken}/state\` |

**Response envelope**

Every JSON endpoint returns one of two shapes:

\`\`\`json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": { "code": "...", "message": "..." } }
\`\`\`

**Rate limits** are enforced per-IP and per-session. Exceeding a limit returns
\`429\` with error code \`rate_limited\`.`;

export const openApiDocumentation: Partial<OpenAPIV3.Document> = {
  info: {
    title: "Queue Reminiscence API",
    description: DESCRIPTION,
    version: "1.0.0",
    contact: { name: "Queue Reminiscence" },
    license: { name: "Private" },
  },
  servers: [
    { url: "http://localhost:3002", description: "Local development" },
    { url: "https://api.example.com", description: "Production (replace with actual URL)" },
  ],
  tags: [
    { name: API_TAGS.health, description: "Liveness and readiness probes." },
    {
      name: API_TAGS.adminAuth,
      description: "Admin session lifecycle — login, logout, and current user context.",
    },
    {
      name: API_TAGS.adminOrganizations,
      description: "List organizations accessible to the authenticated admin.",
    },
    {
      name: API_TAGS.adminVenues,
      description: "List venues accessible to the authenticated admin.",
    },
    {
      name: API_TAGS.adminBoards,
      description: "Full board CRUD and state-transition operations for admins and staff.",
    },
    {
      name: API_TAGS.adminMemberships,
      description: "Assign and revoke org-level and venue-level admin memberships.",
    },
    {
      name: API_TAGS.adminUsers,
      description: "Create, list, update, and manage admin user accounts. Super-admin only.",
    },
    {
      name: API_TAGS.publicAccess,
      description: "Claim and revoke a public mutation session via access code.",
    },
    {
      name: API_TAGS.publicBoards,
      description: "Read board state and manage queue entries as a participant.",
    },
    { name: API_TAGS.qr, description: "Render the public access QR code as SVG." },
    { name: API_TAGS.display, description: "Polling endpoint for e-ink or kiosk display devices." },
  ],
  paths: qrSvgPath,
  components: {
    securitySchemes: {
      AdminSession: {
        type: "apiKey",
        in: "cookie",
        name: "qr_admin_session",
        description:
          "Opaque session token issued by `POST /api/admin/auth/login`. HttpOnly, SameSite=Lax. Secure flag added when the API is served over HTTPS.",
      },
      PublicSession: {
        type: "apiKey",
        in: "cookie",
        name: "qr_public_session",
        description:
          "Opaque mutation session token issued by `POST /api/public/access/claim`. Required for add/remove queue entry operations. HttpOnly, SameSite=Lax.",
      },
    },
  },
};
