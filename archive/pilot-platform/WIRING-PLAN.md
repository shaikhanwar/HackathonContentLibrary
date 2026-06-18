# Hackathon Content Library — SharePoint / Power Platform Wiring Plan

> ⚠️ **Archived / historical.** Some links below point to PnP scripts (`provision-lists.ps1`,
> `deploy-app.ps1`) that have since been **removed**. The supported provisioning path is
> [`../../scripts/provision-via-sitedesign.ps1`](../../scripts/provision-via-sitedesign.ps1); see the
> top-level [`SharePoint_Deployment_Steps.md`](../../SharePoint_Deployment_Steps.md). Kept for reference only.

**Goal:** move the prototype from in-memory/seed data to a real Microsoft 365 backend (SharePoint Lists + Power Apps + Power Automate) **without relying on seed data**. The pilot starts from empty lists and is populated entirely through the capture forms.

**Guiding principle — one canonical shape.** [prototype/js/factory.js](../prototype/js/factory.js) is now the single source of truth for every record shape. The forms build records through it, the self-test ([prototype/test.html](../prototype/test.html)) verifies it, and the SharePoint columns below mirror it field-for-field. When a field changes, it changes in one place and the three stay aligned.

---

## 0. Chosen approach — SharePoint-hosted app (live wiring implemented)

The pilot runs the existing SPA **hosted on the SharePoint site**, reading and writing the lists via same-origin REST — **SharePoint only, no Power Apps, no new Power Platform environment.** The runtime wiring is implemented:

| Piece | File |
|---|---|
| REST adapter (load/save all lists) | [prototype/js/sharepointstore.js](../prototype/js/sharepointstore.js) |
| Portability config (site URL + list prefix) | [prototype/js/spconfig.js](../prototype/js/spconfig.js) |
| Mode wiring + auto-detect (`?data=sharepoint`) | [prototype/js/data.js](../prototype/js/data.js) |
| Shared column mapping (reused by CSV + SharePoint) | [prototype/js/csvstore.js](../prototype/js/csvstore.js) |
| Provision lists | [provision-lists.ps1](provision-lists.ps1) · [lists/hcl-list-schemas.json](lists/hcl-list-schemas.json) |
| Push app to the site | [deploy-app.ps1](deploy-app.ps1) |

**Portability:** the app talks to whatever site hosts it (`_spPageContextInfo.webAbsoluteUrl`); list names are fixed constants. Moving to another site = re-provision + re-deploy, no code change. The schema is uniform Text/Note so the string-based adapter round-trips with no type friction (one mapping layer, shared with the CSV self-tests). The Power Apps / Power BI design in the rest of this doc is an **optional** future path over the same lists.

---

## 1. Validation already done (proof it is "real")

| Check | How | Result |
|---|---|---|
| Model is form/factory-driven, not seed-driven | `?data=sample` builds a full program from empty via the factory | ✅ renders catalog, detail tabs, scoring |
| App survives with zero data | `?data=empty` | ✅ all dashboards show 0, no crash |
| End-to-end integrity | [prototype/test.html](../prototype/test.html) → 21 assertions | ✅ 21/21 pass (relationships, no undefined render fields, bands/gates/flags, winners-by-score) |

Run locally: `pwsh -File prototype/serve.ps1` then open `http://localhost:8099/test.html`, `…/index.html?data=sample`, `…/index.html?data=empty`.

---

## 2. Entity → List → Form map

| Factory builder | SharePoint list | Capture form (prototype) | Has form today? |
|---|---|---|---|
| `buildAgency` | HCLAgencies | Register an Agency | ✅ |
| `buildPerson` | HCLPeople | Add host / Add coach (in Manage Event) | ✅ |
| `buildEvent` | HCLEvents | Create / Manage Event | ✅ |
| `buildTeam` | HCLTeams | Manage Event → Teams | ✅ |
| `buildUseCase` | HCLUseCases | Register a Use Case (5-tab) | ✅ |
| `buildPattern` | HCLPatterns | Register Pattern | ✅ |
| `buildAccelerator` | **HCLAccelerators (new)** | Register Pattern → Accelerator | ✅ (list missing) |
| `buildCalendarEvent` | HCLCalendar | **none — gap** | ❌ |
| `buildImprovement` | HCLImprovements | Retrospective free-text only | ⚠️ partial |
| `buildFollowup` | HCLFollowups | overlaps uc.followupOwnerId/nextStep | ⚠️ partial |
| Winners (place + rationale) | HCLEvents (new columns) or HCLWinners | Manage Event → Winning Use Cases | ✅ (columns missing) |

---

## 3. Schema gaps to close before provisioning

The current schema is [pilot-platform/lists/hcl-list-schemas.json](lists/hcl-list-schemas.json). Add the following so the lists capture everything the forms already collect:

### HCLAgencies — add decision-maker + domain
The Register Agency form captures a full decision maker; the schema only has type/region. Add:
- `Jurisdiction` (Text)
- `Domain` (Text)
- `DMFirstName`, `DMLastName`, `DMJobTitle`, `DMRole`, `DMEmail`, `DMCountry`, `DMBusinessPhone`

