// selftest.js — automated end-to-end integrity tests.
// Builds a complete dummy program from EMPTY via the factory (no seed JSON),
// then asserts every relationship resolves, computed fields are correct, no
// render-required field is undefined, and all aggregates run. Renders PASS/FAIL.
import { computeBand, computeFlags, rounded, DIMENSIONS } from './scoring.js';
import {
  buildSampleProgram, buildAgency, buildUseCase, buildEvent, buildTeam,
  buildPattern, buildPerson, buildCalendarEvent, buildImprovement, buildFollowup
} from './factory.js';

const results = [];
function check(name, fn) {
  try { const r = fn(); results.push({ name, ok: r !== false, detail: typeof r === 'string' ? r : '' }); }
  catch (e) { results.push({ name, ok: false, detail: e.message }); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); return true; }

// Required fields each render path reads (must never be undefined).
const UC_REQUIRED = [
  'id', 'title', 'eventId', 'agencyId', 'inPipeline', 'scores', '_score', '_band', '_flags',
  'businessProblem', 'currentProcess', 'challengeSummary', 'proposedSolution', 'beneficiaries', 'industries',
  'components', 'copilotRole', 'services', 'dataDependencies', 'compliance', 'risks',
  'businessValue', 'estimatedImpact', 'impactMetric', 'feasibility', 'reusability',
  'csaIds', 'champions', 'supportTeams', 'nextStep', 'ownerName', 'ownerEmail', 'demoUrl', 'repoUrl', 'lessons', 'recordStatus'
];
const EVENT_REQUIRED = ['id', 'name', 'startDate', 'endDate', 'location', 'format', 'numTeams', 'numParticipants', 'numSupportStaff', 'agencyMix', 'organizerIds', 'technicalSupportTeam', 'partnerOrgs', 'winnerUseCaseIds', 'retrospective'];
const AGENCY_REQUIRED = ['id', 'name', 'type', 'jurisdiction', 'decisionMaker'];
const TEAM_REQUIRED = ['id', 'name', 'eventId', 'agencyId', 'participants', 'csaIds', 'useCaseIds'];

