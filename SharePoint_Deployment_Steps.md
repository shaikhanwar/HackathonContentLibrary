# SharePoint Deployment Steps — Hackathon Content Library

Step-by-step guide to standing up the **Hackathon Content Library** on SharePoint Online. Follow it in **Dev**, then repeat verbatim in **Prod**. The guide is fully text-driven — screenshot placeholders are kept as HTML comments in the [`screenshots/`](screenshots/) subfolder; drop matching image files there and un-comment the embeds to render them inline.

> All URLs use the placeholder tenant **`contoso`** and site **`HackathonContentLibrary`** — replace both with your own.
>
> Background reference (no PnP, manual portal path): [`archive/pilot-platform/MANUAL-SETUP-RUNBOOK.md`](archive/pilot-platform/MANUAL-SETUP-RUNBOOK.md). The authoritative list schema is [`archive/pilot-platform/lists/hcl-list-schemas.json`](archive/pilot-platform/lists/hcl-list-schemas.json).

---

## Environment tracker

| Item | Dev | Prod |
|---|---|---|
| Tenant | `contoso` | |
| SharePoint Admin URL | `https://contoso-admin.sharepoint.com` | |
| Target site URL | `https://contoso.sharepoint.com/sites/HackathonContentLibrary` | |
| Site template | Communication site → **Blank** | |
| Site owner | Anwar Shaikh | |
| Language / Time zone | English / (UTC-05:00) Eastern | |
| App URL (after deploy) | `<site>/SiteAssets/hcl/index.aspx` | |
| Custom script allowed? | ☐ | ☐ |
| Lists created (12)? | ☐ | ☐ |
| Versioning enabled? | ☐ | ☐ |
| App files uploaded? | ☐ | ☐ |
| Auto-detect verified? | ☐ | ☐ |

