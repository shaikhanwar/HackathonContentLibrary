# app/ — deployable SharePoint app (upload source)

These are the **exact files to upload** to `SiteAssets/hcl` on the SharePoint site (see [`../SharePoint_Deployment_Steps.md`](../SharePoint_Deployment_Steps.md) §5). This is a self-contained copy of the static SPA — nothing else from the original `prototype/` is needed at runtime.

```
app/index.aspx         ->  SiteAssets/hcl/index.aspx
app/css/styles.css      ->  SiteAssets/hcl/css/styles.css
app/js/*.js             ->  SiteAssets/hcl/js/*.js
```

## What's included (and why)
| File | Purpose |
|---|---|
| `index.aspx` | App shell / entry point (renders inline on SharePoint) |
| `css/styles.css` | Styles |
| `js/app.js` | UI, routing, rendering |
| `js/data.js` | Data-mode selection (seed / csv / sharepoint) |
| `js/factory.js` | Canonical record shapes (single source of truth) |
| `js/scoring.js` | Production-potential band (computed client-side) |
| `js/csvstore.js` | db ⇄ column-row mapping (shared with SharePoint store) |
| `js/sharepointstore.js` | SharePoint REST read/write (strips read-only Created/Modified) |
| `js/spconfig.js` | Site-URL + SharePoint-mode resolution (works for static hosting) |
| `js/selftest.js`, `js/csvtest.js` | In-app self-tests (harmless in prod) |

## Deployment-critical fixes already baked in
- **`sharepointstore.js`** drops the read-only `Created` / `Modified` built-in fields before writing, so saves don't return HTTP 400.
- **`spconfig.js`** treats any `*.sharepoint.com` host as SharePoint mode and derives the site URL from the path (trims at `/SiteAssets/`), so the static `index.aspx` (which gets no `_spPageContextInfo`) still targets `…/sites/HackathonContentLibrary` correctly.
- **`index.aspx`, not `index.html`** — a raw `.html` file in a SharePoint library downloads instead of rendering on most tenants. The app ships as `index.aspx`, which renders inline through the page pipeline.

## Keeping this in sync
This folder is a copy of `../archive/prototype/{css,js}` plus the SharePoint entry page `index.aspx`. If those source files change, re-copy them here before re-uploading.
