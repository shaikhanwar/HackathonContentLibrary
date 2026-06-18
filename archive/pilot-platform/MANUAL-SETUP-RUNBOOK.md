# HCL Pilot — Manual Setup Runbook (Portal / No-Script)

**Purpose:** Stand up the Hackathon Content Library on SharePoint Online entirely by hand (browser + admin portals), with no PnP PowerShell. Follow it in **Dev** now; repeat the same steps in **Prod** later.

**App being deployed:** the static SPA in [`../prototype`](../prototype) (`index.html`, `css/`, `js/`). It auto-detects SharePoint hosting and reads/writes the lists below via same-origin REST. No Power Apps / Power Automate / Power BI required.

**Authoritative schema:** [`lists/hcl-list-schemas.json`](lists/hcl-list-schemas.json). The tables in §4 mirror it. If the two ever disagree, the JSON wins.

---

## 0. Environment tracker (fill in per environment)

| Item | Dev | Prod |
|---|---|---|
| Tenant | `contoso` | |
| SharePoint Admin URL | `https://contoso-admin.sharepoint.com` | |
| Target site URL | `https://contoso.sharepoint.com/sites/HackathonLibrary` (recommended) | |
| App URL (after deploy) | `<site>/SiteAssets/hcl/index.html` | |
| Custom script allowed? | ☐ | ☐ |
| Lists created (13)? | ☐ | ☐ |
| Versioning enabled? | ☐ | ☐ |
| App files uploaded? | ☐ | ☐ |
| Auto-detect verified? | ☐ | ☐ |

> The docs sometimes use the root site `https://contoso.sharepoint.com`. A **dedicated site** (`/sites/HackathonLibrary`) is strongly recommended so the library is self-contained and portable.

---

## 1. Create the site

1. Go to **https://contoso-admin.sharepoint.com** → **Sites** → **Active sites** → **+ Create**.
2. Choose **Communication site** (cleaner navigation for a catalog) — or Team site if you prefer.
3. **Site name:** `Hackathon Content Library`. Confirm the URL becomes `…/sites/HackathonLibrary` (adjust if taken).
4. Set yourself as **owner**. Finish.
5. Record the site URL in the §0 tracker.

---

## 2. Allow custom scripts on the site (one-time, admin)

Serving a custom HTML/JS app from a library requires custom scripts to be allowed. This is an admin action and can take up to ~24h to propagate (usually minutes).

**Portal route:**
1. **SharePoint admin center** → **Sites** → **Active sites** → click the **Hackathon Content Library** site.
2. **Settings** tab (or **…** → **Edit**) → find **Custom scripts** → set **Allow users to run custom script on this site** to **Allow**.

**If the portal toggle isn't visible**, an admin runs this once (the only PowerShell in the manual path; skip if you keep it fully portal-based and the toggle exists):
```powershell
Set-SPOSite -Identity "https://contoso.sharepoint.com/sites/HackathonLibrary" -DenyAddAndCustomizePages 0
```

> Without this, `index.html` may download instead of render, or scripts are stripped.

---

## 3. Enable versioning (auditing)

Do this for each list **after** you create it in §4 (or set it once here and repeat per list):

- List → **Settings (gear)** → **List settings** → **Versioning settings** → **Create a version each time you edit an item in this list = Yes**. Optionally cap at **50** major versions.

Apply at minimum to: `HCLAgencies`, `HCLEvents`, `HCLUseCases`, `HCLCalendar`, `HCLTeams` (the rest are fine too).

---

## 4. Create the 13 lists + columns

For **each** list below:

1. Site → **+ New** → **List** → **Blank list**.
2. **Name** = the **internal name** in the heading (e.g. `HCLAgencies`). Type it exactly — no spaces — so the URL/internal name matches what the app expects. You can set a friendlier **Display name** afterwards in List settings if you like; the app keys off the list’s internal name.
3. Every list already has the built-in **Title** column — keep it (do **not** delete or rename it).
4. Add each column in the table using **+ Add column** → choose the **Column type**, set the **name exactly** (case-sensitive, no spaces), then **Save**.
   - **Text** → "Single line of text"
   - **Note** → "Multiple lines of text" (plain text, not rich)
