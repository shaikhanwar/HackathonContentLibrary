// csvstore.js — CSV-backed persistence for the prototype.
// Proves the model works with NO seed data: starts from a blank data-live/
// folder, writes records entered through the forms to CSV files on disk
// (via the serve.ps1 API), and reloads them. Columns mirror the SharePoint
// import format in pilot-platform/gen-seed-csv.ps1 so the same CSVs feed the
// eventual SharePoint lists.
import {
  buildAgency, buildPerson, buildEvent, buildTeam, buildUseCase,
  buildPattern, buildAccelerator, buildCalendarEvent, buildImprovement, buildFollowup
} from './factory.js';

// ---- CSV primitives -------------------------------------------------------
export function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cols = columns || (rows[0] ? Object.keys(rows[0]) : []);
  const head = cols.map(esc).join(',');
  if (!rows.length) return head;
  const body = rows.map(r => cols.map(c => esc(r[c])).join(',')).join('\r\n');
  return `${head}\r\n${body}`;
}

export function parseCsv(text) {
  if (!text) return [];
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let field = '', record = [], inQ = false, i = 0;
  const endField = () => { record.push(field); field = ''; };
  const endRecord = () => { rows.push(record); record = []; };
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { endField(); i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { endField(); endRecord(); i++; continue; }
    field += c; i++;
  }
  if (field.length || record.length) { endField(); endRecord(); }
  if (!rows.length) return [];
  const header = rows.shift();
  return rows
    .filter(r => !(r.length === 1 && r[0] === ''))
    .map(r => { const o = {}; header.forEach((h, idx) => o[h] = r[idx] ?? ''); return o; });
}

// ---- value helpers --------------------------------------------------------
const join = (a) => (Array.isArray(a) ? a.join('; ') : (a || ''));
const split = (s) => String(s || '').split(/;\s*/).map(x => x.trim()).filter(Boolean);
const numOr = (v) => (v === '' || v == null ? '' : Number(v));
const boolStr = (v) => (v === true || v === 'true' ? 'true' : 'false');
const isTrue = (v) => v === true || v === 'true';