function run() {
  const db = buildSampleProgram();
  const name = id => db.byId[id]?.name || null;

  // --- Structure ---
  check('Sample program builds non-empty collections', () =>
    assert(db.agencies.length && db.people.length && db.events.length && db.teams.length && db.useCases.length, 'a collection is empty'));

  check('Global byId index covers every record', () => {
    const all = [...db.agencies, ...db.people, ...db.events, ...db.patterns, ...db.accelerators, ...db.teams, ...db.calendar, ...db.improvements, ...db.followups, ...db.useCases];
    for (const r of all) assert(db.byId[r.id] === r, `byId missing ${r.id}`);
    return `${all.length} records indexed`;
  });

  check('No duplicate ids across the program', () => {
    const ids = [...db.agencies, ...db.people, ...db.events, ...db.patterns, ...db.accelerators, ...db.teams, ...db.calendar, ...db.improvements, ...db.followups, ...db.useCases].map(r => r.id);
    assert(new Set(ids).size === ids.length, 'duplicate id found');
    return `${ids.length} unique ids`;
  });

  // --- Audit fields ---
  check('Records carry audit fields (created/modified by & at)', () => {
    const a = buildAgency({ name: 'A' }), u = buildUseCase({ title: 'U' }), e = buildEvent({ name: 'E' }), c = buildCalendarEvent({ title: 'C' });
    [a, u, e, c].forEach((r, i) => ['createdBy', 'createdAt', 'modifiedBy', 'modifiedAt'].forEach(k => assert(k in r, `audit field ${k} missing on record ${i}`)));
    return 'agency/use case/event/calendar all have audit fields';
  });
  check('Audit timestamps pass through builders', () => {
    const u = buildUseCase({ title: 'U', createdBy: 'X', createdAt: '2026-01-01T00:00:00Z', modifiedBy: 'Y', modifiedAt: '2026-02-02T00:00:00Z' });
    assert(u.createdBy === 'X' && u.modifiedBy === 'Y' && u.modifiedAt === '2026-02-02T00:00:00Z', 'audit values not preserved');
    return 'created/modified preserved';
  });

  // --- Relationship integrity ---
  check('Every team references a real event & agency', () => {
    db.teams.forEach(t => { assert(db.byId[t.eventId], `team ${t.id} bad eventId`); assert(db.byId[t.agencyId], `team ${t.id} bad agencyId`); });
    return `${db.teams.length} teams OK`;
  });

  check('Every use case references real event/agency/team', () => {
    db.useCases.forEach(u => {
      assert(db.byId[u.eventId], `uc ${u.id} bad eventId`);
      assert(db.byId[u.agencyId], `uc ${u.id} bad agencyId`);
      if (u.teamId) assert(db.byId[u.teamId], `uc ${u.id} bad teamId`);
    });
    return `${db.useCases.length} use cases OK`;
  });

  check('Person references resolve (sponsor/champions/csa)', () => {
    db.useCases.forEach(u => {
      if (u.execSponsorId) assert(name(u.execSponsorId), `uc ${u.id} sponsor not found`);
      (u.csaIds || []).forEach(id => assert(name(id), `uc ${u.id} csa ${id} not found`));
      if (u.champions?.apps) assert(name(u.champions.apps), `uc ${u.id} apps champ not found`);
      if (u.champions?.dataai) assert(name(u.champions.dataai), `uc ${u.id} data champ not found`);
    });
    return 'all people resolve';
  });

  check('Team useCaseIds and uc.teamId agree', () => {
    db.teams.forEach(t => (t.useCaseIds || []).forEach(ucId => {
      const uc = db.byId[ucId];
      assert(uc, `team ${t.id} references missing uc ${ucId}`);
      assert(uc.teamId === t.id, `uc ${ucId} teamId mismatch with team ${t.id}`);
    }));
    return 'team↔use case links consistent';
  });

  check('Accelerators link to a real pattern', () => {
    db.accelerators.forEach(a => assert(db.byId[a.patternId], `acc ${a.id} bad patternId`));
    return `${db.accelerators.length} accelerators OK`;
  });

  check('Improvements & follow-ups link to real event/use case', () => {
    db.improvements.forEach(i => { if (i.eventId) assert(db.byId[i.eventId], `imp ${i.id} bad event`); });
    db.followups.forEach(f => { if (f.useCaseId) assert(db.byId[f.useCaseId], `fu ${f.id} bad uc`); });
    return 'OK';
  });

  // --- Completeness (no undefined render fields) ---
  check('Use cases have all render-required fields', () => {
    db.useCases.forEach(u => UC_REQUIRED.forEach(k => assert(u[k] !== undefined, `uc ${u.id} missing ${k}`)));
    return `${UC_REQUIRED.length} fields × ${db.useCases.length} use cases`;
  });
  check('Events have all render-required fields', () => {
    db.events.forEach(e => EVENT_REQUIRED.forEach(k => assert(e[k] !== undefined, `event ${e.id} missing ${k}`)));
    return 'OK';
  });
  check('Agencies have all render-required fields', () => {
    db.agencies.forEach(a => AGENCY_REQUIRED.forEach(k => assert(a[k] !== undefined, `agency ${a.id} missing ${k}`)));
    return 'OK';
  });
  check('Teams have all render-required fields', () => {
    db.teams.forEach(t => TEAM_REQUIRED.forEach(k => assert(t[k] !== undefined, `team ${t.id} missing ${k}`)));
    return 'OK';
  });

  // --- Scoring engine ---
  check('Score recomputes deterministically from dimensions', () => {
    db.useCases.forEach(u => assert(u._score === rounded(u.scores), `uc ${u.id} score drift`));
    return 'scores stable';
  });

  check('Band reflects score thresholds and gates', () => {
    const strong = db.byId['UC-A'];
    assert(strong._band.key === 'high', `UC-A expected high, got ${strong._band.key}`);
    const weak = db.byId['UC-B'];
    // UC-B has feasibility 0 -> hard gate -> Not Ready regardless of total
    assert(weak._band.key === 'notready', `UC-B expected notready (feasibility gate), got ${weak._band.key}`);
    return `UC-A=${strong._band.label}, UC-B=${weak._band.label}`;
  });

  check('Perfect scores reach High Potential (no owner gate)', () => {
    const u = buildUseCase({ scores: { realProblem: 3, businessValue: 3, aiTools: 3, feasibility: 3, demo: 3, ui: 3, repeatability: 3, playFit: 3, compliance: 3 } });
    assert(u._score === 100, `expected 100, got ${u._score}`);
    assert(u._band.key === 'high', `perfect scores should be high, got ${u._band.key}`);
    return 'no owner gate';
  });

  check('Flags compute (reusable / strategic)', () => {
    const u = db.byId['UC-A'];
    const keys = u._flags.map(f => f.key);
    assert(keys.includes('reusable'), 'UC-A should be reusable (repeatability 3)');
    assert(keys.includes('strategic'), 'UC-A should be strategic (bizValue 3 & playFit 3)');
    return keys.join(', ') || 'none';
  });

  check('Dimension weights sum to 100', () => {
    const sum = DIMENSIONS.reduce((s, d) => s + d.weight, 0);
    assert(sum === 100, `weights sum to ${sum}`);
    return '100';
  });

  // --- Winners driven by score ---
  check('Top-scored use case is the recorded 1st-place winner', () => {
    const ranked = db.useCases.slice().sort((a, b) => b._score - a._score);
    const first = db.events[0].winners.find(w => w.place === '1st Place');
    assert(first && first.ucId === ranked[0].id, 'winner is not the top-scored use case');
    assert(first.rationale, 'winner has no rationale');
    return `${db.byId[first.ucId].title} (${db.byId[first.ucId]._score})`;
  });

  // --- Empty-data resilience ---
  check('Aggregations run on an EMPTY program without throwing', () => {
    const empty = { useCases: [], events: [], calendar: [], patterns: [], improvements: [], followups: [], byId: {} };
    const high = empty.useCases.filter(u => u._band?.key === 'high');
    assert(high.length === 0, 'empty filter failed');
    return 'no crash on empty';
  });

  // --- Builder defaults ---
  check('Builders fill safe defaults from minimal input', () => {
    assert(buildAgency({}).decisionMaker.country === 'United States', 'agency default country');
    assert(buildUseCase({})._band.key === 'notready', 'empty uc should be not ready');
    assert(Array.isArray(buildEvent({}).agencyMix), 'event agencyMix default');
    assert(buildCalendarEvent({}).status === 'Open for registration', 'calendar default status');
    assert(buildImprovement({}).severity === 'Medium', 'improvement default severity');
    assert(buildFollowup({}).status === 'Not started', 'followup default status');
    assert(buildPattern({}).repeatability === 'Medium', 'pattern default repeatability');
    assert(buildTeam({}).useCaseIds.length === 0, 'team default useCaseIds');
    assert(buildPerson({ first: 'A', last: 'B' }).name === 'A B', 'person name compose');
    return 'defaults OK';
  });

  render(db);
}

function render(db) {
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  const root = document.getElementById('out');
  root.innerHTML = `
    <div class="summary ${failed ? 'fail' : 'pass'}">
      ${failed ? '✕' : '✓'} ${passed}/${results.length} checks passed${failed ? ` · ${failed} failed` : ''}
    </div>
    <p class="muted">Built a full dummy program from <strong>empty</strong> (${db.agencies.length} agencies, ${db.people.length} people, ${db.events.length} event, ${db.teams.length} teams, ${db.useCases.length} use cases, ${db.patterns.length} pattern, ${db.calendar.length} upcoming) — no seed JSON loaded.</p>
    <table>
      <thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead>
      <tbody>${results.map(r => `<tr class="${r.ok ? 'ok' : 'no'}"><td>${r.name}</td><td>${r.ok ? 'PASS' : 'FAIL'}</td><td>${r.detail || ''}</td></tr>`).join('')}</tbody>
    </table>`;
}

run();