5. For columns marked **Indexed**, after creating them: List **Settings** → **Indexed columns** → **Create a new index** → pick the column. (Indexing only matters for performance; safe to skip in Dev.)

> ⚠️ Column **internal names must match exactly** (e.g. `AgencyId`, `ScoreBusinessValue`). SharePoint derives the internal name from the name you first type, so **type the exact name on creation**. If you rename later, the internal name does **not** change — so get it right the first time, or create with the right name.
>
> 💡 Faster bulk entry: open the list → **+ Add column** → **Show/hide columns** won’t create new ones, but the grid **"+"** at the far right of the header lets you add several quickly. For long lists (Events, Use Cases) consider the optional scripted accelerator in §8 instead of hand-typing ~40 columns.

### 4.1 `HCLAgencies`
| Column | Type | Indexed | Notes |
|---|---|---|---|
| Title | (built-in) | | Agency name |
| AgencyId | Text | ✅ | |
| ShortName | Text | | |
| AgencyType | Text | | City \| County \| State \| Regional \| Federal |
| Region | Text | | |
| Jurisdiction | Text | | |
| Domain | Text | | |
| DMFirstName | Text | | Decision maker first name |
| DMLastName | Text | | |
| DMJobTitle | Text | | |
| DMRole | Text | | |
| DMEmail | Text | | |
| DMCountry | Text | | |
| DMBusinessPhone | Text | | |
| RecordStatus | Text | | Draft \| Published \| Archived |
| CreatedBy | Text | | |
| Created | Text | | |
| ModifiedBy | Text | | |
| Modified | Text | | |

### 4.2 `HCLPeople`
| Column | Type | Indexed | Notes |
|---|---|---|---|
| Title | (built-in) | | Full name |
| PersonId | Text | ✅ | |
| Email | Text | | |
| PrimaryOrg | Text | | CSA \| ATU \| STU \| CSU \| Specialist \| Field \| Agency |
| RoleTitle | Text | | |
| HackathonRoles | Note | | Semicolon-joined |
| SolutionAreas | Note | | Semicolon-joined |
| ChampionCapability | Note | | Semicolon-joined |
| Active | Text | | true \| false |

### 4.3 `HCLEvents`
| Column | Type | Indexed | Notes |
|---|---|---|---|
| Title | (built-in) | | Event name |
| EventId | Text | ✅ | |
| StartDate | Text | ✅ | YYYY-MM-DD |
| EndDate | Text | | YYYY-MM-DD |
| Location | Text | | |
| Format | Text | | In-person \| Virtual \| Hybrid |
| HostingTeam | Text | | |
| HostId | Text | | PersonId of host |
| LeadSpeakerId | Text | | PersonId of lead speaker |
| OrganizerIds | Note | | One per line: `First Last <email>` |
| TechnicalSupportTeam | Note | | One per line: `First Last <email>` |
| PartnerOrgs | Note | | |
| NumTeams | Text | | |
| NumParticipants | Text | | |
| NumSupportStaff | Text | | |
| AgencyMix | Note | | Agency ids, semicolon-joined |
| Themes | Note | | Semicolon-joined |
| AgendaSummary | Note | | |
| DemoDetails | Note | | |
| WinnerUseCaseIds | Note | | Semicolon-joined use case ids |
| FollowupPlanned | Text | | true \| false |
| Outcomes | Note | | |
| LessonsLearned | Note | | |
| RetroWhatWorkedWell | Note | | |
| RetroTrackFeedback | Note | | |
| RetroContentFlow | Note | | |
| RetroTechnicalSetup | Note | | |
| RetroCoachingModel | Note | | |
| RetroDemosJudging | Note | | |
| RetroLogisticsOps | Note | | |
| RetroTeamCoordination | Note | | |
| RetroCustomerRelevance | Note | | |
| RetroNextSteps | Note | | |
| RecordStatus | Text | | Draft \| Published \| Archived |
| EventStatus | Text | | Proposed \| Confirmed \| Open for registration \| Closed |
| RegistrationUrl | Text | | |
| Notes | Note | | |
| CalendarId | Text | | Source HCLCalendar entry |
| CreatedBy | Text | | |
| Created | Text | | |
| ModifiedBy | Text | | |
| Modified | Text | | |