// Retrospective + score keys (stable order).
const RETRO = ['whatWorkedWell', 'trackFeedback', 'contentFlow', 'technicalSetup', 'coachingModel', 'demosJudging', 'logisticsOps', 'teamCoordination', 'customerRelevance', 'nextSteps'];
const SCORES = ['realProblem', 'businessValue', 'aiTools', 'feasibility', 'demo', 'ui', 'repeatability', 'playFit', 'compliance'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Audit columns (mirror SharePoint Author / Created / Editor / Modified).
const auditCols = (r) => ({ CreatedBy: r.createdBy || '', Created: r.createdAt || '', ModifiedBy: r.modifiedBy || '', Modified: r.modifiedAt || '' });
const auditIn = (row) => ({ createdBy: row.CreatedBy || '', createdAt: row.Created || '', modifiedBy: row.ModifiedBy || '', modifiedAt: row.Modified || '' });

// ---- db -> CSV tables -----------------------------------------------------
// Returns { TableName: "<csv text>" }.
export function dbToTables(db) {
  const t = {};

  t.HCLAgencies = toCsv((db.agencies || []).map(a => {
    const dm = a.decisionMaker || {};
    return {
      Title: a.name, AgencyId: a.id, ShortName: a.shortName, AgencyType: a.type,
      Region: a.region, Jurisdiction: a.jurisdiction, Domain: a.domain,
      DMFirstName: dm.firstName, DMLastName: dm.lastName, DMJobTitle: dm.jobTitle, DMRole: dm.role,
      DMEmail: dm.email, DMCountry: dm.country, DMBusinessPhone: dm.businessPhone, RecordStatus: a.recordStatus,
      ...auditCols(a)
    };
  }));

  t.HCLPeople = toCsv((db.people || []).map(p => ({
    Title: p.name, PersonId: p.id, Email: p.email, PrimaryOrg: p.org, RoleTitle: p.roleTitle,
    HackathonRoles: join(p.hackathonRoles), SolutionAreas: join(p.solutionAreas),
    ChampionCapability: join(p.championCapability), Active: boolStr(p.active)
  })));

  t.HCLEvents = toCsv((db.events || []).map(e => {
    const r = e.retrospective || {};
    const row = {
      Title: e.name, EventId: e.id, StartDate: e.startDate, EndDate: e.endDate, Location: e.location,
      Format: e.format, HostingTeam: e.hostingTeam, HostId: e.hostId, LeadSpeakerId: e.leadSpeakerId,
      OrganizerIds: join(e.organizerIds), TechnicalSupportTeam: join(e.technicalSupportTeam),
      PartnerOrgs: join(e.partnerOrgs), NumTeams: e.numTeams, NumParticipants: e.numParticipants,
      NumSupportStaff: e.numSupportStaff, AgencyMix: join(e.agencyMix), Themes: join(e.themes),
      AgendaSummary: e.agendaSummary, DemoDetails: e.demoDetails, WinnerUseCaseIds: join(e.winnerUseCaseIds),
      FollowupPlanned: boolStr(e.followupPlanned), Outcomes: e.outcomes, LessonsLearned: e.lessonsLearned
    };
    RETRO.forEach(k => row['Retro' + cap(k)] = r[k] || '');
    row.RecordStatus = e.recordStatus;
    row.EventStatus = e.status || '';
    row.RegistrationUrl = e.registrationUrl || '';
    row.Notes = e.notes || '';
    row.CalendarId = e.calendarId || '';
    Object.assign(row, auditCols(e));
    return row;
  }));

  t.HCLTeams = toCsv((db.teams || []).map(tm => ({
    Title: tm.name, TeamId: tm.id, EventId: tm.eventId, AgencyId: tm.agencyId,
    Participants: join(tm.participants), AssignedCSAs: join(tm.csaIds), ManagerId: tm.managerId,
    SupportIds: join(tm.supportIds), UseCaseIds: join(tm.useCaseIds)
  })));

  t.HCLUseCases = toCsv((db.useCases || []).map(u => {
    const s = u.scores || {}, ch = u.champions || {};
    const row = {
      Title: u.title, UseCaseId: u.id, EventId: u.eventId, AgencyId: u.agencyId, TeamId: u.teamId,
      BusinessProblem: u.businessProblem, CurrentProcess: u.currentProcess, ChallengeSummary: u.challengeSummary,
      ProposedSolution: u.proposedSolution, Components: join(u.components), CopilotRole: u.copilotRole,
      Services: join(u.services), InPipeline: u.inPipeline, BusinessValue: u.businessValue, EstimatedImpact: u.estimatedImpact,
      ImpactMetric: u.impactMetric, Beneficiaries: u.beneficiaries, Risks: u.risks, DataDependencies: u.dataDependencies,
      Compliance: u.compliance, Feasibility: u.feasibility, Reusability: u.reusability, Industries: join(u.industries),
      PatternId: u.patternId, AssignedCSAs: join(u.csaIds), SupportTeams: join(u.supportTeams),
      ExecSponsorId: u.execSponsorId, NextStep: u.nextStep, OwnerName: u.ownerName, OwnerEmail: u.ownerEmail,
      ChampionApps: ch.apps, ChampionDataAI: ch.dataai, DemoUrl: u.demoUrl, RepoUrl: u.repoUrl, Lessons: u.lessons
    };
    SCORES.forEach(k => row['Score' + cap(k)] = (s[k] ?? ''));
    row.RecordStatus = u.recordStatus;
    Object.assign(row, auditCols(u));
    return row;
  }));

  t.HCLPatterns = toCsv((db.patterns || []).map(p => ({
    Title: p.name, PatternId: p.id, Summary: p.summary, Repeatability: p.repeatability,
    SolutionPlay: p.solutionPlay, Components: join(p.components), AcceleratorIds: join(p.acceleratorIds)
  })));

  t.HCLAccelerators = toCsv((db.accelerators || []).map(a => ({
    Title: a.name, AcceleratorId: a.id, AcceleratorType: a.type, PatternId: a.patternId, Url: a.url
  })));

  t.HCLCalendar = toCsv((db.calendar || []).map(c => ({
    Title: c.title, CalendarId: c.id, StartDate: c.startDate, EndDate: c.endDate, EventStatus: c.status,
    Format: c.format, Location: c.location, Themes: join(c.themes), FocusAgencies: join(c.focusAgencies),
    HostId: c.hostId || '', TechnicalSupportTeam: join(c.technicalSupportTeam), PartnerOrgs: join(c.partnerOrgs),
    OrganizerIds: join(c.organizerIds), RegistrationUrl: c.registrationUrl, Notes: c.notes,
    ManagedEventId: c.managedEventId || '', ...auditCols(c)
  })));

  t.HCLImprovements = toCsv((db.improvements || []).map(i => ({
    Title: i.title, ImprovementId: i.id, ItemType: i.type, Category: i.category, EventId: i.eventId,
    UseCaseId: i.useCaseId, Description: i.description, Severity: i.severity, SuggestedAction: i.suggestedAction,
    ItemStatus: i.status, OwnerId: i.ownerId
  })));

  t.HCLFollowups = toCsv((db.followups || []).map(f => ({
    Title: f.id, FollowupId: f.id, UseCaseId: f.useCaseId, NextStep: f.nextStep, OwnerId: f.ownerId,
    DueDate: f.dueDate, MotionType: f.motionType, FollowupStatus: f.status, ChampionIds: join(f.championIds),
    OutcomeNotes: f.outcomeNotes
  })));

  // Winners flattened to their own table (one row per place).
  const winnerRows = [];
  (db.events || []).forEach(e => (e.winners || []).forEach((w, idx) => winnerRows.push({
    WinnerId: `${e.id}-W${idx + 1}`, EventId: e.id, UseCaseId: w.ucId, Place: w.place, Rationale: w.rationale
  })));
  t.HCLWinners = toCsv(winnerRows);

  // Audit log (mirrors a SharePoint audit / version-history list).
  t.HCLAuditLog = toCsv((db.audit || []).map(a => ({
    AuditId: a.id, RecordId: a.recordId, RecordType: a.recordType, RecordTitle: a.recordTitle,
    Action: a.action, Summary: a.summary, By: a.by, At: a.at
  })));

  return t;
}

// ---- CSV tables -> db -----------------------------------------------------
// Rebuilds the db through the factory (so defaults fill + use cases decorate).
// `map` is { TableName: "<csv text>" }. Thin wrapper over rowMapToDb so the
// SharePoint adapter can reuse the exact same field mapping with row objects.
export function tablesToDb(map) {
  const rowMap = {};
  for (const k of Object.keys(map || {})) rowMap[k] = parseCsv(map[k] || '');
  return rowMapToDb(rowMap);
}

// Rebuilds the db from a map of { TableName: [rowObjects] }. Each row object is
// keyed by column name (same shape parseCsv produces and SharePoint items map
// to), so both the CSV store and the SharePoint store share one mapping layer.
export function rowMapToDb(rowMap) {
  const rows = (name) => rowMap[name] || [];
  const db = {
    agencies: [], people: [], events: [], patterns: [], accelerators: [],
    teams: [], calendar: [], improvements: [], followups: [], useCases: [], byId: {}
  };
  const add = (coll, rec) => { db[coll].push(rec); db.byId[rec.id] = rec; return rec; };

  rows('HCLAgencies').forEach(r => add('agencies', buildAgency({
    id: r.AgencyId, name: r.Title, shortName: r.ShortName, type: r.AgencyType, region: r.Region,
    jurisdiction: r.Jurisdiction, domain: r.Domain, recordStatus: r.RecordStatus,
    decisionMaker: { firstName: r.DMFirstName, lastName: r.DMLastName, jobTitle: r.DMJobTitle, role: r.DMRole, email: r.DMEmail, country: r.DMCountry, businessPhone: r.DMBusinessPhone },
    ...auditIn(r)
  })));

  rows('HCLPeople').forEach(r => add('people', buildPerson({
    id: r.PersonId, name: r.Title, email: r.Email, org: r.PrimaryOrg, roleTitle: r.RoleTitle,
    hackathonRoles: split(r.HackathonRoles), solutionAreas: split(r.SolutionAreas),
    championCapability: split(r.ChampionCapability), active: isTrue(r.Active)
  })));

  rows('HCLEvents').forEach(r => {
    const retrospective = {};
    RETRO.forEach(k => { const v = r['Retro' + cap(k)]; if (v) retrospective[k] = v; });
    add('events', buildEvent({
      id: r.EventId, name: r.Title, startDate: r.StartDate, endDate: r.EndDate, location: r.Location,
      format: r.Format, hostingTeam: r.HostingTeam, hostId: r.HostId || null, leadSpeakerId: r.LeadSpeakerId || null,
      organizerIds: split(r.OrganizerIds), technicalSupportTeam: split(r.TechnicalSupportTeam),
      partnerOrgs: split(r.PartnerOrgs), numTeams: r.NumTeams, numParticipants: r.NumParticipants,
      numSupportStaff: r.NumSupportStaff, agencyMix: split(r.AgencyMix), themes: split(r.Themes),
      agendaSummary: r.AgendaSummary, demoDetails: r.DemoDetails, winnerUseCaseIds: split(r.WinnerUseCaseIds),
      followupPlanned: isTrue(r.FollowupPlanned), outcomes: r.Outcomes, lessonsLearned: r.LessonsLearned,
      retrospective, recordStatus: r.RecordStatus, status: r.EventStatus, registrationUrl: r.RegistrationUrl,
      notes: r.Notes, calendarId: r.CalendarId || null, ...auditIn(r)
    }));
  });

  rows('HCLTeams').forEach(r => add('teams', buildTeam({
    id: r.TeamId, name: r.Title, eventId: r.EventId || null, agencyId: r.AgencyId || null,
    participants: split(r.Participants), csaIds: split(r.AssignedCSAs), managerId: r.ManagerId || null,
    supportIds: split(r.SupportIds), useCaseIds: split(r.UseCaseIds)
  })));

  rows('HCLUseCases').forEach(r => {
    const scores = {};
    SCORES.forEach(k => { const v = r['Score' + cap(k)]; if (v !== '' && v != null) scores[k] = Number(v); });
    add('useCases', buildUseCase({
      id: r.UseCaseId, title: r.Title, eventId: r.EventId || null, agencyId: r.AgencyId || null, teamId: r.TeamId || null,
      businessProblem: r.BusinessProblem, currentProcess: r.CurrentProcess, challengeSummary: r.ChallengeSummary,
      proposedSolution: r.ProposedSolution, components: split(r.Components), copilotRole: r.CopilotRole,
      services: split(r.Services), inPipeline: r.InPipeline, businessValue: r.BusinessValue, estimatedImpact: r.EstimatedImpact,
      impactMetric: r.ImpactMetric, beneficiaries: r.Beneficiaries, risks: r.Risks, dataDependencies: r.DataDependencies,
      compliance: r.Compliance, feasibility: r.Feasibility, reusability: r.Reusability, industries: split(r.Industries),
      patternId: r.PatternId || null, csaIds: split(r.AssignedCSAs), supportTeams: split(r.SupportTeams),
      execSponsorId: r.ExecSponsorId || null, nextStep: r.NextStep, ownerName: r.OwnerName, ownerEmail: r.OwnerEmail,
      champions: { apps: r.ChampionApps || null, dataai: r.ChampionDataAI || null },
      demoUrl: r.DemoUrl, repoUrl: r.RepoUrl, lessons: r.Lessons, recordStatus: r.RecordStatus, scores, ...auditIn(r)
    }));
  });

  rows('HCLPatterns').forEach(r => add('patterns', buildPattern({
    id: r.PatternId, name: r.Title, summary: r.Summary, repeatability: r.Repeatability,
    solutionPlay: r.SolutionPlay, components: split(r.Components), acceleratorIds: split(r.AcceleratorIds)
  })));

  rows('HCLAccelerators').forEach(r => add('accelerators', buildAccelerator({
    id: r.AcceleratorId, name: r.Title, type: r.AcceleratorType, patternId: r.PatternId || null, url: r.Url
  })));

  rows('HCLCalendar').forEach(r => add('calendar', buildCalendarEvent({
    id: r.CalendarId, title: r.Title, startDate: r.StartDate, endDate: r.EndDate, status: r.EventStatus,
    format: r.Format, location: r.Location, themes: split(r.Themes), focusAgencies: split(r.FocusAgencies),
    hostId: r.HostId || null, technicalSupportTeam: split(r.TechnicalSupportTeam), partnerOrgs: split(r.PartnerOrgs),
    organizerIds: split(r.OrganizerIds), registrationUrl: r.RegistrationUrl, notes: r.Notes,
    managedEventId: r.ManagedEventId || null, ...auditIn(r)
  })));

  rows('HCLImprovements').forEach(r => add('improvements', buildImprovement({
    id: r.ImprovementId, title: r.Title, type: r.ItemType, category: r.Category, eventId: r.EventId || null,
    useCaseId: r.UseCaseId || null, description: r.Description, severity: r.Severity,
    suggestedAction: r.SuggestedAction, status: r.ItemStatus, ownerId: r.OwnerId || null
  })));

  rows('HCLFollowups').forEach(r => add('followups', buildFollowup({
    id: r.FollowupId, useCaseId: r.UseCaseId || null, nextStep: r.NextStep, ownerId: r.OwnerId || null,
    dueDate: r.DueDate || null, motionType: r.MotionType, status: r.FollowupStatus,
    championIds: split(r.ChampionIds), outcomeNotes: r.OutcomeNotes
  })));

  // Reattach winners to their events.
  rows('HCLWinners').forEach(r => {
    const ev = db.byId[r.EventId];
    if (ev) { ev.winners = ev.winners || []; ev.winners.push({ place: r.Place, ucId: r.UseCaseId, rationale: r.Rationale }); }
  });

  // Audit log.
  db.audit = rows('HCLAuditLog').map(r => ({
    id: r.AuditId, recordId: r.RecordId, recordType: r.RecordType, recordTitle: r.RecordTitle,
    action: r.Action, summary: r.Summary, by: r.By, at: r.At
  }));

  return db;
}

// ---- server API -----------------------------------------------------------
export async function loadCsvStore() {
  const res = await fetch('api/csv', { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`CSV load failed (${res.status})`);
  const map = await res.json();
  return tablesToDb(map || {});
}

export async function saveCsvStore(db) {
  const tables = dbToTables(db);
  const res = await fetch('api/csv', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tables)
  });
  if (!res.ok) throw new Error(`CSV save failed (${res.status})`);
  return tables;
}

export async function resetCsvStore() {
  const res = await fetch('api/csv/reset', { method: 'POST' });
  if (!res.ok) throw new Error(`CSV reset failed (${res.status})`);
  return true;
}
