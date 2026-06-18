// csvtest.js — END-TO-END test against the real on-disk CSV store.
// Flow: reset to BLANK → assert empty → build records via factory (simulating
// form capture) → SAVE to CSV on disk → RELOAD from CSV into a fresh db →
// assert the reloaded data is identical and fully wired. This is the
// "no seed data, stored in CSV, starting from blank" proof.
import { buildSampleProgram } from './factory.js';
import {
  dbToTables, tablesToDb, parseCsv, toCsv,
  loadCsvStore, saveCsvStore, resetCsvStore
} from './csvstore.js';

const out = document.getElementById('out');
const csvDump = document.getElementById('csvDump');
const results = [];
const bugs = [];
function ok(name, detail = '') { results.push({ name, ok: true, detail }); }
function fail(name, detail = '') { results.push({ name, ok: false, detail }); bugs.push(`${name} — ${detail}`); }
function check(name, cond, detail = '') { cond ? ok(name, detail) : fail(name, detail || 'assertion failed'); }

async function run() {
  let savedTables = null;
  try {
    // 1. Start blank.
    await resetCsvStore();
    const blank = await loadCsvStore();
    check('Store starts BLANK after reset', blank.useCases.length === 0 && blank.events.length === 0 && blank.agencies.length === 0,
      `agencies=${blank.agencies.length} events=${blank.events.length} useCases=${blank.useCases.length}`);

    // 2. "Enter" data — build a full program via the factory (same builders the forms use).
    const entered = buildSampleProgram();
    const counts = c => `${c.agencies.length}/${c.people.length}/${c.events.length}/${c.teams.length}/${c.useCases.length}`;

    // 3. Save to CSV on disk.
    savedTables = await saveCsvStore(entered);
    check('Saved CSV tables to disk', !!savedTables.HCLUseCases && !!savedTables.HCLAgencies, Object.keys(savedTables).join(', '));

    // 4. Reload from disk into a fresh db.
    const reloaded = await loadCsvStore();

    // 5. Round-trip integrity.
    check('Counts survive CSV round-trip',
      counts(reloaded) === counts(entered), `entered=${counts(entered)} reloaded=${counts(reloaded)} (A/P/E/T/UC)`);

    check('Every record re-indexed by id after reload',
      reloaded.useCases.every(u => reloaded.byId[u.id] === u) && reloaded.events.every(e => reloaded.byId[e.id] === e),
      `${Object.keys(reloaded.byId).length} ids`);

    // Relationships resolve.
    let dangling = [];
    reloaded.useCases.forEach(u => {
      if (u.eventId && !reloaded.byId[u.eventId]) dangling.push(`${u.id}.eventId`);
      if (u.agencyId && !reloaded.byId[u.agencyId]) dangling.push(`${u.id}.agencyId`);
      if (u.teamId && !reloaded.byId[u.teamId]) dangling.push(`${u.id}.teamId`);
    });
    reloaded.teams.forEach(t => {
      if (!reloaded.byId[t.eventId]) dangling.push(`${t.id}.eventId`);
      if (!reloaded.byId[t.agencyId]) dangling.push(`${t.id}.agencyId`);
    });
    check('No dangling foreign keys after reload', dangling.length === 0, dangling.join(', ') || 'all references resolve');

    // Scores / bands recomputed identically.
    const byId = id => entered.byId[id];
    let scoreDrift = [];
    reloaded.useCases.forEach(u => {
      const orig = byId(u.id);
      if (!orig) { scoreDrift.push(`${u.id} missing in source`); return; }
      if (u._score !== orig._score) scoreDrift.push(`${u.id} score ${orig._score}→${u._score}`);
      if (u._band.key !== orig._band.key) scoreDrift.push(`${u.id} band ${orig._band.key}→${u._band.key}`);
    });
    check('Scores & bands recompute identically from CSV', scoreDrift.length === 0, scoreDrift.join('; ') || 'stable');

    // Nested structures preserved (decisionMaker, champions, scores, retrospective).
    const ag = reloaded.byId['AG-A'];
    check('Agency decision-maker survives CSV', ag && ag.decisionMaker.email === 'acole@riverton.example.gov',
      ag ? `${ag.decisionMaker.firstName} ${ag.decisionMaker.lastName} <${ag.decisionMaker.email}>` : 'AG-A missing');

    const ucA = reloaded.byId['UC-A'];
    check('Use-case champions survive CSV', ucA && ucA.champions.apps === 'PR-CA' && ucA.champions.dataai === 'PR-CB',
      ucA ? `apps=${ucA.champions.apps} data=${ucA.champions.dataai}` : 'UC-A missing');
    check('Use-case 9 scores survive CSV', ucA && Object.keys(ucA.scores).length === 9 && ucA.scores.businessValue === 3,
      ucA ? JSON.stringify(ucA.scores) : 'UC-A missing');

    const evA = reloaded.byId['EV-A'];
    check('Event retrospective survives CSV', evA && evA.retrospective.whatWorkedWell === 'Strong sponsor turnout.',
      evA ? Object.keys(evA.retrospective).join(', ') : 'EV-A missing');
    check('Multi-value arrays survive CSV (agencyMix/themes)',
      evA && evA.agencyMix.length === 2 && evA.themes.length === 2, evA ? `mix=${evA.agencyMix.join('|')} themes=${evA.themes.join('|')}` : 'EV-A missing');

    // Winners + rationale round-trip.
    const w = evA && (evA.winners || [])[0];
    check('Winner place + rationale survive CSV', w && w.place === '1st Place' && /production potential/i.test(w.rationale),
      w ? `${w.place}: ${w.rationale}` : 'no winner');

    // 6. Pure parser round-trip (quoting / commas / newlines).
    const tricky = [{ A: 'plain', B: 'has, comma', C: 'has "quote"', D: 'line1\nline2' }];
    const rt = parseCsv(toCsv(tricky))[0];
    check('CSV escaping round-trips (comma/quote/newline)',
      rt.B === 'has, comma' && rt.C === 'has "quote"' && rt.D === 'line1\nline2',
      JSON.stringify(rt));

    // 7. Idempotency — load→save→load yields the same CSV bytes.
    const tables2 = dbToTables(reloaded);
    const same = Object.keys(savedTables).every(k => savedTables[k] === tables2[k]);
    check('Save is idempotent (stable CSV bytes)', same,
      same ? 'identical bytes' : 'CSV changed on re-save: ' + Object.keys(savedTables).filter(k => savedTables[k] !== tables2[k]).join(', '));

    // 8. Audit metadata + audit-log round-trip (mirrors SharePoint Created/Modified + audit list).
    const ucEdit = reloaded.byId['UC-A'];
    ucEdit.createdBy = 'Tester'; ucEdit.createdAt = '2026-01-01T10:00:00.000Z';
    ucEdit.modifiedBy = 'Editor'; ucEdit.modifiedAt = '2026-02-02T11:00:00.000Z';
    reloaded.audit = reloaded.audit || [];
    reloaded.audit.push({ id: 'AUD-T1', recordId: 'UC-A', recordType: 'Use case', recordTitle: ucEdit.title, action: 'Updated', summary: 'Test edit', by: 'Editor', at: '2026-02-02T11:00:00.000Z' });
    await saveCsvStore(reloaded);
    const reAudit = await loadCsvStore();
    const ucA2 = reAudit.byId['UC-A'];
    check('Audit metadata (created/modified) survives CSV',
      ucA2 && ucA2.createdBy === 'Tester' && ucA2.modifiedBy === 'Editor' && ucA2.modifiedAt === '2026-02-02T11:00:00.000Z',
      ucA2 ? `created by ${ucA2.createdBy}, modified by ${ucA2.modifiedBy} @ ${ucA2.modifiedAt}` : 'UC-A missing');
    check('Audit-log entries survive CSV',
      (reAudit.audit || []).some(a => a.id === 'AUD-T1' && a.recordId === 'UC-A' && a.action === 'Updated'),
      `${(reAudit.audit || []).length} log entries reloaded`);

  } catch (e) {
    fail('Harness error', e.message + (e.stack ? ' — ' + e.stack.split('\n')[1] : ''));
  }
  render(savedTables);
}

function render(tables) {
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  out.innerHTML = `
    <div class="summary ${failed ? 'fail' : 'pass'}">
      ${failed ? '✕' : '✓'} ${passed}/${results.length} end-to-end checks passed${failed ? ` · ${failed} failed` : ''}
    </div>
    ${bugs.length ? `<div class="bugs"><strong>Bugs found (${bugs.length}):</strong><ul>${bugs.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul></div>` : '<p class="muted">No bugs found — blank → capture → CSV → reload is clean.</p>'}
    <table>
      <thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead>
      <tbody>${results.map(r => `<tr class="${r.ok ? 'ok' : 'no'}"><td>${escapeHtml(r.name)}</td><td>${r.ok ? 'PASS' : 'FAIL'}</td><td>${escapeHtml(r.detail || '')}</td></tr>`).join('')}</tbody>
    </table>`;

  if (tables) {
    csvDump.innerHTML = `<h2>CSV written to <code>prototype/data-live/</code></h2>` +
      Object.keys(tables).map(name => `<details><summary>${name}.csv</summary><pre>${escapeHtml(tables[name])}</pre></details>`).join('');
  }
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

run();