> ⚠️ **The app page is `index.aspx`, not `index.html`.** On most tenants a raw `.html` file in a library **downloads instead of rendering** (strict browser file handling). The app is shipped as `index.aspx`, which renders inline through the SharePoint page pipeline. See [§5](#5--deploy-the-app-files-siteassetshcl).

---

## §1 — Create the site ✅

**Where:** SharePoint admin center → `https://contoso-admin.sharepoint.com`

1. Left nav **Sites → Active sites** → click **+ Create**.

   <!-- ![Active sites list with + Create](screenshots/01-active-sites-create.png) -->
2. **Select the site type** → choose **Communication site** (cleaner navigation for a catalog; Team site also works).

   <!-- ![Create a site: select the site type](screenshots/02-select-site-type.png) -->
3. **Select a template** → choose **Blank** (start from a blank canvas — no sample content to clean up).

   <!-- ![Select a template gallery](screenshots/03-select-template.png) -->
4. On **Preview and use 'Blank' template** → click **Use template**.

   <!-- ![Preview and use Blank template](screenshots/04-blank-template-preview.png) -->
5. **Give your site a name:**
   - **Site name:** `Hackathon Content Library`
   - **Site description:** `SLED AI Hackathon Content Library`
   - **Site address:** `HackathonContentLibrary` → resolves to `https://contoso.sharepoint.com/sites/HackathonContentLibrary` ("The site address is available.")
   - **Site owner:** `Anwar Shaikh`
   - Click **Next**.

   <!-- ![Give your site a name](screenshots/05-site-name.png) -->
6. **Set language and other options:**
   - **Language:** English (cannot be changed later)
   - **Time zone:** (UTC-05:00) Eastern Time (US and Canada)
   - Click **Create site**.

   <!-- ![Set language and other options](screenshots/06-language-timezone.png) -->
7. Back on **Active sites**, confirm **Hackathon Content Library** appears with URL `.../sites/HackathonContentLibrary` and primary admin **Anwar Shaikh**.

   <!-- ![Active sites showing new site](screenshots/07-active-sites-confirm.png) -->
8. Open the site to confirm it renders (blank Communication site home, "Published on 6/16/2026").

   <!-- ![New blank site home page](screenshots/08-site-home.png) -->
**Result:** Site live at `https://contoso.sharepoint.com/sites/HackathonContentLibrary`.

---

## §2 — Allow custom scripts (one-time, admin) ✅

Serving the custom HTML/JS app from a library requires custom scripts to be allowed on the site. This is an admin action and can take up to ~24h to propagate (usually minutes).

1. **SharePoint admin center** → **Sites → Active sites** → click **Hackathon Content Library** to open the site flyout (General tab).

   <!-- ![Site flyout General tab](screenshots/09-site-flyout-general.png) -->
2. Open the **Settings** tab. Under **Custom scripts** it initially shows **Blocked** → click **Edit**.

   <!-- ![Settings tab showing Custom scripts: Blocked](screenshots/10-settings-custom-scripts-blocked.png) -->
3. In the **Custom scripts** panel, change the setting from **Blocked** to **Allowed**.

   <!-- ![Custom scripts panel - Blocked selected](screenshots/11-custom-scripts-panel.png) -->
   <!-- ![Custom scripts panel - Allowed selected](screenshots/12-custom-scripts-allowed.png) -->
4. Click **Save** → on **"Allow users to add custom scripts?"** click **Confirm**.

   <!-- ![Allow custom scripts confirmation](screenshots/13-allow-custom-scripts-confirm.png) -->
### ⚠️ 24-hour auto-revert — important

The portal explicitly warns: **"When you set the custom scripts setting to Allowed, it will automatically switch back to Blocked within 24 hours."** In practice the **portal toggle is unreliable** for hosting a static app — the page may still **download instead of render**. The **authoritative, repeatable fix is PowerShell** (`DenyAddAndCustomizePages = $false`), which persists and does not auto-revert.

### §2b — Permanent fix via PowerShell (REQUIRED for the app to render)

This is the step that makes `…/SiteAssets/hcl/index.aspx` actually render in the browser instead of downloading. Run it once per environment (Dev, then Prod). Use a **tenant SharePoint admin** account.

**One-time, per machine — install the SharePoint Online Management Shell:**
```powershell
Install-Module Microsoft.Online.SharePoint.PowerShell -Scope CurrentUser -Force -AllowClobber
```
> On PowerShell 7 (`pwsh`) this module loads through the Windows-PowerShell compatibility layer automatically. If a cmdlet is "not recognized", run the commands in **Windows PowerShell 5.1** (`powershell.exe`) instead, or import with `Import-Module Microsoft.Online.SharePoint.PowerShell -UseWindowsPowerShell`.

**Each time — connect, set the flag, verify:**
```powershell
# 1) Connect to the tenant admin center (opens a browser sign-in)
Connect-SPOService -Url https://contoso-admin.sharepoint.com

# 2) Allow custom scripts permanently on the site
Set-SPOSite -Identity "https://contoso.sharepoint.com/sites/HackathonContentLibrary" -DenyAddAndCustomizePages $false

# 3) Confirm it took (expect: DenyAddAndCustomizePages : Disabled  -> custom scripts allowed)
Get-SPOSite -Identity "https://contoso.sharepoint.com/sites/HackathonContentLibrary" | Select-Object Url, DenyAddAndCustomizePages | Format-List
```

> **Read the result correctly:** `DenyAddAndCustomizePages : Disabled` (or `False`) means the *deny* is **off**, i.e. custom scripts **are allowed** — this is the state you want. `Enabled`/`True` means scripts are blocked.
>
> ⚠️ Run the commands in a **real PowerShell window** (not wrapped inside `powershell.exe -Command "…$false…"`, where `$false` can be coerced to the string `"False"` and throw a type error). In a normal session `-DenyAddAndCustomizePages $false` binds correctly.
>
> ⏳ **Propagation:** after the flag flips, allow a few minutes before the page stops downloading and starts rendering. Hard-refresh (Ctrl+F5) or use a fresh private window each retry.

> **Prod:** replace both URLs with the Prod admin URL (`https://<tenant>-admin.sharepoint.com`) and the Prod site URL. Nothing else changes.

After it reports **False/Disabled**, hard-refresh the app URL (Ctrl+F5) or use a private window. Allow a few minutes to propagate. The page should now render.

```powershell
# Portal-only alternative (temporary; auto-reverts in 24h — not recommended for the host site):
#   Admin center → Sites → Active sites → site → Settings → Custom scripts → Allowed → Save → Confirm
```

> Without this flag set to **False**, the app page downloads instead of rendering, or scripts get stripped.

**Result:** Custom scripts permanently allowed on the site via `DenyAddAndCustomizePages = $false`.

---

## §4 — Create the 12 lists + columns ✅

All 12 lists are provisioned by a single PowerShell script — [`scripts/provision-via-sitedesign.ps1`](scripts/provision-via-sitedesign.ps1) — which declares every column with its **exact internal name** via SharePoint **Site Designs / Site Scripts**. No browser console, no PnP, no Entra app registration.

> The authoritative schema [`archive/pilot-platform/lists/hcl-list-schemas.json`](archive/pilot-platform/lists/hcl-list-schemas.json) defines **12 lists**. All columns are **Text** (single line) or **Note** (multiple lines, plain text) because the app stores every value as a string.

### ⚠️ Why NOT "Import from CSV" (the previous method)

The lists were first built with **Import from CSV**, which is fast but has a fatal flaw: it does **not** let you control a column's **internal name**. The app's REST calls address columns by internal name (e.g. `?$select=AgencyId`), so SharePoint replies `field 'AgencyId' does not exist` (HTTP 400) and **every save silently fails**. The CSV-import procedure (and its preview screenshots) has been retired — do **not** use it for this app.

### Method: PowerShell Site Design (REQUIRED)

The script declares each column as Field XML (`<Field Name='AgencyId' .../>`), registers it as a Site Script + Site Design, and applies it to the site. Site Designs are Microsoft's supported, repeatable provisioning model — ideal for Dev → Prod with zero app setup. Columns are applied in small chunks automatically (SharePoint caps actions per design apply), and `createSPList` is idempotent so re-running is safe.

**Prerequisites** (same as §2b — you already have these):
- PowerShell 7 (`pwsh`) or Windows PowerShell 5.1.
- `Microsoft.Online.SharePoint.PowerShell` installed (`Install-Module Microsoft.Online.SharePoint.PowerShell -Scope CurrentUser -Force`).
- A SharePoint/tenant **admin** account.

**Clean vs. repair-in-place** — Site Designs are *additive* (`createSPList` adds correctly-named columns but does not remove old ones):
- **Clean (recommended in Dev):** first delete the existing 12 lists in the browser (**Site contents → each list → Delete** — they are empty, nothing is lost), then run the script for brand-new lists with correct columns only.
- **Repair-in-place (e.g. Prod with data):** just run the script. It adds the correct columns alongside any existing ones; the app works immediately. Tidy up stray columns later from list settings if desired.

**Run it (Dev shown — swap both URLs for Prod):**
```powershell
# 1) From the repo root, run the provisioning script.
#    -AdminUrl is auto-derived from -SiteUrl, so it is optional.
pwsh -File .\scripts\provision-via-sitedesign.ps1 `
     -SiteUrl  "https://contoso.sharepoint.com/sites/HackathonContentLibrary" `
     -AdminUrl "https://contoso-admin.sharepoint.com"

# If the site is a Team site (not Communication), add:  -WebTemplate 64
```

A browser sign-in opens for `Connect-SPOService`. The script then loops the 12 lists, applying one small site design per column chunk, and prints a summary:

```
Lists OK: 12 | failed: 0
```

**Verify in the browser** — open **Site contents** and confirm all 12 `HCL*` lists are present:

<!-- ![Site contents showing the 12 HCL lists created by the provisioning script](screenshots/14-site-contents-12-lists.png) -->
> 📸 **Optional screenshot:** to illustrate this step, save a "Site contents — 12 lists" capture to `screenshots/14-site-contents-12-lists.png` and un-comment the embed above.

> **`Created` / `Modified` are intentionally omitted** as custom columns. Those are reserved SharePoint field names; creating custom columns with them makes SharePoint assign a *different* internal name, breaking the app's mapping. The app reads SharePoint's **native** Created/Modified instead. `CreatedBy` / `ModifiedBy` are safe and **are** provisioned.

> **Indexes:** after provisioning, add indexes for each list's key columns (see the *Indexed* column in the per-list tables below): **List Settings → Indexed columns → Create a new index**. Safe to skip in Dev; do it in Prod.

#### Fallback: manual column creation
If you ever build a list by hand: **+ Add column** → type → exact internal name → Save. **Text** = "Single line of text"; **Note** = "Multiple lines of text" (uncheck *Use enhanced rich text*). Internal names are fixed at creation — type them **exactly** as in the per-list tables below.

### List-creation tracker

| # | List (internal name) | Cols | Created? | Indexed? |
|---|---|---|---|---|
| 1 | `HCLAgencies` | 19 | ☐ | ☐ |
| 2 | `HCLPeople` | 9 | ☐ | ☐ |
| 3 | `HCLEvents` | 42 | ☐ | ☐ |
| 4 | `HCLTeams` | 9 | ☐ | ☐ |
| 5 | `HCLUseCases` | 50 | ☐ | ☐ |
| 6 | `HCLPatterns` | 7 | ☐ | ☐ |
| 7 | `HCLAccelerators` | 5 | ☐ | ☐ |
| 8 | `HCLCalendar` | 20 | ☐ | ☐ |
| 9 | `HCLImprovements` | 11 | ☐ | ☐ |
| 10 | `HCLFollowups` | 10 | ☐ | ☐ |
| 11 | `HCLWinners` | 6 | ☐ | ☐ |
| 12 | `HCLAuditLog` | 9 | ☐ | ☐ |

> Column counts include the built-in **Title**. "Indexed?" = the ✅ columns in each table have a list index created.

### 4.1 `HCLAgencies`
> CSV: [`lists/HCLAgencies.csv`](lists/HCLAgencies.csv). `Created`/`Modified` are omitted (native fields used). Multi-line columns: _(none)_.
| Column | Type | Indexed |
|---|---|---|
| Title | (built-in) | |
| AgencyId | Text | ✅ |
| ShortName | Text | |
| AgencyType | Text | |
| Region | Text | |
| Jurisdiction | Text | |
| Domain | Text | |
| DMFirstName | Text | |
| DMLastName | Text | |
| DMJobTitle | Text | |
| DMRole | Text | |
| DMEmail | Text | |
| DMCountry | Text | |
| DMBusinessPhone | Text | |
| RecordStatus | Text | |
| CreatedBy | Text | |
| Created | Text | |
| ModifiedBy | Text | |
| Modified | Text | |

### 4.2 `HCLPeople`
| Column | Type | Indexed |
|---|---|---|
| Title | (built-in) | |
| PersonId | Text | ✅ |
| Email | Text | |
| PrimaryOrg | Text | |
| RoleTitle | Text | |
| HackathonRoles | Note | |
| SolutionAreas | Note | |
| ChampionCapability | Note | |
| Active | Text | |

### 4.3 `HCLEvents`
| Column | Type | Indexed |
|---|---|---|
| Title | (built-in) | |
| EventId | Text | ✅ |
| StartDate | Text | ✅ |
| EndDate | Text | |
| Location | Text | |
| Format | Text | |
| HostingTeam | Text | |
| HostId | Text | |
| LeadSpeakerId | Text | |
| OrganizerIds | Note | |
| TechnicalSupportTeam | Note | |
| PartnerOrgs | Note | |
| NumTeams | Text | |
| NumParticipants | Text | |
| NumSupportStaff | Text | |
| AgencyMix | Note | |
| Themes | Note | |
| AgendaSummary | Note | |
| DemoDetails | Note | |
| WinnerUseCaseIds | Note | |
| FollowupPlanned | Text | |
| Outcomes | Note | |
| LessonsLearned | Note | |
| RetroWhatWorkedWell | Note | |
| RetroTrackFeedback | Note | |
| RetroContentFlow | Note | |
| RetroTechnicalSetup | Note | |
| RetroCoachingModel | Note | |
| RetroDemosJudging | Note | |
| RetroLogisticsOps | Note | |
| RetroTeamCoordination | Note | |
| RetroCustomerRelevance | Note | |
| RetroNextSteps | Note | |
| RecordStatus | Text | |
| EventStatus | Text | |
| RegistrationUrl | Text | |
| Notes | Note | |
| CalendarId | Text | |
| CreatedBy | Text | |
| Created | Text | |
| ModifiedBy | Text | |
| Modified | Text | |

### 4.4 `HCLTeams`
| Column | Type | Indexed |
|---|---|---|
| Title | (built-in) | |
| TeamId | Text | ✅ |
| EventId | Text | ✅ |
| AgencyId | Text | |
| Participants | Note | |
| AssignedCSAs | Note | |
| ManagerId | Text | |
| SupportIds | Note | |
| UseCaseIds | Note | |

### 4.5 `HCLUseCases`
| Column | Type | Indexed |
|---|---|---|
| Title | (built-in) | |
| UseCaseId | Text | ✅ |
| EventId | Text | ✅ |
| AgencyId | Text | ✅ |
| TeamId | Text | |
| BusinessProblem | Note | |
| CurrentProcess | Note | |
| ChallengeSummary | Note | |
| ProposedSolution | Note | |
| Components | Note | |
| CopilotRole | Text | |
| Services | Note | |
| InPipeline | Text | |
| BusinessValue | Note | |
| EstimatedImpact | Text | |
| ImpactMetric | Text | |
| Beneficiaries | Note | |
| Risks | Note | |
| DataDependencies | Note | |
| Compliance | Note | |
| Feasibility | Text | |
| Reusability | Text | |
| Industries | Note | |
| PatternId | Text | |
| AssignedCSAs | Note | |
| SupportTeams | Note | |
| ExecSponsorId | Text | |
| NextStep | Note | |
| OwnerName | Text | |
| OwnerEmail | Text | |
| ChampionApps | Text | |
| ChampionDataAI | Text | |
| DemoUrl | Text | |
| RepoUrl | Text | |
| Lessons | Note | |
| ScoreRealProblem | Text | |
| ScoreBusinessValue | Text | |
| ScoreAiTools | Text | |
| ScoreFeasibility | Text | |
| ScoreDemo | Text | |
| ScoreUi | Text | |
| ScoreRepeatability | Text | |
| ScorePlayFit | Text | |
| ScoreCompliance | Text | |
| RecordStatus | Text | |
| CreatedBy | Text | |
| Created | Text | |
| ModifiedBy | Text | |
| Modified | Text | |

> `Score*` columns are plain **Text** holding `0`–`3`; the band is computed in the browser (`prototype/js/scoring.js`).

### 4.6 `HCLPatterns`
| Column | Type | Indexed |
|---|---|---|
| Title | (built-in) | |
| PatternId | Text | ✅ |
| Summary | Note | |
| Repeatability | Text | |
| SolutionPlay | Text | |
| Components | Note | |
| AcceleratorIds | Note | |

### 4.7 `HCLAccelerators`
| Column | Type | Indexed |
|---|---|---|
| Title | (built-in) | |
| AcceleratorId | Text | ✅ |
| AcceleratorType | Text | |
| PatternId | Text | |
| Url | Text | |

### 4.8 `HCLCalendar`
| Column | Type | Indexed |
|---|---|---|
| Title | (built-in) | |
| CalendarId | Text | ✅ |
| StartDate | Text | ✅ |
| EndDate | Text | |
| EventStatus | Text | |
| Format | Text | |
| Location | Text | |
| Themes | Note | |
| FocusAgencies | Note | |
| HostId | Text | |
| TechnicalSupportTeam | Note | |
| PartnerOrgs | Note | |
| OrganizerIds | Note | |
| RegistrationUrl | Text | |
| Notes | Note | |
| ManagedEventId | Text | |
| CreatedBy | Text | |
| Created | Text | |
| ModifiedBy | Text | |
| Modified | Text | |

### 4.9 `HCLImprovements`
| Column | Type | Indexed |
|---|---|---|
| Title | (built-in) | |
| ImprovementId | Text | ✅ |
| ItemType | Text | |
| Category | Text | |
| EventId | Text | |
| UseCaseId | Text | |
| Description | Note | |
| Severity | Text | |
| SuggestedAction | Note | |
| ItemStatus | Text | |
| OwnerId | Text | |

### 4.10 `HCLFollowups`
| Column | Type | Indexed |
|---|---|---|
| Title | (built-in) | |
| FollowupId | Text | ✅ |
| UseCaseId | Text | ✅ |
| NextStep | Note | |
| OwnerId | Text | |
| DueDate | Text | |
| MotionType | Text | |
| FollowupStatus | Text | |
| ChampionIds | Note | |
| OutcomeNotes | Note | |

### 4.11 `HCLWinners`
| Column | Type | Indexed |
|---|---|---|
| Title | (built-in) | |
| WinnerId | Text | ✅ |
| EventId | Text | ✅ |
| UseCaseId | Text | |
| Place | Text | |
| Rationale | Note | |

### 4.12 `HCLAuditLog`
| Column | Type | Indexed |
|---|---|---|
| Title | (built-in) | |
| AuditId | Text | ✅ |
| RecordId | Text | ✅ |
| RecordType | Text | |
| RecordTitle | Text | |
| Action | Text | |
| Summary | Note | |
| By | Text | |
| At | Text | |

## §3 — Enable versioning
_Do for each key list._ Open the list → **Settings (gear) → List settings → Versioning settings** → **Create a version each time you edit an item in this list = Yes** (optionally cap **Keep the following number of major versions** at **50**) → **OK**.

Apply at minimum to: `HCLAgencies`, `HCLEvents`, `HCLUseCases`, `HCLCalendar`, `HCLTeams`. The rest are fine to enable too.

> Newer list UI: **Settings (gear) → List settings → More library settings**, or directly **List settings → Versioning settings**. If you only see the modern pane, use the **gear → List settings** link at the bottom.

## §5 — Deploy the app files (SiteAssets/hcl)

The entire app to deploy lives in the repo's [`app/`](app/) folder: `index.aspx`, the `css/` folder, and the `js/` folder. Upload **exactly** those — SharePoint is the backend now.

> ### ⚠️ Why `index.aspx` and not `index.html`
> On most tenants, a raw `.html` file served from a document library is sent with `Content-Disposition: attachment`, so the browser **downloads** it instead of rendering it (the tenant-wide "permissive browser file handling" override that used to fix this has been **retired** by Microsoft). The app is therefore shipped as **`index.aspx`**, which renders inline through the SharePoint page pipeline. The file contents are identical to a normal HTML page; only the extension matters. (A `.html` copy is included for **local development only**.)

1. Site → **Site contents** → open **Site Assets** (default document library; create one named **Site Assets** if missing).
2. Create a folder inside it named **`hcl`**.
3. Open `hcl` → **Upload → Files** → select [`app/index.aspx`](app/index.aspx).
4. **Upload → Folder** → select `app/css`, then again for `app/js` (keeps structure). If folder upload is blocked, create `css` and `js` subfolders manually and upload the files into each.
5. Final structure:
   ```
   SiteAssets/hcl/index.aspx
   SiteAssets/hcl/css/styles.css
   SiteAssets/hcl/js/*.js
   ```

> ### 🔑 Upload all JS together
> The JavaScript files are ES modules that import one another. If you change one and re-upload only that file, the app hangs on **"Loading library…"**. **Always upload the whole `js/` folder as a set.**

> 🛠️ **Code prerequisites baked into `app/js` (already done in the repo):**
> - `js/sharepointstore.js` — drops the read-only `Created`/`Modified` built-in fields before writing, so saves to Agencies/Events/UseCases/Calendar don't 400.
> - `js/spconfig.js` — derives the site URL from the page path (trims at the hosting library) and treats any `*.sharepoint.com` host as SharePoint mode, so REST calls hit `…/sites/HackathonContentLibrary` and not the tenant root. Localhost dev is unaffected.

> ⚠️ Reminder: custom scripts (§2) auto-revert to Blocked within ~24h. If the page suddenly returns **"Sorry, something went wrong — File Not Found"** even though the files are present, the custom-script flag has reverted — re-run `Set-SPOSite -DenyAddAndCustomizePages $false` (§2b) and wait a few minutes.

## §6 — Verify

1. Browse to `…/SiteAssets/hcl/index.aspx`. The app should render (not download). Hard-refresh (Ctrl+F5) or use a private window if it was recently uploaded.
2. Confirm the top navigation loads and the **Home** dashboard shows KPI tiles. If it sticks on **"Loading library…"**, re-upload the **entire** `js/` folder (see the JS note in §5).
3. **Write-path test:** **+ Register → Register an Agency → Save**, then open the **HCLAgencies** list in **Site contents** and confirm the new item appears. A successful save with no red error banner confirms the REST write path and column mapping are correct.
4. Open **F12 → Console** and confirm there are no red `_api` / 400 / 404 errors.

## §7 — Permissions (optional)

Assign SharePoint permission levels to your audience as needed (Read for viewers, Edit/Contribute for curators). The app itself does not enforce roles beyond the admin gate in §7.1; standard SharePoint list permissions apply to all reads and writes.

### §7.1 — Create the `HCL Admins` group (gates permanent delete)

The app lets anyone with edit rights **archive** a record (soft delete — hidden from the catalog, recoverable from the **Audit** page). The **permanent delete** action is reserved for admins. The app decides who is an admin from the **live site**, not a URL flag: a user qualifies if they are a **site collection administrator** _or_ a member of a SharePoint group named **`HCL Admins`** (configurable in `js/spconfig.js` → `SP_CONFIG.adminGroup`).

Create the group once per environment (Dev, then Prod) and add your curators:

1. Open the site → **Settings (gear) → Site permissions → Advanced permissions settings** (or browse to `…/_layouts/15/user.aspx`).
2. **Create Group** → Name it exactly **`HCL Admins`** → set **Permission level = Edit** (or Contribute; the group is used for app-level admin identity, not extra SharePoint rights) → **Create**.
3. **New → Add Users** → add the curators who should be allowed to permanently delete → **Share**.

> **How the check works at runtime:** the app calls `…/_api/web/currentuser?$select=IsSiteAdmin` and `…/_api/web/currentuser/groups`. Site collection admins always qualify; everyone else must appear in **`HCL Admins`**. The check **fails closed** — on any error the user is treated as non-admin, so a transient failure never grants delete rights.
>
> If you skip this section, **only site collection administrators** can permanently delete. Everyone else can still archive/restore — nothing breaks.
>
> The name must match `SP_CONFIG.adminGroup` in `js/spconfig.js` (default `HCL Admins`). To use an existing group, change that value and re-upload `spconfig.js` instead of creating a new group.
>
> **Prod:** repeat against the Prod site URL.

**Result:** `HCL Admins` group exists with curators added; permanent-delete controls appear in the app only for site admins and members of this group.

