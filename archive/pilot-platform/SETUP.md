# HCL Pilot — SharePoint + Power Platform Setup

> ⚠️ **Archived / historical.** This folder documents an earlier PnP-based provisioning route. The
> PnP scripts (`provision-lists.ps1`, `deploy-app.ps1`, `register-pnp-app.ps1`) have been **removed**.
> The supported, shipped path is the Site Design script
> [`../../scripts/provision-via-sitedesign.ps1`](../../scripts/provision-via-sitedesign.ps1) plus a
> manual file upload — see the top-level [`SharePoint_Deployment_Steps.md`](../../SharePoint_Deployment_Steps.md).
> The notes below are kept for reference only; commands that call the removed scripts will not run.

This folder contains everything needed to stand up the **Hackathon Content Library** pilot on **SharePoint Online**, matching the blueprint (§6 content model, §7 scoring).

> The web app in `../prototype/` is both the **clickable demo** *and* the **real front end**. In the pilot it is **hosted on the SharePoint site** and reads/writes the SharePoint lists directly — no Power Apps and no new Power Platform environment required.

## Recommended path: SharePoint-hosted app (lean, portable)

The app runs as static files on the SharePoint site and talks to the lists via same-origin REST (`/_api/web/lists/...`). This keeps the stack to **just SharePoint** and makes the library **portable**: to move it to another site you re-provision the lists and re-upload the files — nothing in the code hardcodes a site URL.

```powershell
cd pilot-platform
# 1. Create the lists on the site (empty)
pwsh -File .\provision-lists.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/HackathonLibrary"
# 2. Push the app files to the site
pwsh -File .\deploy-app.ps1     -SiteUrl "https://contoso.sharepoint.com/sites/HackathonLibrary"
# 3. Open the app
#    https://contoso.sharepoint.com/sites/HackathonLibrary/SiteAssets/hcl/index.html
```

The app **auto-detects** that it is hosted in SharePoint and switches to the live lists automatically. Develop locally with `prototype/serve.ps1` (CSV/seed modes), then `deploy-app.ps1` to publish.

### Moving to a different SharePoint site (e.g. personal → org)
1. `provision-lists.ps1 -SiteUrl <new site>`
2. `deploy-app.ps1 -SiteUrl <new site>`
3. Open `<new site>/SiteAssets/hcl/index.html`.

No code changes. The only site-specific knobs live in `prototype/js/spconfig.js` (an explicit `siteUrlOverride` and a `listPrefix`), and you normally leave them blank.

> **Custom scripts:** serving a custom HTML app from a library may require an admin to allow it once per site: `Set-PnPSite -Identity <url> -NoScriptSite $false`.

---

## Alternative: Power Apps / Power BI (only if you outgrow the hosted app)
The sections below describe a Power Apps canvas app + Power Automate flows + Power BI dashboards over the **same lists**. This path **does** need a Power Platform environment and licensing. It is optional — pursue it only if you later need maker-managed forms, approval flows, or Dataverse-grade security (the §9.3 graduation triggers). The hosted app already covers capture, scoring, pipeline, and dashboards.

## Contents
| File | Purpose |
| --- | --- |
| `lists/hcl-list-schemas.json` | Column definitions for all 12 lists (aligned 1:1 with the app) |
| `provision-lists.ps1` | PnP PowerShell script that creates the lists + columns |
| `deploy-app.ps1` | Pushes the `../prototype` app files to a SharePoint library |
| `gen-seed-csv.ps1` | Regenerates the seed CSVs from the prototype JSON (demo only) |
| `seed/*.csv` | Import-ready seed data for each list (demo only) |

## Prerequisites
- A SharePoint Online site (Team or Communication site). Create one named e.g. **Hackathon Content Library**.
- Licensing: **SharePoint only** (included in M365) for the hosted app. Power Apps / Power Automate / Power BI are only needed for the optional alternative path above.
- For scripted provisioning + deploy: `Install-Module PnP.PowerShell -Scope CurrentUser` and an account with **Site Owner** rights.

## Step-by-step (Power Apps alternative — optional)

### 1. Create the site
Create a Communication site (cleaner navigation for a catalog). Note its URL, e.g. `https://contoso.sharepoint.com/sites/HackathonLibrary`.

