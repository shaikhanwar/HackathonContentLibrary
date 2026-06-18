// factory.js — canonical entity builders.
// Single source of truth for record shapes. Every form and the test harness
// build records through these so the data model stays consistent and complete
// (no undefined fields on any render path). This is what the SharePoint wiring
// will mirror column-for-column.
import { computeBand, computeFlags, rounded } from './scoring.js';

// ---- ID sequence ----------------------------------------------------------
let seq = 1;
export function resetSeq(n = 1) { seq = n; }
export function nextId(prefix) { return `${prefix}-${String(seq++).padStart(3, '0')}`; }

// Small helpers
const str = (v, d = '') => (v == null ? d : String(v));
const arr = (v) => (Array.isArray(v) ? v : []);
const list = (v) => (Array.isArray(v) ? v : String(v || '').split(',').map(s => s.trim()).filter(Boolean));
const bool = (v) => v === true || v === 'true' || v === 'on';
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

// ---- Audit (mirrors SharePoint Author / Created / Editor / Modified) ------
// Every record carries who/when it was created and last modified. The app
// stamps these on create/edit; SharePoint will populate them natively.
function auditFields(p = {}) {
  const createdBy = str(p.createdBy, 'Seed');
  const createdAt = str(p.createdAt);
  return {
    createdBy,
    createdAt,
    modifiedBy: str(p.modifiedBy) || createdBy,
    modifiedAt: str(p.modifiedAt) || createdAt
  };
}

// ---- Agency ---------------------------------------------------------------
export function buildAgency(p = {}) {
  const dm = p.decisionMaker || {};
  return {
    id: p.id || nextId('AG-NEW'),
    name: str(p.name, 'Untitled Agency'),
    shortName: str(p.shortName),
    type: str(p.type || p.level, 'City'),
    region: str(p.region || p.jurisdiction),
    jurisdiction: str(p.jurisdiction || p.region),
    domain: str(p.domain),
    decisionMaker: {
      firstName: str(dm.firstName),
      lastName: str(dm.lastName),
      jobTitle: str(dm.jobTitle),
      role: str(dm.role),
      email: str(dm.email),
      country: str(dm.country, 'United States'),
      businessPhone: str(dm.businessPhone)
    },
    recordStatus: str(p.recordStatus, 'Draft'),
    ...auditFields(p)
  };
}

// ---- Person ---------------------------------------------------------------
export function buildPerson(p = {}) {
  const name = p.name || [p.first, p.last].filter(Boolean).join(' ') || 'Unnamed';
  return {
    id: p.id || nextId('PR-NEW'),
    name: str(name),
    email: str(p.email),
    org: str(p.org, 'CSA'),
    roleTitle: str(p.roleTitle, 'Participant'),
    hackathonRoles: arr(p.hackathonRoles),
    solutionAreas: arr(p.solutionAreas),
    championCapability: arr(p.championCapability),
    active: p.active === undefined ? true : bool(p.active),
    ...auditFields(p)
  };
}

// ---- Event ----------------------------------------------------------------
export function buildEvent(p = {}) {
  return {
    id: p.id || nextId('EV-NEW'),
    name: str(p.name, 'Untitled Event'),
    startDate: str(p.startDate),
    endDate: str(p.endDate),
    location: str(p.location),
    format: str(p.format, 'In-person'),
    hostingTeam: str(p.hostingTeam),
    hostId: p.hostId || null,
    leadSpeakerId: p.leadSpeakerId || null,
    calendarId: p.calendarId || null,
    organizerIds: arr(p.organizerIds),
    technicalSupportTeam: arr(p.technicalSupportTeam),
    partnerOrgs: arr(p.partnerOrgs),
    numTeams: num(p.numTeams),
    numParticipants: num(p.numParticipants),
    numSupportStaff: num(p.numSupportStaff),
    agencyMix: arr(p.agencyMix),
    themes: list(p.themes),
    status: str(p.status, 'Proposed'),
    registrationUrl: str(p.registrationUrl, '#'),
    notes: str(p.notes),
    agendaSummary: str(p.agendaSummary),
    demoDetails: str(p.demoDetails),
    winnerUseCaseIds: arr(p.winnerUseCaseIds),
    winners: arr(p.winners),
    followupPlanned: bool(p.followupPlanned),
    outcomes: str(p.outcomes),
    lessonsLearned: str(p.lessonsLearned),
    retrospective: p.retrospective || {},
    recordStatus: str(p.recordStatus, 'Draft'),
    ...auditFields(p)
  };
}

