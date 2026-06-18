# gen-seed-csv.ps1 — generates SharePoint-import CSVs from the prototype JSON seed data.
# Run from the pilot-platform folder:  pwsh -File .\gen-seed-csv.ps1
$ErrorActionPreference = 'Stop'
$proto = Join-Path $PSScriptRoot '..\prototype\data'
$out = Join-Path $PSScriptRoot 'seed'
New-Item -ItemType Directory -Force -Path $out | Out-Null
function J($name) { Get-Content (Join-Path $proto "$name.json") -Raw | ConvertFrom-Json }

# Agencies
(J 'agencies').agencies | ForEach-Object {
  [pscustomobject]@{ Title=$_.name; AgencyId=$_.id; ShortName=$_.shortName; AgencyType=$_.type; Region=$_.region }
} | Export-Csv (Join-Path $out 'HCLAgencies.csv') -NoTypeInformation -Encoding UTF8

# People
(J 'people').people | ForEach-Object {
  [pscustomobject]@{ Title=$_.name; PersonId=$_.id; PrimaryOrg=$_.org; RoleTitle=$_.roleTitle;
    HackathonRoles=($_.hackathonRoles -join ';'); SolutionAreas=($_.solutionAreas -join ';');
    ChampionCapability=($_.championCapability -join ';'); Active=$_.active }
} | Export-Csv (Join-Path $out 'HCLPeople.csv') -NoTypeInformation -Encoding UTF8

# Events
(J 'events').events | ForEach-Object {
  [pscustomobject]@{ Title=$_.name; EventId=$_.id; StartDate=$_.startDate; EndDate=$_.endDate;
    Location=$_.location; Format=$_.format; HostingTeam=$_.hostingTeam; HostId=$_.hostId;
    LeadSpeakerId=$_.leadSpeakerId; NumTeams=$_.numTeams; NumParticipants=$_.numParticipants;
    NumSupportStaff=$_.numSupportStaff; Themes=($_.themes -join ';'); FollowupPlanned=$_.followupPlanned;
    Outcomes=$_.outcomes; LessonsLearned=$_.lessonsLearned; RecordStatus=$_.recordStatus }
} | Export-Csv (Join-Path $out 'HCLEvents.csv') -NoTypeInformation -Encoding UTF8

# Teams
(J 'teams').teams | ForEach-Object {
  [pscustomobject]@{ Title=$_.name; TeamId=$_.id; EventId=$_.eventId; AgencyId=$_.agencyId;
    Participants=($_.participants -join '; '); AssignedCSAs=($_.csaIds -join ';'); ManagerId=$_.managerId }
} | Export-Csv (Join-Path $out 'HCLTeams.csv') -NoTypeInformation -Encoding UTF8

# Patterns
(J 'patterns').patterns | ForEach-Object {
  [pscustomobject]@{ Title=$_.name; PatternId=$_.id; Summary=$_.summary; Repeatability=$_.repeatability;
    SolutionPlay=$_.solutionPlay; Components=($_.components -join ';') }
} | Export-Csv (Join-Path $out 'HCLPatterns.csv') -NoTypeInformation -Encoding UTF8

# Calendar
(J 'calendar').calendar | ForEach-Object {
  [pscustomobject]@{ Title=$_.title; CalendarId=$_.id; StartDate=$_.startDate; EndDate=$_.endDate;
    EventStatus=$_.status; Format=$_.format; Location=$_.location; Themes=($_.themes -join ';');
    FocusAgencies=($_.focusAgencies -join ';'); OrganizerIds=($_.organizerIds -join ';');
    RegistrationUrl=$_.registrationUrl; Notes=$_.notes }
} | Export-Csv (Join-Path $out 'HCLCalendar.csv') -NoTypeInformation -Encoding UTF8

# Improvements
(J 'improvements').improvements | ForEach-Object {
  [pscustomobject]@{ Title=$_.title; ImprovementId=$_.id; ItemType=$_.type; Category=$_.category;
    EventId=$_.eventId; UseCaseId=$_.useCaseId; Description=$_.description; Severity=$_.severity;
    SuggestedAction=$_.suggestedAction; ItemStatus=$_.status; OwnerId=$_.ownerId }
} | Export-Csv (Join-Path $out 'HCLImprovements.csv') -NoTypeInformation -Encoding UTF8

# Followups
(J 'followups').followups | ForEach-Object {
  [pscustomobject]@{ Title=$_.id; FollowupId=$_.id; UseCaseId=$_.useCaseId; NextStep=$_.nextStep;
    OwnerId=$_.ownerId; DueDate=$_.dueDate; MotionType=$_.motionType; FollowupStatus=$_.status;
    OutcomeNotes=$_.outcomeNotes }
} | Export-Csv (Join-Path $out 'HCLFollowups.csv') -NoTypeInformation -Encoding UTF8

# Use Cases (flatten scores)
(J 'usecases').useCases | ForEach-Object {
  $s = $_.scores
  [pscustomobject]@{ Title=$_.title; UseCaseId=$_.id; EventId=$_.eventId; AgencyId=$_.agencyId; TeamId=$_.teamId;
    BusinessProblem=$_.businessProblem; CurrentProcess=$_.currentProcess; ChallengeSummary=$_.challengeSummary;
    ProposedSolution=$_.proposedSolution; Components=($_.components -join ';'); CopilotRole=$_.copilotRole;
    Services=($_.services -join ';'); Status=$_.status; BusinessValue=$_.businessValue; EstimatedImpact=$_.estimatedImpact;
    ImpactMetric=$_.impactMetric; Beneficiaries=$_.beneficiaries; Risks=$_.risks; DataDependencies=$_.dataDependencies;
    Compliance=$_.compliance; Feasibility=$_.feasibility; Reusability=$_.reusability; Industries=($_.industries -join ';');
    PatternId=$_.patternId; AssignedCSAs=($_.csaIds -join ';'); SupportTeams=($_.supportTeams -join ';');
    ExecSponsorId=$_.execSponsorId; NextStep=$_.nextStep; FollowupOwnerId=$_.followupOwnerId;
    ChampionApps=$_.champions.apps; ChampionDataAI=$_.champions.dataai; DemoUrl=$_.demoUrl; RepoUrl=$_.repoUrl; Lessons=$_.lessons;
    ScoreBusinessValue=$s.businessValue; ScoreUrgency=$s.urgency; ScoreSponsorship=$s.sponsorship;
    ScoreFeasibility=$s.feasibility; ScoreDataReadiness=$s.dataReadiness; ScoreCompliance=$s.compliance;
    ScorePlayFit=$s.playFit; ScoreRepeatability=$s.repeatability; ScoreEaseNextStep=$s.easeNextStep;
    ScoreOwnerChampion=$s.ownerChampion; RecordStatus=$_.recordStatus }
} | Export-Csv (Join-Path $out 'HCLUseCases.csv') -NoTypeInformation -Encoding UTF8

Write-Host "Generated CSVs in $out"
Get-ChildItem $out -Filter *.csv | Select-Object Name, Length
