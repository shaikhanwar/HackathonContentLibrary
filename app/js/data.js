// data.js — loads all seed JSON, builds lookups, and exposes helpers.
import { computeBand, computeFlags, rounded } from './scoring.js';
import { buildSampleProgram } from './factory.js';
import { loadCsvStore, saveCsvStore, resetCsvStore } from './csvstore.js';
import { loadSharePointStore, saveSharePointStore, isCurrentUserAdmin } from './sharepointstore.js';
import { inSharePointPage } from './spconfig.js';

const FILES = [
  'agencies', 'people', 'events', 'patterns',
  'teams', 'calendar', 'improvements', 'followups', 'usecases'
];

export const db = {
  agencies: [], people: [], events: [], patterns: [], accelerators: [],
  teams: [], calendar: [], improvements: [], followups: [], useCases: [],
  // audit trail (mirrors a SharePoint audit / version-history list)
  audit: [],
  // index maps
  byId: {}
};

// Replace db contents in place (keeps the same exported object reference).
function assign(src) {
  for (const k of ['agencies', 'people', 'events', 'patterns', 'accelerators', 'teams', 'calendar', 'improvements', 'followups', 'useCases', 'byId']) {
    db[k] = src[k];
  }
  db.audit = src.audit || [];
  return db;
}

// Data source can be overridden with ?data=sample (factory-built dummy program),
// ?data=empty (no records), or ?data=sharepoint (live SharePoint lists). Default
// loads the seed JSON. When the app is hosted inside a SharePoint page it also
// auto-selects SharePoint mode so the deployed copy "just works". This lets us
// prove the app is fully form/factory-driven and does not rely on seed data.
function dataMode() {
  let m = '';
  try { m = new URLSearchParams(location.search).get('data') || ''; } catch { /* ignore */ }
  if (!m && inSharePointPage()) return 'sharepoint';   // deployed-in-SharePoint default
  return m;
}

// Whether the app is running against the on-disk CSV store.
export const isCsvMode = () => dataMode() === 'csv';
// Whether the app is running against live SharePoint lists.
export const isSharePointMode = () => dataMode() === 'sharepoint';
// Any backend that persists edits (vs. seed/sample/empty read-only modes).
export const isLiveMode = () => isCsvMode() || isSharePointMode();

// Persist the current in-memory db to the active backend (no-op unless a live
// backend is selected). Routes to CSV or SharePoint based on the data mode.
let persistTimer = null;
// Optional listeners notified after every persist so the UI can surface the
// outcome (e.g. a toast on failure). Kept here so data.js stays UI-agnostic.
const persistListeners = [];
export function onPersist(fn) { if (typeof fn === 'function') persistListeners.push(fn); }
function notifyPersist(ok, error) { for (const fn of persistListeners) { try { fn(ok, error); } catch { /* ignore */ } } }
export function persist() {
  if (isSharePointMode()) {
    return saveSharePointStore(db)
      .then(() => { notifyPersist(true, null); return true; })
      .catch(err => { console.error('SharePoint persist failed', err); notifyPersist(false, err); return false; });
  }
  if (isCsvMode()) {
    return saveCsvStore(db)
      .then(() => { notifyPersist(true, null); return true; })
      .catch(err => { console.error('CSV persist failed', err); notifyPersist(false, err); return false; });
  }
  return Promise.resolve(false);
}
// Debounced variant for rapid successive mutations.
export function persistSoon() {
  if (!isLiveMode()) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persist(), 250);
}
export function resetCsv() { return resetCsvStore(); }

// Resolve whether the signed-in user may perform destructive (permanent delete)
// actions. Only meaningful in SharePoint mode, where the live site decides via
// site-admin status or admin-group membership; every other mode returns false
// so the UI can fall back to its local dev override (?admin=1).
export function checkAdminAccess() {
  if (!isSharePointMode()) return Promise.resolve(false);
  return isCurrentUserAdmin();
}