// ---- Team -----------------------------------------------------------------
export function buildTeam(p = {}) {
  return {
    id: p.id || nextId('T-NEW'),
    name: str(p.name, 'Untitled Team'),
    eventId: p.eventId || null,
    agencyId: p.agencyId || null,
    participants: arr(p.participants),
    csaIds: arr(p.csaIds),
    managerId: p.managerId || null,
    supportIds: arr(p.supportIds),
    useCaseIds: arr(p.useCaseIds),
    ...auditFields(p)
  };
}

// ---- Pattern / Accelerator ------------------------------------------------
export function buildPattern(p = {}) {
  return {
    id: p.id || nextId('PAT-NEW'),
    name: str(p.name, 'Untitled Pattern'),
    summary: str(p.summary),
    repeatability: str(p.repeatability, 'Medium'),
    solutionPlay: str(p.solutionPlay || p.play),
    components: list(p.components),
    acceleratorIds: arr(p.acceleratorIds),
    ...auditFields(p)
  };
}

export function buildAccelerator(p = {}) {
  return {
    id: p.id || nextId('ACC-NEW'),
    name: str(p.name, 'Untitled Accelerator'),
    type: str(p.type, 'Solution accelerator'),
    patternId: p.patternId || null,
    url: str(p.url, '#')
  };
}

// ---- Use case -------------------------------------------------------------
export function buildUseCase(p = {}) {
  const champions = p.champions || {};
  const uc = {
    id: p.id || nextId('UC-NEW'),
    title: str(p.title, 'Untitled Use Case'),
    eventId: p.eventId || null,
    agencyId: p.agencyId || null,
    teamId: p.teamId || null,
    inPipeline: bool(p.inPipeline),
    // Overview
    businessProblem: str(p.businessProblem),
    currentProcess: str(p.currentProcess),
    challengeSummary: str(p.challengeSummary),
    proposedSolution: str(p.proposedSolution),
    beneficiaries: str(p.beneficiaries),
    industries: list(p.industries),
    // Solution & tech
    components: list(p.components),
    copilotRole: str(p.copilotRole),
    services: list(p.services),
    patternId: p.patternId || null,
    dataDependencies: str(p.dataDependencies),
    compliance: str(p.compliance),
    risks: str(p.risks),
    // Value & impact
    businessValue: str(p.businessValue),
    estimatedImpact: str(p.estimatedImpact),
    impactMetric: str(p.impactMetric),
    feasibility: str(p.feasibility),
    reusability: str(p.reusability),
    // Champions & follow-ups
    csaIds: arr(p.csaIds),
    execSponsorId: p.execSponsorId || null,
    champions: { apps: champions.apps || null, dataai: champions.dataai || null },
    supportTeams: list(p.supportTeams),
    nextStep: str(p.nextStep),
    // Production owner — assigned at the pipeline step (free text)
    ownerName: str(p.ownerName),
    ownerEmail: str(p.ownerEmail),
    // Artifacts
    demoUrl: str(p.demoUrl, '#'),
    repoUrl: str(p.repoUrl, '#'),
    lessons: str(p.lessons),
    recordStatus: str(p.recordStatus, 'Draft'),
    // Scoring (each dimension 0-3)
    scores: p.scores || {},
    ...auditFields(p)
  };
  return decorate(uc);
}

// Attach computed scoring fields (mirrors data.js decorateUc).
export function decorate(uc) {
  uc.scores = uc.scores || {};
  uc._score = rounded(uc.scores);
  uc._band = computeBand(uc);
  uc._flags = computeFlags(uc);
  return uc;
}

// ---- Calendar (upcoming event) -------------------------------------------
export function buildCalendarEvent(p = {}) {
  return {
    id: p.id || nextId('CAL-NEW'),
    title: str(p.title, 'Untitled Upcoming Event'),
    startDate: str(p.startDate),
    endDate: str(p.endDate),
    status: str(p.status, 'Open for registration'),
    format: str(p.format, 'Hybrid'),
    location: str(p.location),
    themes: list(p.themes),
    focusAgencies: list(p.focusAgencies),
    hostId: p.hostId || null,
    technicalSupportTeam: arr(p.technicalSupportTeam),
    partnerOrgs: arr(p.partnerOrgs),
    organizerIds: arr(p.organizerIds),
    registrationUrl: str(p.registrationUrl, '#'),
    notes: str(p.notes),
    managedEventId: p.managedEventId || null,
    ...auditFields(p)
  };
}