### 4.4 `HCLTeams`
| Column | Type | Indexed | Notes |
|---|---|---|---|
| Title | (built-in) | | Team name / number |
| TeamId | Text | ✅ | |
| EventId | Text | ✅ | |
| AgencyId | Text | | |
| Participants | Note | | Semicolon-joined |
| AssignedCSAs | Note | | Semicolon-joined PersonIds |
| ManagerId | Text | | |
| SupportIds | Note | | Semicolon-joined PersonIds |
| UseCaseIds | Note | | Semicolon-joined UseCaseIds |

### 4.5 `HCLUseCases`
| Column | Type | Indexed | Notes |
|---|---|---|---|
| Title | (built-in) | | Use case title |
| UseCaseId | Text | ✅ | |
| EventId | Text | ✅ | |
| AgencyId | Text | ✅ | |
| TeamId | Text | | |
| BusinessProblem | Note | | |
| CurrentProcess | Note | | |
| ChallengeSummary | Note | | |
| ProposedSolution | Note | | |
| Components | Note | | Semicolon-joined |
| CopilotRole | Text | | Heavy \| Moderate \| Light \| None |
| Services | Note | | Semicolon-joined |
| InPipeline | Text | | true \| false |
| BusinessValue | Note | | |
| EstimatedImpact | Text | | High \| Medium \| Low |
| ImpactMetric | Text | | |
| Beneficiaries | Note | | |
| Risks | Note | | |
| DataDependencies | Note | | |
| Compliance | Note | | |
| Feasibility | Text | | High \| Medium \| Low |
| Reusability | Text | | High \| Medium \| Low |
| Industries | Note | | Semicolon-joined |
| PatternId | Text | | |
| AssignedCSAs | Note | | Semicolon-joined PersonIds |
| SupportTeams | Note | | Semicolon-joined |
| ExecSponsorId | Text | | |
| NextStep | Note | | |
| OwnerName | Text | | Production owner |
| OwnerEmail | Text | | |
| ChampionApps | Text | | |
| ChampionDataAI | Text | | |
| DemoUrl | Text | | |
| RepoUrl | Text | | |
| Lessons | Note | | |
| ScoreRealProblem | Text | | 0-3 |
| ScoreBusinessValue | Text | | 0-3 |
| ScoreAiTools | Text | | 0-3 |
| ScoreFeasibility | Text | | 0-3 |
| ScoreDemo | Text | | 0-3 |
| ScoreUi | Text | | 0-3 |
| ScoreRepeatability | Text | | 0-3 |
| ScorePlayFit | Text | | 0-3 |
| ScoreCompliance | Text | | 0-3 |
| RecordStatus | Text | | Draft \| In review \| Published \| Archived |
| CreatedBy | Text | | |
| Created | Text | | |
| ModifiedBy | Text | | |
| Modified | Text | | |

> The band/score is computed **in the app** (`prototype/js/scoring.js`) from the 9 `Score*` columns — no SharePoint calculated column needed.

### 4.6 `HCLPatterns`
| Column | Type | Indexed | Notes |
|---|---|---|---|
| Title | (built-in) | | Pattern name |
| PatternId | Text | ✅ | |
| Summary | Note | | |
| Repeatability | Text | | High \| Medium \| Low |
| SolutionPlay | Text | | |
| Components | Note | | Semicolon-joined |
| AcceleratorIds | Note | | Semicolon-joined AcceleratorIds |

### 4.7 `HCLAccelerators`
| Column | Type | Indexed | Notes |
|---|---|---|---|
| Title | (built-in) | | Accelerator name |
| AcceleratorId | Text | ✅ | |
| AcceleratorType | Text | | |
| PatternId | Text | | |
| Url | Text | | |

