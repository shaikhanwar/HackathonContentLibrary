/* ===========================================================================
 * provision-lists-browser.js
 * ---------------------------------------------------------------------------
 * Creates the 12 Hackathon Content Library lists (and their Text/Note columns)
 * in a SharePoint site using the *browser's own authenticated session* — no
 * PnP, no app registration, no admin consent. Run it from the DevTools console
 * while you are signed in to the target site (e.g. https://contoso.sharepoint.com
 * or any sub-site you created for the library).
 *
 * HOW TO RUN
 *   1. In the browser, open the SharePoint SITE you want to provision into
 *      (the page must be a SharePoint page so the REST API is same-origin).
 *   2. Press F12 -> Console.
 *   3. Paste this entire file and press Enter.
 *   4. Watch the log. It is idempotent: existing lists/fields are skipped.
 *
 * It mirrors pilot-platform/lists/hcl-list-schemas.json 1:1 and matches the
 * list titles the app reads at runtime (prototype/js/sharepointstore.js).
 *
 * NOTE on Created/Modified: SharePoint already provides built-in Created and
 * Modified fields, so this script does NOT create columns by those names. All
 * other columns (including CreatedBy / ModifiedBy) are created as Text/Note.
 * ======================================================================== */
(async () => {
  'use strict';

  // Resolve the current site (web) URL from the SharePoint page context.
  const site =
    (window._spPageContextInfo && window._spPageContextInfo.webAbsoluteUrl) ||
    location.origin;

  // Field type kinds: 2 = single line of text, 3 = multiple lines of text.
  const T = 2, N = 3;

  // Compact schema: t = Text columns, m = Note (multi-line) columns.
  // Title already exists on every list, so it is omitted here.
  const LISTS = [
    { n: 'HCLAgencies',
      t: ['AgencyId','ShortName','AgencyType','Region','Jurisdiction','Domain',
          'DMFirstName','DMLastName','DMJobTitle','DMRole','DMEmail','DMCountry',
          'DMBusinessPhone','RecordStatus','CreatedBy','ModifiedBy'],
      m: [] },
    { n: 'HCLPeople',
      t: ['PersonId','Email','PrimaryOrg','RoleTitle','Active'],
      m: ['HackathonRoles','SolutionAreas','ChampionCapability'] },
    { n: 'HCLEvents',
      t: ['EventId','StartDate','EndDate','Location','Format','HostingTeam',
          'HostId','LeadSpeakerId','NumTeams','NumParticipants','NumSupportStaff',
          'FollowupPlanned','RecordStatus','EventStatus','RegistrationUrl',
          'CalendarId','CreatedBy','ModifiedBy'],
      m: ['OrganizerIds','TechnicalSupportTeam','PartnerOrgs','AgencyMix','Themes',
          'AgendaSummary','DemoDetails','WinnerUseCaseIds','Outcomes','LessonsLearned',
          'RetroWhatWorkedWell','RetroTrackFeedback','RetroContentFlow',
          'RetroTechnicalSetup','RetroCoachingModel','RetroDemosJudging',
          'RetroLogisticsOps','RetroTeamCoordination','RetroCustomerRelevance',
          'RetroNextSteps','Notes'] },
    { n: 'HCLTeams',
      t: ['TeamId','EventId','AgencyId','ManagerId'],
      m: ['Participants','AssignedCSAs','SupportIds','UseCaseIds'] },
    { n: 'HCLUseCases',
      t: ['UseCaseId','EventId','AgencyId','TeamId','CopilotRole','InPipeline',
          'EstimatedImpact','ImpactMetric','Feasibility','Reusability','PatternId',
          'ExecSponsorId','OwnerName','OwnerEmail','ChampionApps','ChampionDataAI',
          'DemoUrl','RepoUrl','ScoreRealProblem','ScoreBusinessValue','ScoreAiTools',
          'ScoreFeasibility','ScoreDemo','ScoreUi','ScoreRepeatability','ScorePlayFit',
          'ScoreCompliance','RecordStatus','CreatedBy','ModifiedBy'],
      m: ['BusinessProblem','CurrentProcess','ChallengeSummary','ProposedSolution',
          'Components','Services','BusinessValue','Beneficiaries','Risks',
          'DataDependencies','Compliance','Industries','AssignedCSAs','SupportTeams',
          'NextStep','Lessons'] },
    { n: 'HCLPatterns',
      t: ['PatternId','Repeatability','SolutionPlay'],
      m: ['Summary','Components','AcceleratorIds'] },
    { n: 'HCLAccelerators',
      t: ['AcceleratorId','AcceleratorType','PatternId','Url'],
      m: [] },
    { n: 'HCLCalendar',
      t: ['CalendarId','StartDate','EndDate','EventStatus','Format','Location',
          'HostId','RegistrationUrl','ManagedEventId','CreatedBy','ModifiedBy'],
      m: ['Themes','FocusAgencies','TechnicalSupportTeam','PartnerOrgs',
          'OrganizerIds','Notes'] },
    { n: 'HCLImprovements',
      t: ['ImprovementId','ItemType','Category','EventId','UseCaseId','Severity',
          'ItemStatus','OwnerId'],
      m: ['Description','SuggestedAction'] },
    { n: 'HCLFollowups',
      t: ['FollowupId','UseCaseId','OwnerId','DueDate','MotionType','FollowupStatus'],
      m: ['NextStep','ChampionIds','OutcomeNotes'] },
    { n: 'HCLWinners',
      t: ['WinnerId','EventId','UseCaseId','Place'],
      m: ['Rationale'] },
    { n: 'HCLAuditLog',
      t: ['AuditId','RecordId','RecordType','RecordTitle','Action','By','At'],
      m: ['Summary'] }
  ];

  const log = (...a) => console.log('%c[provision]', 'color:#0a7', ...a);
  const warn = (...a) => console.warn('[provision]', ...a);
  const err = (...a) => console.error('[provision]', ...a);

  const VERBOSE = {
    'Accept': 'application/json;odata=verbose',
    'Content-Type': 'application/json;odata=verbose'
  };

  // Get a fresh form digest for write operations.
  async function getDigest() {
    const r = await fetch(`${site}/_api/contextinfo`, {
      method: 'POST', headers: VERBOSE, credentials: 'same-origin'
    });
    if (!r.ok) throw new Error(`contextinfo failed (${r.status}). Are you signed in to ${site}?`);
    const j = await r.json();
    return j.d.GetContextWebInformation.FormDigestValue;
  }

  // Does a list (by Title) already exist?
  async function listExists(title) {
    const r = await fetch(
      `${site}/_api/web/lists/getbytitle('${encodeURIComponent(title)}')?$select=Title`,
      { headers: { 'Accept': 'application/json;odata=nometadata' }, credentials: 'same-origin' });
    return r.ok;
  }

  // Set of existing internal field names on a list (lower-cased).
  async function existingFields(title) {
    const r = await fetch(
      `${site}/_api/web/lists/getbytitle('${encodeURIComponent(title)}')/fields?$select=InternalName&$top=500`,
      { headers: { 'Accept': 'application/json;odata=nometadata' }, credentials: 'same-origin' });
    const set = new Set();
    if (r.ok) {
      const j = await r.json();
      (j.value || []).forEach(f => set.add(String(f.InternalName).toLowerCase()));
    }
    return set;
  }

  async function createList(title, digest) {
    const body = JSON.stringify({
      '__metadata': { 'type': 'SP.List' },
      'BaseTemplate': 100,            // generic custom list
      'Title': title,
      'ContentTypesEnabled': false,
      'EnableVersioning': true,
      'MajorVersionLimit': 50,
      'Description': 'Hackathon Content Library — ' + title
    });
    const r = await fetch(`${site}/_api/web/lists`, {
      method: 'POST',
      headers: { ...VERBOSE, 'X-RequestDigest': digest },
      credentials: 'same-origin',
      body
    });
    if (!r.ok) throw new Error(`create list "${title}" failed (${r.status}): ${await r.text()}`);
  }

  async function addField(title, fieldName, kind, digest) {
    const body = JSON.stringify({
      '__metadata': { 'type': 'SP.Field' },
      'Title': fieldName,
      'FieldTypeKind': kind
    });
    const r = await fetch(
      `${site}/_api/web/lists/getbytitle('${encodeURIComponent(title)}')/fields`,
      {
        method: 'POST',
        headers: { ...VERBOSE, 'X-RequestDigest': digest },
        credentials: 'same-origin',
        body
      });
    if (!r.ok) throw new Error(`add field "${fieldName}" -> "${title}" failed (${r.status}): ${await r.text()}`);
  }

  // ---- run ----------------------------------------------------------------
  log(`Target site: ${site}`);
  let digest = await getDigest();
  log('Got form digest. Provisioning 12 lists...');

  let created = 0, skipped = 0, fieldsAdded = 0, errors = 0;

  for (const def of LISTS) {
    try {
      if (await listExists(def.n)) {
        log(`• ${def.n} — exists, ensuring columns`);
        skipped++;
      } else {
        await createList(def.n, digest);
        log(`✓ ${def.n} — list created`);
        created++;
      }

      const have = await existingFields(def.n);
      const cols = [...def.t.map(name => [name, T]), ...def.m.map(name => [name, N])];
      for (const [name, kind] of cols) {
        if (have.has(name.toLowerCase())) continue;       // already there
        try {
          await addField(def.n, name, kind, digest);
          fieldsAdded++;
        } catch (e) {
          errors++;
          warn(`  ${def.n}.${name}: ${e.message}`);
        }
      }
      log(`  ${def.n} — columns ensured`);
    } catch (e) {
      errors++;
      err(`${def.n}: ${e.message}`);
      // Refresh digest in case it expired mid-run, then continue.
      try { digest = await getDigest(); } catch (_) {}
    }
  }

  log('==================================================');
  log(`Done. Lists created: ${created}, existing: ${skipped}, fields added: ${fieldsAdded}, errors: ${errors}`);
  if (errors === 0) log('All lists are ready. You can now deploy the app to this site.');
  else warn('Finished with some errors — review the messages above.');
})();
