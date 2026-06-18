// sharepointstore.js — SharePoint Online persistence for the prototype.
//
// This is the production wiring: the same in-memory `db` that the CSV store
// reads/writes is here read from and written to SharePoint Lists via the
// same-origin REST API (/_api/web/lists/...). Because it talks to the site it
// is *hosted in* (see spconfig.resolveSiteUrl), the app is portable: deploy the
// files to any provisioned site and it targets that site automatically — no
// code change when moving from a personal site to the org site.
//
// One mapping layer: db <-> column rows is defined once in csvstore.js
// (dbToTables / rowMapToDb). This file only moves those string rows in and out
// of SharePoint, so the SharePoint columns stay in lockstep with the factory
// and the CSV self-tests. Every list column is Text/Note holding the same
// string values the CSV store uses, so there are no per-field type conversions.
import { dbToTables, parseCsv, rowMapToDb } from './csvstore.js';
import { resolveSiteUrl, listName, SP_CONFIG } from './spconfig.js';

// Logical list -> business-key column used to reconcile records on save.
const LISTS = [
  { name: 'HCLAgencies',     key: 'AgencyId' },
  { name: 'HCLPeople',       key: 'PersonId' },
  { name: 'HCLEvents',       key: 'EventId' },
  { name: 'HCLTeams',        key: 'TeamId' },
  { name: 'HCLUseCases',     key: 'UseCaseId' },
  { name: 'HCLPatterns',     key: 'PatternId' },
  { name: 'HCLAccelerators', key: 'AcceleratorId' },
  { name: 'HCLCalendar',     key: 'CalendarId' },
  { name: 'HCLImprovements', key: 'ImprovementId' },
  { name: 'HCLFollowups',    key: 'FollowupId' },
  { name: 'HCLWinners',      key: 'WinnerId' },
  { name: 'HCLAuditLog',     key: 'AuditId' }
];

// ---- REST helpers ---------------------------------------------------------
const JSON_HEADERS = { 'Accept': 'application/json;odata=nometadata' };

// Extract SharePoint's human-readable error text from a failed response body.
// SP returns the offending column / reason here (e.g. "Column 'Foo' does not
// exist"), which is what makes a 400/404 actually diagnosable.
async function spError(res, fallback) {
  let detail = '';
  try {
    const txt = await res.text();
    try {
      const j = JSON.parse(txt);
      detail = j?.error?.message?.value || j?.['odata.error']?.message?.value || j?.error_description || '';
    } catch { detail = txt.slice(0, 300); }
  } catch { /* ignore */ }
  return new Error(`${fallback}${detail ? ' — ' + detail : ''}`);
}

// Build the items endpoint for a logical list.
function itemsUrl(name) {
  return `${resolveSiteUrl()}/_api/web/lists/getbytitle('${encodeURIComponent(listName(name))}')/items`;
}

// Request a fresh form digest for write operations.
let digestCache = { value: '', expires: 0 };
async function getDigest() {
  const now = Date.now();
  if (digestCache.value && now < digestCache.expires) return digestCache.value;
  const res = await fetch(`${resolveSiteUrl()}/_api/contextinfo`, {
    method: 'POST', headers: JSON_HEADERS, credentials: 'same-origin'
  });
  if (!res.ok) throw new Error(`Could not get SharePoint form digest (${res.status}). Are you signed in to the site?`);
  const j = await res.json();
  const secs = Number(j.FormDigestTimeoutSeconds || 1800);
  digestCache = { value: j.FormDigestValue, expires: now + (secs - 60) * 1000 };
  return digestCache.value;
}

// GET every item from a list, following SharePoint paging.
async function getAllItems(name, select) {
  const sel = select && select.length ? `?$select=${select.map(encodeURIComponent).join(',')}&$top=${SP_CONFIG.pageSize}` : `?$top=${SP_CONFIG.pageSize}`;
  let url = `${itemsUrl(name)}${sel}`;
  const out = [];
  while (url) {
    const res = await fetch(url, { headers: JSON_HEADERS, credentials: 'same-origin' });
    if (!res.ok) {
      if (res.status === 404) throw new Error(`List "${listName(name)}" was not found. Run provision-lists.ps1 on this site first.`);
      throw await spError(res, `Failed to read "${listName(name)}" (${res.status}).`);
    }
    const j = await res.json();
    (j.value || []).forEach(it => out.push(it));
    url = j['odata.nextLink'] || j['@odata.nextLink'] || '';
  }
  return out;
}

// Run an array of async task factories with bounded concurrency.
async function runPooled(tasks, limit = 4) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

async function createItem(name, fields, digest) {
  const res = await fetch(itemsUrl(name), {
    method: 'POST', credentials: 'same-origin',
    headers: { ...JSON_HEADERS, 'Content-Type': 'application/json;odata=nometadata', 'X-RequestDigest': digest },
    body: JSON.stringify(fields)
  });
  if (!res.ok) throw await spError(res, `Create in "${listName(name)}" failed (${res.status}).`);
  return res;
}