### 4.8 `HCLCalendar`
| Column | Type | Indexed | Notes |
|---|---|---|---|
| Title | (built-in) | | Event title |
| CalendarId | Text | ✅ | |
| StartDate | Text | ✅ | YYYY-MM-DD |
| EndDate | Text | | YYYY-MM-DD |
| EventStatus | Text | | Proposed \| Confirmed \| Open for registration \| Closed |
| Format | Text | | In-person \| Virtual \| Hybrid |
| Location | Text | | |
| Themes | Note | | Semicolon-joined |
| FocusAgencies | Note | | Semicolon-joined agency ids |
| HostId | Text | | PersonId of host |
| TechnicalSupportTeam | Note | | One per line: `First Last <email>` |
| PartnerOrgs | Note | | |
| OrganizerIds | Note | | |
| RegistrationUrl | Text | | |
| Notes | Note | | |
| ManagedEventId | Text | | EventId this entry was promoted to |
| CreatedBy | Text | | |
| Created | Text | | |
| ModifiedBy | Text | | |
| Modified | Text | | |

### 4.9 `HCLImprovements`
| Column | Type | Indexed | Notes |
|---|---|---|---|
| Title | (built-in) | | |
| ImprovementId | Text | ✅ | |
| ItemType | Text | | Risk \| Concern \| Lesson \| Idea \| Repeat blocker |
| Category | Text | | Logistics \| Technical \| Content \| Staffing \| Customer |
| EventId | Text | | |
| UseCaseId | Text | | |
| Description | Note | | |
| Severity | Text | | High \| Medium \| Low |
| SuggestedAction | Note | | |
| ItemStatus | Text | | Open \| In progress \| Addressed \| Won't fix |
| OwnerId | Text | | |

### 4.10 `HCLFollowups`
| Column | Type | Indexed | Notes |
|---|---|---|---|
| Title | (built-in) | | Short label |
| FollowupId | Text | ✅ | |
| UseCaseId | Text | ✅ | |
| NextStep | Note | | |
| OwnerId | Text | | |
| DueDate | Text | | YYYY-MM-DD |
| MotionType | Text | | Incubation \| Pilot \| Engagement \| Hand to account team |
| FollowupStatus | Text | | Not started \| In progress \| Done \| Stalled |
| ChampionIds | Note | | Semicolon-joined PersonIds |
| OutcomeNotes | Note | | |

### 4.11 `HCLWinners`
| Column | Type | Indexed | Notes |
|---|---|---|---|
| Title | (built-in) | | WinnerId (app sets it on save) |
| WinnerId | Text | ✅ | |
| EventId | Text | ✅ | |
| UseCaseId | Text | | |
| Place | Text | | 1st \| 2nd \| 3rd \| Honorable mention |
| Rationale | Note | | |

### 4.12 `HCLAuditLog`
| Column | Type | Indexed | Notes |
|---|---|---|---|
| Title | (built-in) | | AuditId (app sets it on save) |
| AuditId | Text | ✅ | |
| RecordId | Text | ✅ | Id of audited record |
| RecordType | Text | | Agency \| Event \| Use case \| Calendar \| Team |
| RecordTitle | Text | | |
| Action | Text | | Created \| Updated \| Promoted \| Deleted |
| Summary | Note | | |
| By | Text | | |
| At | Text | | ISO timestamp |

> **13th list:** the schema currently defines 12 lists explicitly plus `HCLAuditLog`. If a list above is not in the JSON yet (e.g. `HCLAccelerators`, `HCLWinners`), it’s a known gap being closed — create it from the table here.

---

## 5. Deploy the app files (manual upload)

The app needs only three things from [`../prototype`](../prototype): `index.html`, the `css/` folder, and the `js/` folder. Do **not** upload `serve.ps1`, `data/`, `data-live/`, or test pages — SharePoint is the backend now.

1. Site → left nav **Site contents** → open **Site Assets** (a default document library). If it’s missing, create a document library named **Site Assets**.
2. Create a folder inside it named **`hcl`**.
3. Open the `hcl` folder → **Upload** → **Files** → select `prototype/index.html`.
4. **Upload** → **Folder** → select the `prototype/css` folder (keeps structure). Repeat for `prototype/js`.
   - If the browser blocks folder upload, create `css` and `js` subfolders manually and upload the files into each.
5. Final structure should be:
   ```
   SiteAssets/hcl/index.html
   SiteAssets/hcl/css/styles.css
   SiteAssets/hcl/js/*.js   (app.js, data.js, factory.js, scoring.js, csvstore.js, sharepointstore.js, spconfig.js, selftest.js, ...)
   ```

