# List schema CSVs — for Microsoft Lists "Import from CSV"

> ⚠️ **DEPRECATED for provisioning.** "Import from CSV" does **not** let you set a column's *internal* name, which breaks the app's REST saves (`field 'AgencyId' does not exist`). Provision the lists with [`../scripts/provision-via-sitedesign.ps1`](../scripts/provision-via-sitedesign.ps1) instead — see §4 of [`../SharePoint_Deployment_Steps.md`](../SharePoint_Deployment_Steps.md). These CSVs are kept only as a human-readable record of each list's columns and internal names.

These 12 header-only CSVs create the Hackathon Content Library lists with exact column **internal names** (no typos). Use them via **Site → + New → List → From CSV** (or **Import from CSV**).

## Why header-only
Microsoft Lists infers column types from the data. With no data rows, columns default to **Single line of text**, which is exactly what we want for most fields. In the import **preview**, switch only the **Note** columns listed below to **Multiple lines of text**, then create.

> If your tenant's importer refuses a header-only file, tell me and I'll add one placeholder data row per CSV (you'd delete that item after import).

## Columns intentionally NOT included: `Created` and `Modified`
`Created` and `Modified` are **reserved SharePoint field names**. Creating custom columns with those names makes SharePoint assign a different internal name, which breaks the app's field mapping. The app instead reads SharePoint's **native** Created/Modified, so we leave them out. `CreatedBy` and `ModifiedBy` are safe custom columns and **are** included.

## Per-list: set these columns to "Multiple lines of text" in the import preview
All other columns stay "Single line of text".

| List (name it exactly) | CSV | Multiple lines of text columns | Index after import |
|---|---|---|---|
| `HCLAgencies` | HCLAgencies.csv | _(none)_ | AgencyId |
| `HCLPeople` | HCLPeople.csv | HackathonRoles, SolutionAreas, ChampionCapability | PersonId |
| `HCLEvents` | HCLEvents.csv | OrganizerIds, TechnicalSupportTeam, PartnerOrgs, AgencyMix, Themes, AgendaSummary, DemoDetails, WinnerUseCaseIds, Outcomes, LessonsLearned, RetroWhatWorkedWell, RetroTrackFeedback, RetroContentFlow, RetroTechnicalSetup, RetroCoachingModel, RetroDemosJudging, RetroLogisticsOps, RetroTeamCoordination, RetroCustomerRelevance, RetroNextSteps, Notes | EventId, StartDate |
| `HCLTeams` | HCLTeams.csv | Participants, AssignedCSAs, SupportIds, UseCaseIds | TeamId, EventId |
| `HCLUseCases` | HCLUseCases.csv | BusinessProblem, CurrentProcess, ChallengeSummary, ProposedSolution, Components, Services, BusinessValue, Beneficiaries, Risks, DataDependencies, Compliance, Industries, AssignedCSAs, SupportTeams, NextStep, Lessons | UseCaseId, EventId, AgencyId |
| `HCLPatterns` | HCLPatterns.csv | Summary, Components, AcceleratorIds | PatternId |
| `HCLAccelerators` | HCLAccelerators.csv | _(none)_ | AcceleratorId |
| `HCLCalendar` | HCLCalendar.csv | Themes, FocusAgencies, TechnicalSupportTeam, PartnerOrgs, OrganizerIds, Notes | CalendarId, StartDate |
| `HCLImprovements` | HCLImprovements.csv | Description, SuggestedAction | ImprovementId |
| `HCLFollowups` | HCLFollowups.csv | NextStep, ChampionIds, OutcomeNotes | FollowupId, UseCaseId |
| `HCLWinners` | HCLWinners.csv | Rationale | WinnerId, EventId |
| `HCLAuditLog` | HCLAuditLog.csv | Summary | AuditId, RecordId |

> The **Title** column maps to the built-in Title — keep it. Date fields (StartDate, EndDate, DueDate, At) and number-like fields (Score*, NumTeams…) stay **Single line of text** — the app stores them as strings.