### 2. Create the lists
**Option A — scripted (fastest):**
```powershell
cd pilot-platform
pwsh -File .\provision-lists.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/HackathonLibrary"
```
**Option B — by hand:** Use `lists/hcl-list-schemas.json` as the spec. Create each list (`HCLAgencies`, `HCLPeople`, `HCLEvents`, `HCLTeams`, `HCLPatterns`, `HCLUseCases`, `HCLCalendar`, `HCLImprovements`, `HCLFollowups`) and add the columns with the listed types/choices. Mark `indexed: true` columns as indexed (List settings → Indexed columns).

> **Create lists in this order** so lookups resolve: Agencies, People, Patterns → Events → Teams → Use Cases → Calendar, Improvements, Followups.

### 3. (Re)generate seed CSVs — optional
The `seed/` CSVs are already generated. To regenerate after editing the prototype JSON:
```powershell
pwsh -File .\gen-seed-csv.ps1
```

### 4. Import seed data
For each list: **List → Integrate → Power Automate / or** the simplest path — open the list in **Grid view**, then **Edit in grid** and paste, or use **"Import from CSV"** via Microsoft Lists. Import in the same dependency order as step 2.
- Lookup columns in the CSVs are stored as `...Id` text (e.g., `EventId`, `AgencyId`). After import, either (a) keep them as text keys for the pilot, or (b) run a short Power Automate flow to resolve them into real lookup values. For a fast demo, text keys are fine.

### 5. Production-potential band + flags
The `ProductionScore` calculated column computes the weighted 0–100 score. The **band** and **gates** (which a SharePoint calculated column can't fully express because of the owner gate) are applied in the app layer:

**Band logic (implement in Power Apps or Power BI):**
```
score = ProductionScore
band =
  IF(ScoreCompliance = 0 OR ScoreFeasibility = 0, "Not Ready",        // hard gates
     IF(score >= 70,
        IF(IsBlank(FollowupOwnerId), "Needs Incubation", "High Potential"),  // owner gate
        IF(score >= 45, "Needs Incubation", "Not Ready")))
```
**Flag chips:** No-owner (band in {High,Incubation} AND owner blank), Reusable (ScoreRepeatability=3), Compliance risk (ScoreCompliance<=1), Quick win (High AND ScoreEaseNextStep=3), Strategic bet (ScoreBusinessValue=3 AND ScorePlayFit=3).

### 6. Build the canvas app (UX)
Create a **Power Apps canvas app** connected to the lists:
- **Gallery** screens for Use Cases (with search + filter on Agency/Event/Status/Band) and Events.
- **Detail** screen with the production-assessment bars (reuse the band/flag formulas above).
- **New/Edit form** for Use Cases with the publish-gate validation (see step 7).
- **Pipeline** screen filtered to no-owner / high-potential.

### 7. Approval flow (Power Automate)
Build one flow: **When a Use Case is created or submitted (RecordStatus = "In review")** → send approval to a curator → on approve set `RecordStatus = "Published"`. Add a **publish gate**: block submission when `Status ∈ {Production candidate, Needs follow-up}` and `FollowupOwnerId` is blank (§12.3).

### 8. Dashboards (Power BI)
Connect Power BI to the lists. Build the three views from §13: **Executive** (value, high-potential pipeline, recurring blockers), **Program Manager** (data quality, no-owner alerts), **Field/CSA** (my use cases, my agency). Embed the exec report on the SharePoint home page.

### 9. Permissions (pilot — 3 roles)
- **Viewer** → SharePoint *Read* on the site.
- **Contributor** → *Contribute* (can add/edit items, not manage).
- **Curator** → *Edit/Design* on the lists + approval rights in the flow.
- Put sensitive narrative (candid production-readiness/compliance notes) in a **separate list** visible only to Curators, or use a column-restricted view. Full 8-role RBAC + column security is a graduation trigger to Dataverse (§9.3, §11.4).

## Graduating to Dataverse (later)
When you hit the §9.3 triggers (volume near thousands, true row-level security, complex relationships), recreate this model as **Dataverse tables** (the schema file maps 1:1), build a **model-driven app**, and use **solutions + pipelines** for Dev/Test/Prod ALM. The content model and scoring logic carry over unchanged.

## Validation checklist
- [ ] All 9 lists created with indexed key columns.
- [ ] Seed data imported (2 events, 12 use cases, 8 people, etc.).
- [ ] `ProductionScore` calculates; band/flags render in the app.
- [ ] No-owner alert appears for `UC-2026-MET-011`.
- [ ] Approval flow blocks publish when owner missing on a candidate.
- [ ] Exec dashboard renders on the home page.