---

## 6. Verify

1. Open: `https://contoso.sharepoint.com/sites/HackathonLibrary/SiteAssets/hcl/index.html`
2. The page should render the app shell and switch to **live SharePoint mode automatically** (it detects `_spPageContextInfo`). All dashboards show **0** because the lists are empty — that’s expected.
3. Smoke test write-path: use **+ Register** → **Register an agency** → save. Then open the **HCLAgencies** list in SharePoint and confirm a new item appeared.
4. Continue the chain to prove the model end-to-end: Agency → Event → Team → Use Case → confirm the band computes on the use-case detail.

**If the page downloads instead of rendering, or scripts don’t run:** custom scripts aren’t allowed yet — revisit §2 (allow up to 24h to propagate).

---

## 7. Permissions (3-role pilot)

- **Viewer** → site **Read**.
- **Contributor** → site **Edit/Contribute** (add/edit items).
- **Curator** → **Edit/Design** on the lists; owns approvals.
- Keep sensitive candid notes (production-readiness/compliance) in a Curator-only view or a separate restricted list.

Set via site **Settings** → **Site permissions** → **Advanced permissions settings**.

---

## 8. Optional accelerator (if hand-typing columns is too slow)

Hand-creating `HCLEvents` (~40 cols) and `HCLUseCases` (~50 cols) is tedious. The shipped, supported
accelerator is the Site Design script [`../../scripts/provision-via-sitedesign.ps1`](../../scripts/provision-via-sitedesign.ps1),
which creates all lists with the correct internal column names in one command — no PnP and no Entra
app registration required. See the top-level [`SharePoint_Deployment_Steps.md`](../../SharePoint_Deployment_Steps.md) §4.

---

## 9. Repeat in Prod — checklist

Do §1–§7 again against the Prod site. Nothing in the app hardcodes a URL, so no code changes.

- [ ] §1 Create Prod site, record URL in §0.
- [ ] §2 Allow custom scripts (Prod admin).
- [ ] §4 Create all 13 lists with exact column names.
- [ ] §3 Enable versioning on key lists.
- [ ] §5 Upload `index.html` + `css/` + `js/` to `SiteAssets/hcl`.
- [ ] §6 Open the app, confirm live mode + write path.
- [ ] §7 Set Viewer/Contributor/Curator permissions.
- [ ] Capture the first real hackathon entirely through the forms (no seed import).

---

### Notes / gotchas captured during Dev
- Column **internal names are fixed at creation** — type them exactly; renaming later won’t change the internal name the app queries.
- `Score*` columns are plain **Text** holding `0`–`3`; the band is computed in the browser.
- `Title` is the only SharePoint-required field; the app enforces its own required rules so REST creates aren’t blocked.
- Lists with no natural title (`HCLWinners`, `HCLAuditLog`) get `Title` set to their business key by the app on save.

---

## Appendix A — Copy-paste column names (fast manual entry)

For each list: create it, then add every name below. **Title** is the built-in column (skip it).
Within each list the columns are grouped by type — create all **Text** ones, then all **Note** ones.
✅ = mark as **Indexed** (List settings → Indexed columns) after creating.

### HCLAgencies
- **Text:** `AgencyId` ✅ · `ShortName` · `AgencyType` · `Region` · `Jurisdiction` · `Domain` · `DMFirstName` · `DMLastName` · `DMJobTitle` · `DMRole` · `DMEmail` · `DMCountry` · `DMBusinessPhone` · `RecordStatus` · `CreatedBy` · `Created` · `ModifiedBy` · `Modified`
- **Note:** (none)

### HCLPeople
- **Text:** `PersonId` ✅ · `Email` · `PrimaryOrg` · `RoleTitle` · `Active`
- **Note:** `HackathonRoles` · `SolutionAreas` · `ChampionCapability`

