<#
.SYNOPSIS
  Provision the 12 Hackathon Content Library lists with CORRECT column internal
  names using SharePoint Site Designs / Site Scripts — via the SharePoint Online
  Management Shell you ALREADY have (Microsoft.Online.SharePoint.PowerShell).

  NO PnP. NO Entra app registration. NO browser console.

.WHY THIS EXISTS
  The lists were first built with "Import from CSV", which does not let you
  control a column's *internal* name. The app's REST calls address columns by
  internal name, so it asks for `AgencyId` and SharePoint says
  "field 'AgencyId' does not exist" (HTTP 400) -> every save fails.

  This script declares each column with an explicit internal name via Field XML
  (<Field Name='AgencyId' .../>), registers it as a Site Script + Site Design,
  and applies the design to the site. Site Designs are Microsoft's supported,
  repeatable provisioning model — ideal for Dev -> Prod with zero app setup.

.PREREQUISITES
  * PowerShell 7 (pwsh) or Windows PowerShell 5.1.
  * Microsoft.Online.SharePoint.PowerShell (already installed).
      If needed: Install-Module Microsoft.Online.SharePoint.PowerShell -Scope CurrentUser -Force
  * You are a SharePoint/tenant admin.

.IMPORTANT — clean vs. repair
  Site Designs are ADDITIVE: createSPList adds the correctly-named columns to a
  list, but it does NOT remove the old mangled CSV columns.
    * For a CLEAN result (recommended in Dev): first delete the 12 lists in the
      browser (Site contents -> each list -> Delete). They are empty, so nothing
      is lost. Then run this script -> brand-new lists, correct columns only.
    * For a REPAIR-IN-PLACE (e.g. Prod with data): just run this script. It adds
      the correct columns alongside the existing ones; the app will work. You can
      delete the stray columns later from list settings if you want them tidy.

.USAGE
  pwsh -File .\provision-via-sitedesign.ps1 `
       -SiteUrl  "https://contoso.sharepoint.com/sites/HackathonContentLibrary" `
       -AdminUrl "https://contoso-admin.sharepoint.com"

  # If your site is a Team site (not Communication), add: -WebTemplate 64
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$SiteUrl,
  [string]$AdminUrl,
  [ValidateSet('64','68')][string]$WebTemplate = '68'  # 68 = Communication site, 64 = Team site
)

$ErrorActionPreference = 'Stop'

# Derive the admin URL from the site URL if not supplied:
if (-not $AdminUrl) {
  if ($SiteUrl -match 'https://([^.]+)\.sharepoint\.com') {
    $AdminUrl = "https://$($Matches[1])-admin.sharepoint.com"
  } else {
    throw "Could not derive AdminUrl from SiteUrl. Pass -AdminUrl explicitly."
  }
}

