import { readFile } from "node:fs/promises";

import { Elysia } from "elysia";

const SPEC_PATH = new URL("../../openapi.yaml", import.meta.url);

const SWAGGER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Queue Reminiscence API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
<script>
  window.onload = () => {
    SwaggerUIBundle({
      url: "/api/openapi.yaml",
      dom_id: "#swagger-ui",
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
      layout: "StandaloneLayout",
      deepLinking: true,
      tryItOutEnabled: true,
      withCredentials: true,
    });
  };
</script>
</body>
</html>`;

export function docsRoutes() {
  return new Elysia({ name: "docs-routes" })
    .get("/api/openapi.yaml", async ({ set }) => {
      const spec = await readFile(SPEC_PATH, "utf-8");
      set.headers["Content-Type"] = "application/yaml";
      set.headers["Cache-Control"] = "public, max-age=300";
      return spec;
    })
    .get("/api/docs", ({ set }) => {
      set.headers["Content-Type"] = "text/html; charset=utf-8";
      return SWAGGER_HTML;
    });
}
