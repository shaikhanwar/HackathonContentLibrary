# Hackathon Content Library — Test Cases

Two automated harnesses run in the browser against the live prototype. No manual
clicking required to get a pass/fail. Start the server first:

```pwsh
cd d:\Anwar\MSFT\Stretched\ContentLibrary\prototype
pwsh -ExecutionPolicy Bypass -File .\serve.ps1
```

| Harness | URL | What it proves |
|---|---|---|
| Model self-test | http://localhost:8099/test.html | Factory + scoring engine integrity (in-memory) |
| **CSV end-to-end** | http://localhost:8099/test-csv.html | **Blank → capture → CSV on disk → reload** (no seed data) |
| Live app — CSV mode | http://localhost:8099/index.html?data=csv | Interactive prototype persisting to CSV |
| Live app — sample | http://localhost:8099/index.html?data=sample | Renders a factory-built program, no seed JSON |
| Live app — empty | http://localhost:8099/index.html?data=empty | Renders with zero records, no crash |

> **Last verified:** Model self-test **23/23 PASS**, CSV end-to-end **16/16 PASS**,
> plus interactive edit / audit / promote flows confirmed in the live app (CSV mode).
> `test-csv.html` is **destructive** — it resets `data-live/`; back up first if it holds real captures.

---

## A. Model self-test (`test.html`) — 23 cases

| ID | Test case | Expected |
|---|---|---|
| M-01 | Sample program builds non-empty collections | All collections populated |
| M-02 | Global `byId` index covers every record | Every record indexed |
| M-03 | No duplicate ids | All ids unique |
| M-03a | Records carry audit fields (created/modified by & at) | Agency/use case/event/calendar all stamped |
| M-03b | Audit timestamps pass through builders | created/modified preserved on rebuild |
| M-04 | Every team references a real event & agency | No dangling team FKs |
| M-05 | Every use case references real event/agency/team | No dangling use-case FKs |
| M-06 | Person references resolve (owner/sponsor/champions/CSA) | All people found |
| M-07 | Team `useCaseIds` and `uc.teamId` agree | Links consistent both ways |
| M-08 | Accelerators link to a real pattern | No dangling accelerator FKs |
| M-09 | Improvements & follow-ups link to real event/use case | References resolve |
| M-10 | Use cases have all render-required fields | No undefined on any detail tab |
| M-11 | Events have all render-required fields | No undefined |
| M-12 | Agencies have all render-required fields | No undefined |
| M-13 | Teams have all render-required fields | No undefined |
| M-14 | Score recomputes deterministically from dimensions | `_score === rounded(scores)` |
| M-15 | Band reflects score thresholds and gates | UC-A High, UC-B Not Ready (feasibility gate) |
| M-16 | Owner gate caps High Potential without an owner | 100-pt no-owner → Needs Incubation |
| M-17 | Flags compute (reusable/compliance/strategic/no-owner) | Correct chips |
| M-18 | Dimension weights sum to 100 | 100 |
| M-19 | Top-scored use case is the recorded 1st-place winner | Winner = top score, has rationale |
| M-20 | Aggregations run on an EMPTY program | No throw |
| M-21 | Builders fill safe defaults from minimal input | Defaults present |

## B. CSV end-to-end (`test-csv.html`) — 16 cases

These are the **"store in CSV, starting from blank"** cases.