# ---- Column model (authoritative — mirrors the app's round-trip mapping).
#      t = Text (single line), n = Note (multi-line). Title exists by default.
#      Created/Modified intentionally omitted (reserved native fields). ---------
$LISTS = [ordered]@{
  'HCLAgencies'     = @{ t = @('AgencyId','ShortName','AgencyType','Region','Jurisdiction','Domain','DMFirstName','DMLastName','DMJobTitle','DMRole','DMEmail','DMCountry','DMBusinessPhone','RecordStatus','CreatedBy','ModifiedBy'); n = @() }
  'HCLPeople'       = @{ t = @('PersonId','Email','PrimaryOrg','RoleTitle','Active'); n = @('HackathonRoles','SolutionAreas','ChampionCapability') }
  'HCLEvents'       = @{ t = @('EventId','StartDate','EndDate','Location','Format','HostingTeam','HostId','LeadSpeakerId','NumTeams','NumParticipants','NumSupportStaff','FollowupPlanned','RecordStatus','EventStatus','RegistrationUrl','CalendarId','CreatedBy','ModifiedBy'); n = @('OrganizerIds','TechnicalSupportTeam','PartnerOrgs','AgencyMix','Themes','AgendaSummary','DemoDetails','WinnerUseCaseIds','Outcomes','LessonsLearned','RetroWhatWorkedWell','RetroTrackFeedback','RetroContentFlow','RetroTechnicalSetup','RetroCoachingModel','RetroDemosJudging','RetroLogisticsOps','RetroTeamCoordination','RetroCustomerRelevance','RetroNextSteps','Notes') }
  'HCLTeams'        = @{ t = @('TeamId','EventId','AgencyId','ManagerId'); n = @('Participants','AssignedCSAs','SupportIds','UseCaseIds') }
  'HCLUseCases'     = @{ t = @('UseCaseId','EventId','AgencyId','TeamId','CopilotRole','InPipeline','EstimatedImpact','ImpactMetric','Feasibility','Reusability','PatternId','ExecSponsorId','OwnerName','OwnerEmail','ChampionApps','ChampionDataAI','DemoUrl','RepoUrl','ScoreRealProblem','ScoreBusinessValue','ScoreAiTools','ScoreFeasibility','ScoreDemo','ScoreUi','ScoreRepeatability','ScorePlayFit','ScoreCompliance','RecordStatus','CreatedBy','ModifiedBy'); n = @('BusinessProblem','CurrentProcess','ChallengeSummary','ProposedSolution','Components','Services','BusinessValue','Beneficiaries','Risks','DataDependencies','Compliance','Industries','AssignedCSAs','SupportTeams','NextStep','Lessons') }
  'HCLPatterns'     = @{ t = @('PatternId','Repeatability','SolutionPlay'); n = @('Summary','Components','AcceleratorIds') }
  'HCLAccelerators' = @{ t = @('AcceleratorId','AcceleratorType','PatternId','Url'); n = @() }
  'HCLCalendar'     = @{ t = @('CalendarId','StartDate','EndDate','EventStatus','Format','Location','HostId','RegistrationUrl','ManagedEventId','CreatedBy','ModifiedBy'); n = @('Themes','FocusAgencies','TechnicalSupportTeam','PartnerOrgs','OrganizerIds','Notes') }
  'HCLImprovements' = @{ t = @('ImprovementId','ItemType','Category','EventId','UseCaseId','Severity','ItemStatus','OwnerId'); n = @('Description','SuggestedAction') }
  'HCLFollowups'    = @{ t = @('FollowupId','UseCaseId','OwnerId','DueDate','MotionType','FollowupStatus'); n = @('NextStep','ChampionIds','OutcomeNotes') }
  'HCLWinners'      = @{ t = @('WinnerId','EventId','UseCaseId','Place'); n = @('Rationale') }
  'HCLAuditLog'     = @{ t = @('AuditId','RecordId','RecordType','RecordTitle','Action','By','At'); n = @('Summary') }
}

# Business-key column per list (added to the default view so lists are readable).
$KEY = @{
  HCLAgencies='AgencyId'; HCLPeople='PersonId'; HCLEvents='EventId'; HCLTeams='TeamId';
  HCLUseCases='UseCaseId'; HCLPatterns='PatternId'; HCLAccelerators='AcceleratorId';
  HCLCalendar='CalendarId'; HCLImprovements='ImprovementId'; HCLFollowups='FollowupId';
  HCLWinners='WinnerId'; HCLAuditLog='AuditId'
}

# ---- helpers --------------------------------------------------------------
function New-FieldXml {
  param([string]$Name, [ValidateSet('Text','Note')][string]$Type)
  $id = ([guid]::NewGuid()).ToString('B')   # {xxxx-...}
  if ($Type -eq 'Note') {
    return "<Field Type='Note' NumLines='6' RichText='FALSE' Name='$Name' StaticName='$Name' DisplayName='$Name' ID='$id' />"
  }
  return "<Field Type='Text' Name='$Name' StaticName='$Name' DisplayName='$Name' ID='$id' />"
}

function New-ListSubactions {
  # Returns an ordered array of subaction hashtables for a list (no setTitle).
  param([string]$ListName)
  $sub = New-Object System.Collections.Generic.List[object]
  foreach ($c in $LISTS[$ListName].t) {
    $sub.Add([ordered]@{ verb='addSPFieldXml'; schemaXml=(New-FieldXml $c 'Text'); addToDefaultView=($KEY[$ListName] -eq $c) })
  }
  foreach ($c in $LISTS[$ListName].n) {
    $sub.Add([ordered]@{ verb='addSPFieldXml'; schemaXml=(New-FieldXml $c 'Note'); addToDefaultView=$false })
  }
  return $sub.ToArray()
}

function New-ListScriptJson {
  # Wrap a (sub)set of subactions for one list into a createSPList site script.
  # createSPList is idempotent: the first chunk creates the list, later chunks
  # add more columns to the same list. This lets a big list be applied in
  # several small designs, each well under SharePoint's per-apply "stage" cap.
  param([string]$ListName, [object[]]$Subactions)
  $subJson = @($Subactions) | ConvertTo-Json -Depth 6
  # ConvertTo-Json renders a single-element array as an object, so force array.
  if ($Subactions.Count -eq 1) { $subJson = "[$subJson]" }
  return @"
{
  "`$schema": "https://developer.microsoft.com/json-schemas/sp/site-design-script-actions.schema.json",
  "actions": [
    {
      "verb": "createSPList",
      "listName": "$ListName",
      "templateType": 100,
      "subactions": $subJson
    }
  ],
  "bindata": { },
  "version": 1
}
"@
}