### HCLEvents
- **Text:** `EventId` ✅ · `StartDate` ✅ · `EndDate` · `Location` · `Format` · `HostingTeam` · `HostId` · `LeadSpeakerId` · `NumTeams` · `NumParticipants` · `NumSupportStaff` · `FollowupPlanned` · `RecordStatus` · `EventStatus` · `RegistrationUrl` · `CalendarId` · `CreatedBy` · `Created` · `ModifiedBy` · `Modified`
- **Note:** `OrganizerIds` · `TechnicalSupportTeam` · `PartnerOrgs` · `AgencyMix` · `Themes` · `AgendaSummary` · `DemoDetails` · `WinnerUseCaseIds` · `Outcomes` · `LessonsLearned` · `RetroWhatWorkedWell` · `RetroTrackFeedback` · `RetroContentFlow` · `RetroTechnicalSetup` · `RetroCoachingModel` · `RetroDemosJudging` · `RetroLogisticsOps` · `RetroTeamCoordination` · `RetroCustomerRelevance` · `RetroNextSteps` · `Notes`

### HCLTeams
- **Text:** `TeamId` ✅ · `EventId` ✅ · `AgencyId` · `ManagerId`
- **Note:** `Participants` · `AssignedCSAs` · `SupportIds` · `UseCaseIds`

### HCLUseCases
- **Text:** `UseCaseId` ✅ · `EventId` ✅ · `AgencyId` ✅ · `TeamId` · `CopilotRole` · `InPipeline` · `EstimatedImpact` · `ImpactMetric` · `Feasibility` · `Reusability` · `PatternId` · `ExecSponsorId` · `OwnerName` · `OwnerEmail` · `ChampionApps` · `ChampionDataAI` · `DemoUrl` · `RepoUrl` · `ScoreRealProblem` · `ScoreBusinessValue` · `ScoreAiTools` · `ScoreFeasibility` · `ScoreDemo` · `ScoreUi` · `ScoreRepeatability` · `ScorePlayFit` · `ScoreCompliance` · `RecordStatus` · `CreatedBy` · `Created` · `ModifiedBy` · `Modified`
- **Note:** `BusinessProblem` · `CurrentProcess` · `ChallengeSummary` · `ProposedSolution` · `Components` · `Services` · `BusinessValue` · `Beneficiaries` · `Risks` · `DataDependencies` · `Compliance` · `Industries` · `AssignedCSAs` · `SupportTeams` · `NextStep` · `Lessons`

### HCLPatterns
- **Text:** `PatternId` ✅ · `Repeatability` · `SolutionPlay`
- **Note:** `Summary` · `Components` · `AcceleratorIds`

### HCLAccelerators
- **Text:** `AcceleratorId` ✅ · `AcceleratorType` · `PatternId` · `Url`
- **Note:** (none)

### HCLCalendar
- **Text:** `CalendarId` ✅ · `StartDate` ✅ · `EndDate` · `EventStatus` · `Format` · `Location` · `HostId` · `RegistrationUrl` · `ManagedEventId` · `CreatedBy` · `Created` · `ModifiedBy` · `Modified`
- **Note:** `Themes` · `FocusAgencies` · `TechnicalSupportTeam` · `PartnerOrgs` · `OrganizerIds` · `Notes`

### HCLImprovements
- **Text:** `ImprovementId` ✅ · `ItemType` · `Category` · `EventId` · `UseCaseId` · `Severity` · `ItemStatus` · `OwnerId`
- **Note:** `Description` · `SuggestedAction`

### HCLFollowups
- **Text:** `FollowupId` ✅ · `UseCaseId` ✅ · `OwnerId` · `DueDate` · `MotionType` · `FollowupStatus`
- **Note:** `NextStep` · `ChampionIds` · `OutcomeNotes`

### HCLWinners
- **Text:** `WinnerId` ✅ · `EventId` ✅ · `UseCaseId` · `Place`
- **Note:** `Rationale`

### HCLAuditLog
- **Text:** `AuditId` ✅ · `RecordId` ✅ · `RecordType` · `RecordTitle` · `Action` · `By` · `At`
- **Note:** `Summary`

> Counts (excluding built-in Title): Agencies 18 · People 8 · Events 39 · Teams 8 · UseCases 47 · Patterns 6 · Accelerators 4 · Calendar 19 · Improvements 10 · Followups 9 · Winners 5 · AuditLog 8.
