# Architecture &amp; Workflow

This document explains how the **Hackathon Content Library** is put together and how data flows
through it. All diagrams are [Mermaid](https://mermaid.js.org/) and render natively on GitHub.

---

## 1. Program workflow (end‑to‑end)

The library mirrors the lifecycle of running a SLED AI hackathon program:

```mermaid
flowchart TD
    A[Register agency<br/>+ decision maker] --> B[Plan event<br/>on the calendar]
    B --> C[Promote calendar entry<br/>to a managed event]
    C --> D[Capture use cases<br/>per team]
    D --> E[Score use cases<br/>weighted framework]
    E --> F{High potential?}
    F -- yes --> G[Promote into pipeline<br/>assign owner + next step]
    F -- no --> H[Keep in catalog<br/>for reference]
    G --> I[Define reusable pattern<br/>+ accelerators]
    C --> J[Capture lessons learned<br/>+ improvements]
    G --> K[Record winners]
    A -. every change .-> L[(Audit log)]
    D -. every change .-> L
    E -. every change .-> L
    G -. every change .-> L
```

---

## 2. Runtime architecture

The same JavaScript runs locally and on SharePoint. A single config module resolves the host and a
store router picks the persistence backend at runtime.

```mermaid
flowchart LR
    user([Curator / Viewer]) -->|browser| page

    subgraph host[SharePoint site · SiteAssets/hcl]
        page[index.aspx] --> app[app.js<br/>hash router + page renderers]
        app --> scoring[scoring.js<br/>weighted scoring]
        app --> factory[factory.js<br/>record shapes / seed]
        app --> data{data.js<br/>store router}
        cfg[spconfig.js<br/>resolve host + site URL] --- data
    end

    data -->|host is *.sharepoint.com| sp[sharepointstore.js]
    data -->|local dev| csv[csvstore.js]

    sp -->|REST GET/POST /_api/web/lists| lists[(12 HCL* Lists)]
    csv -->|fetch CSV / JSON| local[(local files)]
```

**Host detection** — [`spconfig.js`](../app/js/spconfig.js) treats any `*.sharepoint.com` origin as
SharePoint mode and derives the site (web) URL from the page path (trimming at the hosting library),
so REST calls always hit the correct `…/sites/<site>` web, never the tenant root.

---

## 3. Persistence &amp; the save path

Writes are **awaited** and surface real errors instead of optimistic "Saved" toasts.

```mermaid
sequenceDiagram
    actor U as Curator
    participant F as Form (app.js)
    participant D as data.js (persist)
    participant S as sharepointstore.js
    participant L as SharePoint List

    U->>F: Fill form → Save
    F->>F: Disable button → "Saving…"
    F->>D: await persist(record)
    D->>S: saveSharePointStore()
    S->>L: POST item (internal-name fields)
    alt success
        L-->>S: 201 Created
        S-->>D: ok
        D-->>F: ok → toast "Saved"
    else failure
        L-->>S: 4xx + error.message
        S-->>D: error (column/list named)
        D-->>F: error → rollback + red banner
    end
```

> Reads/writes address columns by their **internal name** (e.g. `AgencyId`). This is why the Lists
> must be provisioned by [`provision-via-sitedesign.ps1`](../scripts/provision-via-sitedesign.ps1)
> (which sets internal names exactly) rather than "Import from CSV" (which mangles them).

---

## 4. Data model (Lists)

12 SharePoint Lists back the app. Records reference each other by string IDs.

```mermaid
erDiagram
    HCLAgencies   ||--o{ HCLUseCases  : "AgencyId"
    HCLEvents     ||--o{ HCLUseCases  : "EventId"
    HCLEvents     ||--o{ HCLTeams     : "EventId"
    HCLTeams      ||--o{ HCLUseCases  : "TeamId"
    HCLUseCases   ||--o{ HCLFollowups : "UseCaseId"
    HCLPatterns   ||--o{ HCLAccelerators : "PatternId"
    HCLUseCases   }o--|| HCLPatterns  : "PatternId"
    HCLEvents     ||--o{ HCLWinners   : "EventId"
    HCLCalendar   ||--o| HCLEvents    : "ManagedEventId"
    HCLEvents     ||--o{ HCLImprovements : "EventId"
    HCLPeople     ||--o{ HCLTeams     : "members"
    HCLAuditLog   }o--|| HCLUseCases  : "RecordId (any type)"
```

| List | Holds |
|---|---|
| `HCLAgencies` | Customer agencies + primary decision maker |
| `HCLPeople` | Organizers, coaches, champions |
| `HCLEvents` | Managed hackathon events (full retro detail) |
| `HCLTeams` | Teams per event |
| `HCLUseCases` | Captured ideas + 9 scoring dimensions |
| `HCLPatterns` | Reusable solution patterns |
| `HCLAccelerators` | Assets attached to a pattern |
| `HCLCalendar` | Planned/upcoming events |
| `HCLImprovements` | Program improvement items |
| `HCLFollowups` | Post‑event follow‑ups per use case |
| `HCLWinners` | Event winners |
| `HCLAuditLog` | Central change trail (every create/edit/archive/restore/delete) |

Full column definitions are in [`../SharePoint_Deployment_Steps.md`](../SharePoint_Deployment_Steps.md) §4.

---

## 5. Scoring

Each use case is scored `0–3` on nine dimensions; [`scoring.js`](../app/js/scoring.js) computes a
weighted total and maps it to a band (e.g. **High Potential**). Scores are stored as plain text on
`HCLUseCases` and the band is computed in the browser, so the framework can be tuned without a data
migration.