# ---- connect --------------------------------------------------------------
if (-not (Get-Module -ListAvailable -Name Microsoft.Online.SharePoint.PowerShell)) {
  throw "Microsoft.Online.SharePoint.PowerShell is not installed. Run: Install-Module Microsoft.Online.SharePoint.PowerShell -Scope CurrentUser -Force"
}
Import-Module Microsoft.Online.SharePoint.PowerShell -UseWindowsPowerShell -WarningAction SilentlyContinue

Write-Host "Connecting to $AdminUrl ..." -ForegroundColor Cyan
Connect-SPOService -Url $AdminUrl

# ---- clean up any previous HCL site scripts/designs (idempotent re-runs) ---
# A single site-design apply caps the total number of actions ("stages"). Even
# one big list (HCLEvents ~40 cols, HCLUseCases ~47) exceeds it. So we split each
# list's columns into CHUNKS and apply one small design per chunk. createSPList is
# idempotent: the first chunk creates the list, later chunks add more columns to
# it. The temp design/script are removed right after applying.
# NOTE: Remove-SPOSiteDesign / Remove-SPOSiteScript do NOT support -Confirm.
$ColsPerChunk = 12   # columns per apply — safely under the per-design stage limit
Write-Host "Removing any previous 'HCL-*' site scripts/designs..." -ForegroundColor DarkGray
Get-SPOSiteDesign | Where-Object { $_.Title -like 'HCL List*' -or $_.Title -like 'HCL Content Library Lists*' } | ForEach-Object { Remove-SPOSiteDesign -Identity $_.Id -ErrorAction SilentlyContinue }
Get-SPOSiteScript | Where-Object { $_.Title -like 'HCL-*' } | ForEach-Object { Remove-SPOSiteScript -Identity $_.Id -ErrorAction SilentlyContinue }

# ---- provision each list in column-chunks ----------------------------------
$ok = 0; $failed = 0; $failedLists = @()
foreach ($name in $LISTS.Keys) {
  $subs = @(New-ListSubactions -ListName $name)
  # Split into chunks of $CHUNK columns each (index-free to avoid type coercion).
  $chunks = New-Object System.Collections.Generic.List[object]
  $batch  = New-Object System.Collections.Generic.List[object]
  foreach ($s in $subs) {
    $batch.Add($s)
    if ($batch.Count -ge $ColsPerChunk) { $chunks.Add($batch.ToArray()); $batch = New-Object System.Collections.Generic.List[object] }
  }
  if ($batch.Count -gt 0) { $chunks.Add($batch.ToArray()) }
  $part = 0; $listOk = $true
  foreach ($chunk in $chunks) {
    $part++
    $scriptId = $null; $designId = $null
    try {
      $json = New-ListScriptJson -ListName $name -Subactions $chunk
      $sc = Add-SPOSiteScript -Title "HCL-$name-$part" -Content $json -Description "HCL $name columns part $part"
      $scriptId = $sc.Id
      $design = Add-SPOSiteDesign -Title "HCL List $name $part" -SiteScripts $scriptId -WebTemplate $WebTemplate -Description "Provisions $name (part $part)."
      $designId = $design.Id
      Invoke-SPOSiteDesign -Identity $designId -WebUrl $SiteUrl -ErrorAction Stop | Out-Null
    }
    catch {
      $listOk = $false
      Write-Warning "$name part $part : $($_.Exception.Message)"
    }
    finally {
      if ($designId) { Remove-SPOSiteDesign -Identity $designId -ErrorAction SilentlyContinue }
      if ($scriptId) { Remove-SPOSiteScript -Identity $scriptId -ErrorAction SilentlyContinue }
    }
  }
  if ($listOk) { Write-Host "+ applied $name ($($chunks.Count) part(s))" -ForegroundColor Green; $ok++ }
  else { Write-Host "x FAILED $name" -ForegroundColor Red; $failed++; $failedLists += $name }
}

Write-Host "`n=====================================================" -ForegroundColor Cyan
Write-Host "Lists OK: $ok | failed: $failed" -ForegroundColor Cyan
if ($failed -eq 0) {
  Write-Host "Done. Each list applies in the background (a few seconds each)." -ForegroundColor Green
  Write-Host "Open the site -> Site contents to confirm the 12 HCL* lists." -ForegroundColor Green
  Write-Host "Then go to the app and click 'Retry save' on the error banner." -ForegroundColor Green
  Write-Host "`nReusable: in Prod run this same script against the Prod site URL —"
  Write-Host "no app registration, no console, ever."
} else {
  Write-Warning "Failed lists: $($failedLists -join ', '). Re-run the script — it is safe to repeat."
}