export async function loadData() {
  const mode = dataMode();
  if (mode === 'sample') return assign(buildSampleProgram());
  if (mode === 'sharepoint') return assign(await loadSharePointStore());
  if (mode === 'csv') return assign(await loadCsvStore());
  if (mode === 'empty') {
    return assign({
      agencies: [], people: [], events: [], patterns: [], accelerators: [],
      teams: [], calendar: [], improvements: [], followups: [], useCases: [], byId: {}, audit: []
    });
  }
  const results = await Promise.all(
    FILES.map(f => fetch(`data/${f}.json`).then(r => {
      if (!r.ok) throw new Error(`Failed to load data/${f}.json (${r.status})`);
      return r.json();
    }))
  );
  const [agencies, people, events, patterns, teams, calendar, improvements, followups, usecases] = results;

  db.agencies = agencies.agencies;
  db.people = people.people;
  db.events = events.events;
  db.patterns = patterns.patterns;
  db.accelerators = patterns.accelerators || [];
  db.teams = teams.teams;
  db.calendar = calendar.calendar;
  db.improvements = improvements.improvements;
  db.followups = followups.followups;
  db.useCases = usecases.useCases;

  // Build a global id index.
  const index = {};
  for (const coll of [db.agencies, db.people, db.events, db.patterns, db.accelerators, db.teams, db.calendar, db.improvements, db.followups, db.useCases]) {
    for (const item of coll) index[item.id] = item;
  }
  db.byId = index;

  // Decorate use cases with computed scoring.
  for (const uc of db.useCases) {
    uc._score = rounded(uc.scores);
    uc._band = computeBand(uc);
    uc._flags = computeFlags(uc);
  }
  return db;
}

// ---- Lookup helpers -------------------------------------------------------
export const personName = id => db.byId[id]?.name || (id || '—');
export const agency = id => db.byId[id] || null;
export const agencyName = id => db.byId[id]?.name || '—';
export const event = id => db.byId[id] || null;
export const eventName = id => db.byId[id]?.name || '—';
export const team = id => db.byId[id] || null;
export const pattern = id => db.byId[id] || null;
export const patternName = id => db.byId[id]?.name || '—';

export const useCasesForEvent = eventId => db.useCases.filter(u => u.eventId === eventId);
export const useCasesForAgency = agencyId => db.useCases.filter(u => u.agencyId === agencyId);
export const useCasesForPattern = patternId => db.useCases.filter(u => u.patternId === patternId);
export const followupFor = ucId => db.followups.find(f => f.useCaseId === ucId) || null;
export const teamsForEvent = eventId => db.teams.filter(t => t.eventId === eventId);
export const improvementsForEvent = eventId => db.improvements.filter(i => i.eventId === eventId);

// ---- Aggregate metrics for dashboards ------------------------------------
export function programMetrics() {
  const ucs = db.useCases;
  const high = ucs.filter(u => u._band.key === 'high');
  const incubation = ucs.filter(u => u._band.key === 'incubation');
  const prodCandidates = ucs.filter(u => u.inPipeline);
  const noOwner = ucs.filter(u => u.inPipeline && !u.ownerName && !u.ownerEmail);
  return {
    events: db.events.length,
    useCases: ucs.length,
    high: high.length,
    incubation: incubation.length,
    prodCandidates: prodCandidates.length,
    noOwner: noOwner.length,
    upcoming: db.calendar.length,
    patterns: db.patterns.length
  };
}

export function eventViability() {
  return db.events.map(ev => {
    const ucs = useCasesForEvent(ev.id);
    return {
      event: ev,
      total: ucs.length,
      high: ucs.filter(u => u._band.key === 'high').length,
      prodCandidates: ucs.filter(u => u.inPipeline).length,
      followups: db.followups.filter(f => ucs.some(u => u.id === f.useCaseId)).length
    };
  }).sort((a, b) => b.high - a.high);
}

export function csaLeaderboard() {
  const counts = {};
  for (const uc of db.useCases) {
    for (const id of uc.csaIds || []) {
      counts[id] = (counts[id] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([id, count]) => ({ id, name: personName(id), count }))
    .sort((a, b) => b.count - a.count);
}

export function topBlockers() {
  return db.improvements
    .filter(i => i.type === 'Repeat blocker' || i.severity === 'High')
    .sort((a, b) => (b.severity === 'High' ? 1 : 0) - (a.severity === 'High' ? 1 : 0));
}