// ---- Improvement (tracked item) ------------------------------------------
export function buildImprovement(p = {}) {
  return {
    id: p.id || nextId('IMP-NEW'),
    title: str(p.title, 'Untitled Item'),
    type: str(p.type, 'Lesson'),
    category: str(p.category, 'Logistics'),
    eventId: p.eventId || null,
    useCaseId: p.useCaseId || null,
    description: str(p.description),
    severity: str(p.severity, 'Medium'),
    suggestedAction: str(p.suggestedAction),
    status: str(p.status, 'Open'),
    ownerId: p.ownerId || null
  };
}

// ---- Follow-up ------------------------------------------------------------
export function buildFollowup(p = {}) {
  return {
    id: p.id || nextId('FU-NEW'),
    useCaseId: p.useCaseId || null,
    nextStep: str(p.nextStep),
    ownerId: p.ownerId || null,
    dueDate: p.dueDate || null,
    motionType: str(p.motionType, 'Incubation'),
    status: str(p.status, 'Not started'),
    championIds: arr(p.championIds),
    outcomeNotes: str(p.outcomeNotes)
  };
}

// ---------------------------------------------------------------------------
// Build a complete, self-consistent DUMMY program from EMPTY — used by the
// test harness and the ?data=sample mode. Proves the whole model works
// end-to-end without any seed JSON.
// ---------------------------------------------------------------------------
export function buildSampleProgram() {
  resetSeq(1);
  const db = {
    agencies: [], people: [], events: [], patterns: [], accelerators: [],
    teams: [], calendar: [], improvements: [], followups: [], useCases: [], byId: {}
  };
  const add = (coll, rec) => { db[coll].push(rec); db.byId[rec.id] = rec; return rec; };

  // People
  const host = add('people', buildPerson({ id: 'PR-HOST', name: 'Dana Coyle', org: 'CSA', roleTitle: 'CSA Manager', hackathonRoles: ['Host'] }));
  const sponsor = add('people', buildPerson({ id: 'PR-SPON', name: 'Owen Pace', org: 'STU', roleTitle: 'STU Lead', hackathonRoles: ['Sponsor'], championCapability: ['Sponsor'] }));
  const coachA = add('people', buildPerson({ id: 'PR-CA', name: 'Mira Shah', email: 'mira@contoso.com', roleTitle: 'Cloud Solution Architect', hackathonRoles: ['Coach'], championCapability: ['Apps champion'] }));
  const coachB = add('people', buildPerson({ id: 'PR-CB', name: 'Leo Fenn', email: 'leo@contoso.com', roleTitle: 'Cloud Solution Architect', hackathonRoles: ['Coach'], championCapability: ['Data-AI champion'] }));
  const owner = add('people', buildPerson({ id: 'PR-OWN', name: 'Tess Vaughn', org: 'ATU', roleTitle: 'Account Technology Strategist' }));

  // Agencies
  const agA = add('agencies', buildAgency({ id: 'AG-A', name: 'Riverton Permits Office', shortName: 'RPO', type: 'City', jurisdiction: 'Riverton, CA', domain: 'Permitting', decisionMaker: { firstName: 'Ana', lastName: 'Cole', jobTitle: 'CIO', role: 'Economic Buyer', email: 'acole@riverton.example.gov' } }));
  const agB = add('agencies', buildAgency({ id: 'AG-B', name: 'State Benefits Agency', shortName: 'SBA', type: 'State', jurisdiction: 'State of Madison', domain: 'Benefits', decisionMaker: { firstName: 'Karl', lastName: 'Ng', jobTitle: 'Director', role: 'Champion', email: 'kng@benefits.example.gov' } }));

  // Pattern + accelerator
  const pat = add('patterns', buildPattern({ id: 'PAT-A', name: 'RAG over agency records', repeatability: 'High', solutionPlay: 'Azure AI', components: ['Azure OpenAI', 'Azure AI Search'] }));
  add('accelerators', buildAccelerator({ id: 'ACC-A', name: 'RAG Starter Kit', type: 'Repo template', patternId: pat.id }));
  pat.acceleratorIds = ['ACC-A'];

  // Event
  const ev = add('events', buildEvent({
    id: 'EV-A', name: 'Madison SLED AI Hackathon — 2026', startDate: '2026-05-04', endDate: '2026-05-05',
    location: 'Microsoft Technology Center, Madison', format: 'In-person', hostId: host.id,
    organizerIds: ['Dana Coyle <dana@contoso.com>'], technicalSupportTeam: ['Mira Shah <mira@contoso.com>', 'Leo Fenn <leo@contoso.com>'], partnerOrgs: ['Contoso'],
    numTeams: 2, numParticipants: 18, numSupportStaff: 5, agencyMix: [agA.id, agB.id],
    themes: ['Permitting', 'Benefits']
  }));

  // Teams
  const tA = add('teams', buildTeam({ id: 'T-A', name: 'Team Permit', eventId: ev.id, agencyId: agA.id, participants: ['A. Cole (RPO)'], csaIds: [coachA.id], managerId: host.id }));
  const tB = add('teams', buildTeam({ id: 'T-B', name: 'Team Benefits', eventId: ev.id, agencyId: agB.id, participants: ['K. Ng (SBA)'], csaIds: [coachB.id], managerId: host.id }));

  // Use cases — one strong (high), one weak (not ready, gated)
  const uc1 = add('useCases', buildUseCase({
    id: 'UC-A', title: 'Permit status assistant', eventId: ev.id, agencyId: agA.id, teamId: tA.id,
    inPipeline: true, businessProblem: 'Residents cannot see permit status.',
    proposedSolution: 'RAG assistant over the permit system.', beneficiaries: 'Residents, agents',
    industries: ['Permitting'], components: ['AI', 'Web App'], services: ['Azure OpenAI'], patternId: pat.id,
    businessValue: 'Deflects status calls.', estimatedImpact: 'High', impactMetric: '10k calls/yr',
    feasibility: 'High', reusability: 'High', execSponsorId: sponsor.id, champions: { apps: coachA.id, dataai: coachB.id },
    supportTeams: ['CSA'], nextStep: 'Scope a 2-week pilot.', ownerName: 'Tess Vaughn', ownerEmail: 'tess@contoso.com', csaIds: [coachA.id],
    scores: { realProblem: 3, businessValue: 3, aiTools: 2, feasibility: 3, demo: 2, ui: 2, repeatability: 3, playFit: 3, compliance: 2 }
  }));
  const uc2 = add('useCases', buildUseCase({
    id: 'UC-B', title: 'Benefits document extractor', eventId: ev.id, agencyId: agB.id, teamId: tB.id,
    businessProblem: 'Manual data entry from forms.', proposedSolution: 'Document intelligence pipeline.',
    beneficiaries: 'Caseworkers', industries: ['Benefits'], components: ['AI'], services: ['Document Intelligence'],
    feasibility: 'Medium', reusability: 'Medium', nextStep: 'Validate extraction accuracy.',
    scores: { realProblem: 2, businessValue: 2, aiTools: 2, feasibility: 0, demo: 2, ui: 1, repeatability: 2, playFit: 2, compliance: 1 }
  }));
  tA.useCaseIds = [uc1.id]; tB.useCaseIds = [uc2.id];

  // Winners (driven by score)
  ev.winners = [{ place: '1st Place', ucId: uc1.id, rationale: 'Strongest production potential and clear owner.' }];
  ev.winnerUseCaseIds = [uc1.id];

  // Retrospective + improvement + followup
  ev.retrospective = { whatWorkedWell: 'Strong sponsor turnout.', nextSteps: 'Lock the permit pilot.' };
  add('improvements', buildImprovement({ id: 'IMP-A', title: 'Provision data access at T-7', type: 'Repeat blocker', category: 'Technical', eventId: ev.id, severity: 'High', status: 'Open', ownerId: host.id }));
  add('followups', buildFollowup({ id: 'FU-A', useCaseId: uc1.id, nextStep: 'Scope a 2-week pilot.', ownerId: owner.id, dueDate: '2026-06-01', motionType: 'Pilot', status: 'In progress', championIds: [coachA.id] }));

  // Calendar (upcoming)
  add('calendar', buildCalendarEvent({ id: 'CAL-A', title: 'Austin SLED AI Hackathon', startDate: '2026-09-15', endDate: '2026-09-16', status: 'Confirmed', format: 'Hybrid', location: 'MTC Austin', themes: ['311'], organizerIds: [host.id] }));

  return db;
}