async function updateItem(name, id, fields, digest) {
  const res = await fetch(`${itemsUrl(name)}(${id})`, {
    method: 'POST', credentials: 'same-origin',
    headers: {
      ...JSON_HEADERS, 'Content-Type': 'application/json;odata=nometadata',
      'X-RequestDigest': digest, 'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*'
    },
    body: JSON.stringify(fields)
  });
  if (!res.ok) throw await spError(res, `Update in "${listName(name)}" failed (${res.status}).`);
  return res;
}

async function deleteItem(name, id, digest) {
  const res = await fetch(`${itemsUrl(name)}(${id})`, {
    method: 'POST', credentials: 'same-origin',
    headers: { ...JSON_HEADERS, 'X-RequestDigest': digest, 'X-HTTP-Method': 'DELETE', 'IF-MATCH': '*' }
  });
  if (!res.ok) throw new Error(`Delete in "${listName(name)}" failed (${res.status}).`);
  return res;
}

// ---- load -----------------------------------------------------------------
// Read all lists and rebuild the db through the shared factory mapping.
export async function loadSharePointStore() {
  const rowMap = {};
  await Promise.all(LISTS.map(async ({ name }) => {
    const items = await getAllItems(name);
    // Normalise nulls to '' so the factory builders behave exactly as with CSV.
    rowMap[name] = items.map(it => {
      const row = {};
      for (const k of Object.keys(it)) row[k] = it[k] == null ? '' : it[k];
      return row;
    });
  }));
  return rowMapToDb(rowMap);
}

// ---- save -----------------------------------------------------------------
// Reconcile every list to match the current db: create new records, update
// changed ones (matched by business key), and remove records deleted in-app.
export async function saveSharePointStore(db) {
  const tables = dbToTables(db);          // reuse the exact CSV column mapping
  const digest = await getDigest();
  for (const { name, key } of LISTS) {
    const rows = parseCsv(tables[name] || '');
    await reconcileList(name, key, rows, digest);
  }
  return true;
}

async function reconcileList(name, key, rows, digest) {
  const existing = await getAllItems(name, ['Id', key]);
  const idByKey = new Map();
  existing.forEach(it => { const k = it[key]; if (k != null && k !== '') idByKey.set(String(k), it.Id); });

  const seen = new Set();
  const tasks = [];

  for (const row of rows) {
    const k = String(row[key] ?? '');
    if (!k) continue;
    seen.add(k);
    // Every list requires Title; fall back to the business key where the model
    // has no Title column (HCLWinners / HCLAuditLog).
    const fields = { ...row };
    if (fields.Title == null || fields.Title === '') fields.Title = row.Title || k;
    // Created/Modified are read-only SharePoint built-in fields; the app keeps
    // its own CreatedBy/ModifiedBy text columns. Writing the built-ins fails
    // with HTTP 400, so drop them from the REST payload.
    delete fields.Created;
    delete fields.Modified;
    const id = idByKey.get(k);
    if (id) tasks.push(() => updateItem(name, id, fields, digest));
    else tasks.push(() => createItem(name, fields, digest));
  }

  // Records present in SharePoint but no longer in the app are removed.
  for (const [k, id] of idByKey) {
    if (!seen.has(k)) tasks.push(() => deleteItem(name, id, digest));
  }

  await runPooled(tasks, 4);
}

// ---- health check ---------------------------------------------------------
// Quick probe used by data.js to give a friendly message if the site isn't
// reachable or the lists haven't been provisioned yet.
export async function probeSharePoint() {
  const res = await fetch(`${itemsUrl('HCLEvents')}?$top=1`, { headers: JSON_HEADERS, credentials: 'same-origin' });
  if (res.status === 404) throw new Error('SharePoint lists are not provisioned on this site yet. Run provision-lists.ps1 first.');
  if (!res.ok) throw new Error(`SharePoint site is not reachable (${res.status}).`);
  return true;
}

// ---- admin / authorization ------------------------------------------------
// Decide whether the signed-in user may perform destructive (permanent delete)
// actions. Authoritative in production: the live SharePoint site, not a URL
// flag. A user qualifies if they are a site collection administrator OR a member
// of SP_CONFIG.adminGroup. Fails closed (returns false) on any error so a
// transient failure never silently grants delete rights.
export async function isCurrentUserAdmin() {
  try {
    // Site collection administrators always qualify.
    const meRes = await fetch(`${resolveSiteUrl()}/_api/web/currentuser?$select=IsSiteAdmin`, { headers: JSON_HEADERS, credentials: 'same-origin' });
    if (meRes.ok) {
      const me = await meRes.json();
      if (me && me.IsSiteAdmin === true) return true;
    }
    const groupName = (SP_CONFIG.adminGroup || '').trim();
    if (!groupName) return false;
    // Otherwise check membership of the configured admin group.
    const res = await fetch(`${resolveSiteUrl()}/_api/web/currentuser/groups?$select=Title&$top=200`, { headers: JSON_HEADERS, credentials: 'same-origin' });
    if (!res.ok) return false;
    const j = await res.json();
    const groups = j.value || [];
    const target = groupName.toLowerCase();
    return groups.some(g => String(g.Title || '').toLowerCase() === target);
  } catch {
    return false;
  }
}