| ID | Test case | Steps | Expected |
|---|---|---|---|
| C-01 | Store starts blank after reset | POST `/api/csv/reset` → GET `/api/csv` | 0 agencies / 0 events / 0 use cases |
| C-02 | Captured records save to CSV on disk | Build via factory → POST `/api/csv` | `HCL*.csv` files written under `data-live/` |
| C-03 | Counts survive CSV round-trip | Reload from disk | Same A/P/E/T/UC counts |
| C-04 | Records re-indexed by id after reload | Rebuild `byId` | Every record resolvable |
| C-05 | No dangling foreign keys after reload | Walk all FKs | All references resolve |
| C-06 | Scores & bands recompute identically from CSV | Compare `_score`/`_band` | No drift |
| C-07 | Agency decision-maker survives CSV | Inspect `AG-A` | First/last/email preserved |
| C-08 | Use-case champions survive CSV | Inspect `UC-A` | `apps`/`dataai` preserved |
| C-09 | Use-case 9 scores survive CSV | Inspect `UC-A.scores` | All 9 dims preserved |
| C-10 | Event retrospective survives CSV | Inspect `EV-A.retrospective` | Notes preserved |
| C-11 | Multi-value arrays survive CSV | `agencyMix` / `themes` | Arrays preserved (`;`-joined) |
| C-12 | Winner place + rationale survive CSV | `HCLWinners` round-trip | Place + rationale preserved |
| C-13 | CSV escaping round-trips | Serialize/parse comma/quote/newline | Values intact |
| C-14 | Save is idempotent | Load → save → compare bytes | Identical CSV bytes |
| C-15a | Audit metadata survives CSV | Stamp created/modified → reload | Created/Modified by & at preserved |
| C-15b | Audit-log entries survive CSV | Push `HCLAuditLog` row → reload | Change-history entry preserved |
| C-16 | (reported as bugs list) | Any failing assertion above | Listed in the red "Bugs found" panel |

## C. Manual interactive flow (CSV mode) — capture from blank

| ID | Step | Expected |
|---|---|---|
| I-01 | Open `index.html?data=csv`, click **⊘ Start blank** | Library empties; Home shows 0s |
| I-02 | Register → Register an Agency → submit | Agency appears; row added to `HCLAgencies.csv` |
| I-03 | Register → Manage an Event → create event | Event appears; `HCLEvents.csv` row |
| I-04 | In event, add a team and a use case | Team/use case appear; CSV rows added |
| I-05 | Register a Use Case (5 tabs) with scores | Band/Potential computes; `HCLUseCases.csv` row with 10 scores |
| I-06 | Winning Use Cases → auto-fill + rationale + save | `HCLWinners.csv` rows with rationale |
| I-07 | Click **↻ Reload** (or restart browser) | All entered data reloads from CSV — nothing lost |
| I-08 | Inspect `prototype/data-live/*.csv` | Human-readable CSV matching SharePoint import columns |

## D. Editability, audit & calendar reconciliation (CSV mode)

| ID | Step | Expected |
|---|---|---|
| E-01 | **Agencies** page → **✏️ Edit** an agency → change any field → Save | Card updates; `Agency updated` toast; row rewritten in `HCLAgencies.csv` |
| E-02 | Same agency → **🕓 Audit** | Modal shows Created/Modified by & at + a change-history row "Agency details updated" |
| E-03 | **Use Case detail** → **✏️ Edit** | Modal exposes all 36 fields incl. the **9 score selects**; Save recomputes band/potential |
| E-04 | Inline score change on a use case (Manage event → Use Cases tab) | Band/Potential recompute live; audit row "…score updated" added |
| E-05 | **Manage an Event → Overview → ✏️ Edit** | Full event modal (dates, location, format, organizers, tech support, partners); Save persists + audit row |
| E-06 | **Calendar** → **✏️ Edit** an upcoming event | Modal incl. **free-text organizers** ("First Last <email>"); survives reload |
| E-07 | **Calendar** → **Promote to managed event** | Creates linked managed event, navigates to Manage with it selected, organizers carried over, `…is now a managed event` toast |
| E-08 | After promote, revisit Calendar | Promote button replaced by **↗ Managed event** link → no duplicate/conflict |
| E-09 | Any **🕓 Audit** modal | Footer note maps fields to SharePoint **Created/Created By/Modified/Modified By + version history + Purview audit logs** |
| E-10 | Save to CSV → inspect `HCLAuditLog.csv` | Every Created/Updated/Promoted action is a durable row |

> **Auditing in SharePoint:** the schema (`pilot-platform/lists/hcl-list-schemas.json`)
> enables list **versioning** (50 major versions) and the native **Created/Modified**
> people+date columns on every list, plus a dedicated **HCLAuditLog** list and
> tenant-level **Microsoft Purview** audit logging. The in-app **🕓 Audit** button
> surfaces the same history directly on the page.