> **Normalization:** the form's *Government level* (`City/County/State/Regional/Federal`) maps to the `AgencyType` choice. `factory.buildAgency` already maps `level → type` and fills `region`/`jurisdiction`, so the form and seed shapes converge.

### HCLPeople — add email
Coaches/hosts created in-app carry an email. Add `Email` (Text) — in production promote to a Person column.

### HCLEvents — winners + agenda
Add:
- `WinnerUseCaseIds` (Note) — winning use case ids
- `Winners` (Note, JSON) — array of `{ place, ucId, rationale }` **or** a dedicated **HCLWinners** list (preferred for reporting): `EventId` (lookup), `UseCase` (lookup), `Place` (Choice: 1st/2nd/3rd/Honorable mention), `Rationale` (Note, required)
- `AgendaSummary` (Note), `DemoDetails` (Note)

### HCLPatterns — accelerator link + new accelerators list
- Add `AcceleratorIds` (Note) to HCLPatterns
- Create **HCLAccelerators**: `Title`, `AcceleratorId` (Text, indexed), `AcceleratorType` (Choice), `Pattern` (lookup→HCLPatterns), `Url` (URL)

### HCLUseCases — confirm complete
Already has the 10 score columns, `ProductionScore` calculated column, champions, support teams. ✅ No change needed beyond verifying `OrgInvolvement` is intentionally dropped (factory omits it).

---

## 4. Scoring & gates — where the logic lives

The 10-dimension weighted score (sum = 100) is identical in three places and must stay so:
- App engine: [prototype/js/scoring.js](../prototype/js/scoring.js)
- SharePoint: `ProductionScore` calculated column (formula already in the schema)
- **Bands + hard gates are NOT expressible in a SharePoint calculated column.** Implement in Power Apps / Power BI:
  - `≥70` High Potential · `≥45` Needs Incubation · `<45` Not Ready
  - Hard gate: `Compliance=0` or `Feasibility=0` → Not Ready
  - Owner gate: High Potential requires `FollowupOwnerId`, else cap at Needs Incubation
  - Flags: no-owner, reusable (repeatability=3), compliance (≤1), quick-win, strategic

Keep a single copy of these thresholds as a Power Fx named formula / Power BI measure so they match `scoring.js`.

---

## 5. Power Platform layer

```
Microsoft Lists (10 lists)
        │  (data source)
        ▼
Power Apps Canvas app  ──►  Power Fx: band/gate/flag formulas (mirror scoring.js)
        │
        ├─ Forms = the prototype's capture forms, 1:1 with factory builders
        │     • required-field gates (e.g. owner required when status = Production candidate)
        │     • live band preview on the score tab
        │
        ▼
Power Automate flows
        • on Use Case create/update → recompute band, set FollowupOwner reminder
        • on Event "winners saved" → write HCLWinners rows, require rationale
        • weekly digest of High-Potential / no-owner items
        ▼
Power BI dashboard (program metrics, pipeline, CSA leaderboard, blockers)
```

ID strategy: keep the app's `AG-/EV-/UC-/T-/PR-/PAT-/ACC-` business-key columns (indexed) as the join keys, independent of the SharePoint item ID — this is what `factory.nextId` already produces.

---

## 6. Phased rollout — no seed dependency

**Phase A — Provision (empty).**
1. Close the schema gaps in §3.
2. Provision all lists with [pilot-platform/provision-lists.ps1](provision-lists.ps1) (PnP PowerShell). **Do not import the seed CSVs.**
3. Verify each list's columns match the factory shape.

**Phase B — Build the app.**
4. Bind the Power Apps forms to the lists, port the Power Fx scoring/gates from `scoring.js`.
5. Smoke test by registering **one** agency → event → team → use case through the UI (the same flow the self-test exercises against the factory). Confirm the band computes and the winner rationale is enforced.

**Phase C — Real capture.**
6. Run the first real hackathon entirely through the forms. The lists fill from genuine activity, never from seed data.

**Optional — demo only.** If a populated demo environment is needed, regenerate CSVs with [pilot-platform/gen-seed-csv.ps1](gen-seed-csv.ps1) (or export `buildSampleProgram()` output) into a **separate** demo site — keep it out of the pilot tenant so production never depends on seed rows.

---

## 7. Open decisions for sign-off

1. **Winners:** new `HCLWinners` list (better reporting) vs. JSON column on HCLEvents? → recommend the list.
2. **Calendar / Improvements / Followups capture forms:** build dedicated Power Apps screens (recommended) vs. manage in the list UI for the pilot.
3. **People as real Persons:** switch `HCLPeople.Title`/`Email` to a Person/Group column in production, or keep text for the pilot?
4. **Domain choice set:** is agency `Domain` free text or a managed choice list?

> Confirm §3 schema additions and the §7 decisions before any provisioning runs. No SharePoint changes will be made until this plan is approved.
