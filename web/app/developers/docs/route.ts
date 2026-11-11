// API reference, served as a standalone HTML page (not a React page) so Scalar can
// own the DOM without fighting React hydration. It renders the SAME OpenAPI spec the
// Go service generates from its handler annotations (`/swagger/doc.json`), so the docs
// can never drift from the API. Scalar is loaded from jsDelivr, pinned to a version.
//
// A route.ts can't sit next to a page.tsx in the same segment — so /developers/docs is
// this handler, and the portal's other screens are pages. See web/ARCHITECTURE.md §8.

export const dynamic = "force-static";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://khoj-ibli.onrender.com";
const SPEC_URL = `${API_BASE}/swagger/doc.json`;
const SCALAR = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.48.0/dist/browser/standalone.js";

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Khoj API — Reference</title>
  <style>
    body { margin: 0; }
    .khoj-back {
      position: fixed; top: 12px; left: 12px; z-index: 2147483647;
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px; border-radius: 10px;
      font: 500 13px/1 ui-sans-serif, system-ui, sans-serif;
      color: #fff; background: #ea4e1b; text-decoration: none;
      box-shadow: 0 1px 4px rgba(0,0,0,.2);
    }
  </style>
</head>
<body>
  <a class="khoj-back" href="/developers">← Khoj Developers</a>
  <script
    id="api-reference"
    data-url="${SPEC_URL}"
    data-configuration='${JSON.stringify({ theme: "default", hideClientButton: false, metaData: { title: "Khoj API Reference" } })}'
  ></script>
  <script src="${SCALAR}"></script>
</body>
</html>`;

export async function GET() {
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
