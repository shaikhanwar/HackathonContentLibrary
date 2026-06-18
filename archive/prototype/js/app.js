// app.js — hash router + page renderers for the Hackathon Content Library.
import {
  loadData, db, personName, agency, agencyName, event, eventName, team,
  pattern, patternName, useCasesForEvent, useCasesForAgency, useCasesForPattern,
  followupFor, teamsForEvent, improvementsForEvent, programMetrics,
  eventViability, csaLeaderboard, topBlockers,
  isCsvMode, persist, persistSoon, resetCsv, isSharePointMode, isLiveMode, onPersist, checkAdminAccess
} from './data.js';
import { DIMENSIONS } from './scoring.js';
import {
  buildAgency, buildPerson, buildEvent, buildTeam, buildUseCase,
  buildPattern, buildAccelerator, buildCalendarEvent, buildImprovement, decorate as factoryDecorate
} from './factory.js';

const app = document.getElementById('app');

// ---- Small DOM helpers ----------------------------------------------------
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
function toast(msg) {
  const t = el(`<div class="toast">${esc(msg)}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ---- Save-failure banner --------------------------------------------------
// Shown only when an autosave fails, so silent data loss is impossible. Sticks
// until the next successful save (or manual retry/dismiss).
function showSaveError(err) {
  const reason = err && err.message ? err.message : 'Unknown error.';
  let bar = document.getElementById('saveError');
  if (!bar) {
    bar = el(`<div id="saveError" class="save-error" role="alert">
      <span class="save-error-icon">⚠</span>
      <span class="save-error-text"></span>
      <span class="save-error-actions">
        <button class="btn tiny" id="saveRetry">Retry save</button>
        <button class="btn tiny ghost" id="saveDismiss">Dismiss</button>
      </span>
    </div>`);
    document.body.appendChild(bar);
    bar.querySelector('#saveRetry').onclick = async () => {
      bar.querySelector('.save-error-text').textContent = 'Retrying…';
      const ok = await persist();
      if (ok) toast('Saved to SharePoint.');
    };
    bar.querySelector('#saveDismiss').onclick = () => clearSaveError();
  }
  bar.querySelector('.save-error-text').innerHTML =
    `<strong>Changes not saved.</strong> ${esc(reason)} Your edits are still on screen — fix the issue and click Retry.`;
}
function clearSaveError() { document.getElementById('saveError')?.remove(); }


// ---- CSV export -----------------------------------------------------------
// Quote a value for CSV: wrap in quotes when it contains a comma, quote, or
// newline, and double any embedded quotes (RFC 4180).
const csvCell = (v) => {
  const s = Array.isArray(v) ? v.join('; ') : String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// Build a CSV string from a header row + array-of-arrays, then trigger a
// download. The UTF-8 BOM keeps Excel from mangling accented / em-dash chars.
function downloadCsv(filename, headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  for (const r of rows) lines.push(r.map(csvCell).join(','));
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const fileStamp = () => new Date().toISOString().slice(0, 10);
const slug = (s) => String(s || 'export').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'export';

// One shared column map so the Use Cases, Pipeline, and Hackathon-report
// exports all produce the same enriched, relationship-resolved rows.
const UC_EXPORT_COLUMNS = [
  ['Use Case ID', uc => uc.id],
  ['Title', uc => uc.title],
  ['Hackathon', uc => eventName(uc.eventId)],
  ['Hackathon Start', uc => event(uc.eventId)?.startDate || ''],
  ['Hackathon Location', uc => event(uc.eventId)?.location || ''],
  ['Agency', uc => agencyName(uc.agencyId)],
  ['Team', uc => team(uc.teamId)?.name || ''],
  ['In Pipeline', uc => uc.inPipeline ? 'Yes' : 'No'],
  ['Score', uc => uc._score],
  ['Band', uc => uc._band?.label || ''],
  ['Owner Name', uc => uc.ownerName || ''],
  ['Owner Email', uc => uc.ownerEmail || ''],
  ['Feasibility', uc => uc.feasibility || ''],
  ['Pattern', uc => uc.patternId ? patternName(uc.patternId) : ''],
  ['Business Problem', uc => uc.businessProblem || ''],
  ['Proposed Solution', uc => uc.proposedSolution || ''],
  ['Business Value', uc => uc.businessValue || ''],
  ['Estimated Impact', uc => uc.estimatedImpact || ''],
  ['Impact Metric', uc => uc.impactMetric || ''],
  ['Beneficiaries', uc => uc.beneficiaries || ''],
  ['Industries', uc => uc.industries || []],
  ['Components', uc => uc.components || []],
  ['Services', uc => uc.services || []],
  ['Copilot Role', uc => uc.copilotRole || ''],
  ['Data Dependencies', uc => uc.dataDependencies || ''],
  ['Compliance', uc => uc.compliance || ''],
  ['Risks', uc => uc.risks || ''],
  ['Reusability', uc => uc.reusability || ''],
  ['Exec Sponsor', uc => uc.execSponsorId ? personName(uc.execSponsorId) : ''],
  ['Champion (Apps)', uc => uc.champions?.apps ? personName(uc.champions.apps) : ''],
  ['Champion (Data/AI)', uc => uc.champions?.dataai ? personName(uc.champions.dataai) : ''],
  ['Next Step', uc => uc.nextStep || ''],
  ['Demo URL', uc => uc.demoUrl && uc.demoUrl !== '#' ? uc.demoUrl : ''],
  ['Repo URL', uc => uc.repoUrl && uc.repoUrl !== '#' ? uc.repoUrl : ''],
  ['Record Status', uc => uc.recordStatus || '']
];

// Export a list of use cases as an enriched CSV using the shared column map.
function exportUseCases(list, filename) {
  if (!list || !list.length) { toast('Nothing to export.'); return; }
  const headers = UC_EXPORT_COLUMNS.map(c => c[0]);
  const rows = list.map(uc => UC_EXPORT_COLUMNS.map(c => c[1](uc)));
  downloadCsv(filename, headers, rows);
  toast(`Exported ${list.length} use case${list.length === 1 ? '' : 's'} to CSV.`);
}


function bandBadge(b) { return `<span class="badge ${b.key}">${b.emoji} ${esc(b.label)} · ${b.score}</span>`; }
function flagChips(flags) { return flags.map(f => `<span class="chip ${f.tone}">${f.emoji} ${esc(f.label)}</span>`).join(''); }

// ---- Persistence-aware microcopy ------------------------------------------
// Capture forms write to the in-memory db and call persistSoon(), which saves
// to the live backend when one is active. These helpers keep the on-screen
// wording truthful for the current mode (SharePoint / CSV / local demo).
const savedNote = () => isSharePointMode() ? 'Saved to SharePoint.'
  : isCsvMode() ? 'Saved to the CSV store.'
  : 'Demo mode — not saved.';
const formPersistHint = () => isSharePointMode() ? 'Saves to the SharePoint lists on this site.'
  : isCsvMode() ? 'Saves to the local CSV store.'
  : 'Demo mode — changes are kept in memory for this session only.';

// ---- Owner & staff helpers ------------------------------------------------
// The production owner is free text (name + email), assigned at the pipeline step.
const hasOwner = (uc) => !!(uc.ownerName || uc.ownerEmail);
const ownerDisplay = (uc) => uc.ownerName ? (uc.ownerEmail ? `${uc.ownerName} <${uc.ownerEmail}>` : uc.ownerName) : (uc.ownerEmail || '');
// A use case awaits an owner once it is in the pipeline but no owner is set.
const needsPipelineOwner = (uc) => uc.inPipeline && !hasOwner(uc);
// Event staff (organizers / technical support) are free-text "First Last <email>"
// strings. Seed data may still hold person ids — resolve those gracefully.
const staffLabel = (v) => db.byId[v] ? personName(v) : String(v ?? '');
function parseStaff(v) {
  const s = String(v ?? '').trim();
  const m = s.match(/^(.*?)\s*<([^>]*)>\s*$/);
  const name = m ? m[1].trim() : (db.byId[s] ? personName(s) : s);
  const email = m ? m[2].trim() : '';
  const sp = name.lastIndexOf(' ');
  return { first: sp > 0 ? name.slice(0, sp) : name, last: sp > 0 ? name.slice(sp + 1) : '', email };
}
function joinStaff(first, last, email) {
  const name = [String(first || '').trim(), String(last || '').trim()].filter(Boolean).join(' ');
  const e = String(email || '').trim();
  if (!name && !e) return '';
  return e ? `${name} <${e}>` : name;
}
// Repeatable first/last/email rows for event staff capture.
function staffRow(group, s = { first: '', last: '', email: '' }) {
  return `<div class="staff-row" data-staff-group="${group}">
    <input class="staff-first" placeholder="First name" value="${esc(s.first)}">
    <input class="staff-last" placeholder="Last name" value="${esc(s.last)}">
    <input class="staff-email" type="email" placeholder="email@org.gov" value="${esc(s.email)}">
    <button type="button" class="btn tiny staff-del" title="Remove">✕</button>
  </div>`;
}
function staffRows(group, values = []) {
  const rows = (values && values.length ? values : ['']).map(v => staffRow(group, parseStaff(v))).join('');
  return `<div class="staff-rows" data-staff-rows="${group}">${rows}</div>
    <button type="button" class="btn tiny" data-add-staff="${group}">+ Add</button>`;
}
function gatherStaff(form, group) {
  return [...form.querySelectorAll(`.staff-row[data-staff-group="${group}"]`)]
    .map(r => joinStaff(
      r.querySelector('.staff-first')?.value,
      r.querySelector('.staff-last')?.value,
      r.querySelector('.staff-email')?.value))
    .filter(Boolean);
}
// Delegated handler: + Add appends a row, ✕ removes one (keeps at least one).
function wireStaffRows(scope) {
  if (!scope) return;
  scope.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add-staff]');
    if (add) {
      const group = add.dataset.addStaff;
      const box = scope.querySelector(`.staff-rows[data-staff-rows="${group}"]`);
      if (box) box.insertAdjacentHTML('beforeend', staffRow(group));
      return;
    }
    const del = e.target.closest('.staff-del');
    if (del) {
      const box = del.closest('.staff-rows');
      const row = del.closest('.staff-row');
      if (box && row && box.querySelectorAll('.staff-row').length > 1) row.remove();
      else if (row) { row.querySelectorAll('input').forEach(i => i.value = ''); }
    }
  });
}

// ---- Audit trail ----------------------------------------------------------
// Every create/edit stamps who/when and appends a change-history entry. This
// mirrors SharePoint's Author/Created/Editor/Modified columns plus list
// version history; the on-page Audit button surfaces the trail.
const CURRENT_USER = 'You';
let auditSeq = 1;
const nowIso = () => new Date().toISOString();
const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const recordTitleOf = (r) => r ? (r.name || r.title || r.id) : '';
function logAudit(record, recordType, action, summary) {
  db.audit = db.audit || [];
  db.audit.push({
    id: `AUD-${Date.now().toString(36)}-${auditSeq++}`,
    recordId: record.id, recordType, recordTitle: recordTitleOf(record),
    action, summary: summary || '', by: CURRENT_USER, at: nowIso()
  });
}
function stampCreate(record, recordType) {
  const t = nowIso();
  record.createdBy = CURRENT_USER; record.createdAt = t;
  record.modifiedBy = CURRENT_USER; record.modifiedAt = t;
  logAudit(record, recordType, 'Created', `${recordType} created`);
}
function stampEdit(record, recordType, summary) {
  record.modifiedBy = CURRENT_USER; record.modifiedAt = nowIso();
  logAudit(record, recordType, 'Updated', summary || 'Record updated');
}
const recordAuditEntries = (recordId) => (db.audit || [])
  .filter(a => a.recordId === recordId)
  .sort((a, b) => String(b.at).localeCompare(String(a.at)));

// ---- Delete / Archive -----------------------------------------------------
// One registry so archive/restore/delete works the same way for every record
// type. `coll` is the db collection; `type` is the audit label; `list` is the
// browse route to fall back to after a record is removed from a detail page.
const RECORD_KINDS = {
  agency:      { coll: 'agencies',     type: 'Agency',      list: '#/agencies' },
  event:       { coll: 'events',       type: 'Event',       list: '#/events' },
  usecase:     { coll: 'useCases',     type: 'Use case',    list: '#/usecases' },
  pattern:     { coll: 'patterns',     type: 'Pattern',     list: '#/patterns' },
  accelerator: { coll: 'accelerators', type: 'Accelerator', list: '#/patterns' },
  improvement: { coll: 'improvements', type: 'Improvement', list: '#/lessons' },
  calendar:    { coll: 'calendar',     type: 'Calendar',    list: '#/calendar' }
};
// Only these lists carry a persisted RecordStatus column, so only they can be
// soft-archived (and recovered). The rest are hard-deleted (the reconcile on
// save removes the row from SharePoint).
const SOFT_KINDS = new Set(['agency', 'event', 'usecase']);

const isArchived = (r) => !!r && r.recordStatus === 'Archived';
const notArchived = (r) => !isArchived(r);

// Permanent (hard) delete is gated behind an admin check. In SharePoint mode
// the live site is authoritative — `spAdmin` is resolved once at boot from the
// user's site-admin status / admin-group membership (see resolveAdminAccess).
// Outside SharePoint (local CSV / demo) there is no directory to ask, so a
// sticky ?admin=1 URL flag stands in for testing. Real authorization is always
// enforced by SharePoint permissions regardless of this UI gate.
let spAdmin = false;
function isAdminMode() {
  if (spAdmin) return true;
  try {
    const p = new URLSearchParams(location.search).get('admin');
    // The ?admin flag is a local/dev override only — ignore it in SharePoint
    // mode so production access is decided solely by the live site.
    if (!isSharePointMode()) {
      if (p === '1') localStorage.setItem('hcl.admin', '1');
      if (p === '0') localStorage.removeItem('hcl.admin');
      return localStorage.getItem('hcl.admin') === '1';
    }
    return false;
  } catch { return false; }
}

// Resolve SharePoint admin access once at boot, then re-render so admin-only
// controls (permanent delete) appear for authorized users.
async function resolveAdminAccess() {
  try {
    const ok = await checkAdminAccess();
    if (ok && !spAdmin) { spAdmin = true; router(); }
  } catch { /* fail closed — non-admins simply never see permanent delete */ }
}

function archiveRecord(kind, id) {
  const meta = RECORD_KINDS[kind]; const r = db.byId[id]; if (!meta || !r) return;
  r.recordStatus = 'Archived';
  r.modifiedBy = CURRENT_USER; r.modifiedAt = nowIso();
  logAudit(r, meta.type, 'Archived', `${meta.type} archived`);
  persistSoon();
}

function restoreRecord(kind, id) {
  const meta = RECORD_KINDS[kind]; const r = db.byId[id]; if (!meta || !r) return;
  r.recordStatus = 'Active';
  r.modifiedBy = CURRENT_USER; r.modifiedAt = nowIso();
  logAudit(r, meta.type, 'Restored', `${meta.type} restored`);
  persistSoon();
}

function deleteRecordHard(kind, id) {
  const meta = RECORD_KINDS[kind]; const r = db.byId[id]; if (!meta || !r) return;
  // Stamp the audit trail BEFORE the record disappears so the deletion is
  // itself recorded in the centralized log.
  logAudit(r, meta.type, 'Deleted', `${meta.type} permanently deleted`);
  // Unlink an accelerator from its parent pattern.
  if (kind === 'accelerator') {
    const pat = db.byId[r.patternId];
    if (pat && Array.isArray(pat.acceleratorIds)) pat.acceleratorIds = pat.acceleratorIds.filter(x => x !== id);
  }
  const arr = db[meta.coll]; const i = arr.indexOf(r);
  if (i >= 0) arr.splice(i, 1);
  delete db.byId[id];
  persistSoon();
}

// Heads-up about records that point at the one being removed (kept simple — the
// app already renders missing references gracefully).
function referenceWarning(kind, id) {
  if (kind === 'agency') { const n = db.useCases.filter(u => u.agencyId === id && notArchived(u)).length; if (n) return `${n} use case${n === 1 ? '' : 's'} reference this agency.`; }
  if (kind === 'event') { const n = db.useCases.filter(u => u.eventId === id && notArchived(u)).length; if (n) return `${n} use case${n === 1 ? '' : 's'} belong to this hackathon.`; }
  if (kind === 'pattern') { const n = db.useCases.filter(u => u.patternId === id).length; if (n) return `${n} use case${n === 1 ? '' : 's'} apply this pattern.`; }
  return '';
}

// Confirmation dialog. Soft kinds default to Archive (recommended) with an
// admin-only permanent delete; the rest offer a single permanent delete.
// `onDone` lets in-page managers re-render themselves instead of navigating.
function confirmDelete(kind, id, onDone) {
  const meta = RECORD_KINDS[kind]; const r = db.byId[id]; if (!meta || !r) return;
  const name = recordTitleOf(r);
  const soft = SOFT_KINDS.has(kind);
  const admin = isAdminMode();
  const warn = referenceWarning(kind, id);
  const after = () => { if (typeof onDone === 'function') onDone(); else afterRemoveNav(kind); };

  const btns = [];
  if (soft) btns.push(`<button class="btn primary" data-act="archive">📦 Archive</button>`);
  if (!soft || admin) btns.push(`<button class="btn danger" data-act="delete">🗑️ Delete permanently</button>`);

  let body = `<p>What would you like to do with <strong>${esc(name)}</strong>?</p>`;
  if (soft) body += `<p class="tiny muted">Archiving hides it from the catalog but keeps it for recovery from the Audit page.</p>`;
  if (warn) body += `<p class="tiny" style="color:var(--red)">⚠️ ${esc(warn)}</p>`;
  if (soft && !admin) body += `<p class="tiny muted">Permanent delete is reserved for admins (open the app with <code>?admin=1</code>).</p>`;
  if (!soft) body += `<p class="tiny" style="color:var(--red)">This cannot be undone.</p>`;
  body += `<div class="modal-actions">${btns.join('')}<button class="btn" data-act="cancel">Cancel</button></div>`;

  const wrap = openModal(`Delete ${meta.type.toLowerCase()}`, body);
  wrap.querySelector('[data-act="cancel"]').onclick = closeModal;
  const arch = wrap.querySelector('[data-act="archive"]');
  if (arch) arch.onclick = () => { archiveRecord(kind, id); closeModal(); toast(`${meta.type} archived.`); after(); };
  const del = wrap.querySelector('[data-act="delete"]');
  if (del) del.onclick = () => { deleteRecordHard(kind, id); closeModal(); toast(`${meta.type} deleted.`); after(); };
}

// After a record is archived/deleted, re-render. Stay put on the Audit page,
// otherwise route to the record's browse list (the detail page is now gone).
function afterRemoveNav(kind) {
  const onAudit = location.hash.startsWith('#/audit');
  const target = onAudit ? '#/audit' : (RECORD_KINDS[kind]?.list || '#/home');
  if (location.hash === target) router(); else location.hash = target;
}

// Soft-archived records grouped for the Audit page recycle bin.
function archivedRecords() {
  const out = [];
  for (const kind of SOFT_KINDS) {
    (db[RECORD_KINDS[kind].coll] || []).forEach(r => { if (isArchived(r)) out.push({ kind, r }); });
  }
  return out.sort((a, b) => String(b.r.modifiedAt).localeCompare(String(a.r.modifiedAt)));
}

// Small Edit / Audit / Delete action group for detail-page headers. Archived
// records swap Edit for a Restore action.
function recordActions(kind, id) {
  const r = db.byId[id];
  const del = `<button class="btn tiny danger ghost" data-remove-record="${kind}:${id}">🗑️ Delete</button>`;
  if (isArchived(r)) {
    return `<div class="record-actions">
      <span class="chip warn">Archived</span>
      <button class="btn tiny" data-restore-record="${kind}:${id}">↩︎ Restore</button>
      <button class="btn tiny ghost" data-audit="${id}">🕓 Audit</button>
      ${isAdminMode() ? del : ''}
    </div>`;
  }
  return `<div class="record-actions">
    <button class="btn tiny" data-edit-${kind}="${id}">✏️ Edit</button>
    <button class="btn tiny ghost" data-audit="${id}">🕓 Audit</button>
    ${del}
  </div>`;
}

// ---- Modal infrastructure -------------------------------------------------
function closeModal() {
  const m = document.getElementById('appModal');
  if (m) m.remove();
  document.removeEventListener('keydown', escClose);
}
function escClose(e) { if (e.key === 'Escape') closeModal(); }
function openModal(title, bodyHtml, opts = {}) {
  closeModal();
  const wrap = el(`<div class="modal-overlay" id="appModal"><div class="modal-card${opts.wide ? ' wide' : ''}">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="modal-close" type="button" aria-label="Close">✕</button></div>
    <div class="modal-body">${bodyHtml}</div></div></div>`);
  document.body.appendChild(wrap);
  wrap.querySelector('.modal-close').onclick = closeModal;
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeModal(); });
  document.addEventListener('keydown', escClose);
  return wrap;
}
function openAuditModal(recordId) {
  const r = db.byId[recordId]; if (!r) return;
  const entries = recordAuditEntries(recordId);
  const body = `
    <div class="audit-meta">
      <div><span class="audit-k">Created by</span><span>${esc(r.createdBy || '—')}</span></div>
      <div><span class="audit-k">Created</span><span>${esc(fmtDateTime(r.createdAt))}</span></div>
      <div><span class="audit-k">Last modified by</span><span>${esc(r.modifiedBy || '—')}</span></div>
      <div><span class="audit-k">Last modified</span><span>${esc(fmtDateTime(r.modifiedAt))}</span></div>
    </div>
    <h4 class="sub-h">Change history (${entries.length})</h4>
    ${entries.length
      ? `<div class="tbl-scroll"><table class="tbl audit-tbl"><thead><tr><th>When</th><th>Action</th><th>By</th><th>Details</th></tr></thead>
         <tbody>${entries.map(a => `<tr><td>${esc(fmtDateTime(a.at))}</td><td><span class="chip ${a.action === 'Created' ? 'good' : 'info'}">${esc(a.action)}</span></td><td>${esc(a.by)}</td><td>${esc(a.summary)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted tiny">No tracked changes yet in this session.</p>'}
    <p class="tiny muted" style="margin-top:12px">🛈 In SharePoint these map to <strong>Created / Created By / Modified / Modified By</strong> plus list <strong>version history</strong> and tenant <strong>audit logs</strong> (Microsoft Purview).</p>`;
  openModal(`Audit — ${recordTitleOf(r)}`, body, { wide: true });
}

// Ten retrospective categories captured per event (structured Lessons Learned).
const RETRO_FIELDS = [
  { key: 'whatWorkedWell', label: 'What worked well', hint: 'Overall highlights across the event' },
  { key: 'trackFeedback', label: 'Track feedback (Agent / App Mod)', hint: 'What landed well and what didn’t per track' },
  { key: 'contentFlow', label: 'Content & flow', hint: 'Balance of kickoff, sessions, hacking, demos' },
  { key: 'technicalSetup', label: 'Technical setup & access', hint: 'Environment readiness, login issues, instructions' },
  { key: 'coachingModel', label: 'Coaching model', hint: 'Coverage, roles, effectiveness' },
  { key: 'demosJudging', label: 'Demos & judging', hint: 'Timing, scoring approach, overall experience' },
  { key: 'logisticsOps', label: 'Logistics & operations', hint: 'Room setup, transitions, onsite execution' },
  { key: 'teamCoordination', label: 'Team coordination', hint: 'Microsoft + partners alignment and handoffs' },
  { key: 'customerRelevance', label: 'Customer relevance', hint: 'How well use cases aligned to customer priorities' },
  { key: 'nextSteps', label: 'Next steps', hint: 'Follow-ups, opportunities, what we’d change next time' }
];

// ---- Use case card (simplified) -------------------------------------------
function ucCard(uc) {
  const needsOwner = needsPipelineOwner(uc);
  return `<div class="card hover uc-card" data-link="#/usecase/${uc.id}">
    <h3>${esc(uc.title)}</h3>
    <div class="uc-meta">${esc(agencyName(uc.agencyId))} · ${esc(eventName(uc.eventId))}</div>
    <div class="tag-row">
      ${bandBadge(uc._band)}
      ${needsOwner ? '<span class="chip danger">🔴 No owner</span>' : ''}
    </div>
  </div>`;
}

// =====================================================================
// PAGES
// =====================================================================

function pageHome() {
  const m = programMetrics();
  const high = db.useCases.filter(u => u._band.key === 'high').sort((a, b) => b._score - a._score);
  const upcoming = [...db.calendar].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return `
  <div class="page-head">
    <h1>Program at a glance</h1>
    <p>Every hackathon, use case, and follow-up — in one place.</p>
  </div>
  <div class="grid cols-4" style="margin-bottom:20px">
    <div class="kpi"><div class="num">${m.events}</div><div class="lbl">Hackathon events</div></div>
    <div class="kpi"><div class="num">${m.useCases}</div><div class="lbl">Use cases captured</div></div>
    <div class="kpi good"><div class="num">${m.high}</div><div class="lbl">High potential</div></div>
    <div class="kpi alert"><div class="num">${m.noOwner}</div><div class="lbl">In pipeline — no owner</div></div>
  </div>

  <div class="detail-grid">
    <div>
      <div class="spread"><h2 class="sec-h">High potential this quarter</h2><a href="#/pipeline">View pipeline →</a></div>
      <div class="grid cols-2">${high.map(ucCard).join('')}</div>

      <div class="spread" style="margin-top:24px"><h2 class="sec-h">Recent events</h2><a href="#/events">All hackathons →</a></div>
      <div class="grid cols-2">${db.events.map(ev => `
        <div class="card hover" data-link="#/event/${ev.id}">
          <h3>${esc(ev.name)}</h3>
          <div class="muted tiny">${fmtDate(ev.startDate)} – ${fmtDate(ev.endDate)} · ${esc(ev.location)}</div>
          <div class="tag-row" style="margin-top:8px">
            <span class="chip">${useCasesForEvent(ev.id).length} use cases</span>
            <span class="chip info">${(ev.agencyMix||[]).length} agencies</span>
          </div>
        </div>`).join('')}</div>
    </div>

    <div>
      <div class="card quick-actions">
        <h3>Register &amp; capture</h3>
        <ol class="numbered-links">
          <li><a href="#/register/agency"><span class="n">1</span>Register an agency</a></li>
          <li><a href="#/register/event"><span class="n">2</span>Register an event</a></li>
          <li><a href="#/register/usecase"><span class="n">3</span>Register a use case</a></li>
          <li><a href="#/register/pattern"><span class="n">4</span>Define a reusable pattern</a></li>
          <li><a href="#/register/lessons"><span class="n">5</span>Capture lessons learned</a></li>
        </ol>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="spread"><h3 style="margin:0">Upcoming hackathons</h3><a class="tiny" href="#/calendar">Calendar →</a></div>
        <div class="stack-sm" style="margin-top:10px">
          ${upcoming.map(c => `<div class="cal-item" style="cursor:pointer" data-link="#/calendar">
            <div class="cal-date"><div class="m">${fmtDate(c.startDate).split(' ')[0]}</div><div class="d">${new Date(c.startDate + 'T00:00:00').getDate()}</div><div class="y">${c.startDate.slice(0,4)}</div></div>
            <div><strong>${esc(c.title)}</strong><div class="tiny muted">${esc(c.format)} · ${esc(c.status)}</div></div>
          </div>`).join('')}
        </div>
      </div>
    </div>
  </div>`;
}

// ---- Use Cases browse with search + facets --------------------------------
const ucFilter = { q: '', agency: new Set(), event: new Set(), band: new Set(), noOwnerOnly: false, reusableOnly: false };

function pageUseCases() {
  setTimeout(wireUseCaseFilters, 0);
  return `
  <div class="page-head"><h1>Use Cases</h1><p>Search and filter the catalog. ${db.useCases.length} records.</p></div>
  <div class="browse">
    <aside class="facets" id="facets">
      <h4>Saved views</h4>
      <div class="savedviews" style="flex-direction:column;align-items:stretch">
        <button data-view="high">High potential</button>
        <button data-view="noowner">In pipeline — no owner</button>
        <button data-view="reusable">Reusable patterns</button>
        <button data-view="clear">Clear all</button>
      </div>
      <h4>Agency</h4><div id="f-agency"></div>
      <h4>Event</h4><div id="f-event"></div>
      <h4>Production band</h4><div id="f-band"></div>
    </aside>
    <section>
      <div class="searchbar">
        <input id="ucSearch" type="search" placeholder="Search title, problem, solution, services…" />
      </div>
      <div class="results-head">
        <strong id="ucCount"></strong>
        <div class="savedviews">
          <label class="tiny muted" style="display:flex;align-items:center;gap:6px">Sort
            <select id="ucSort" class="select">
              <option value="score">Potential (high→low)</option>
              <option value="title">Title (A→Z)</option>
              <option value="agency">Agency</option>
            </select>
          </label>
          <button class="btn" data-export="usecases">⬇ Export CSV</button>
        </div>
      </div>
      <div class="grid cols-3" id="ucResults"></div>
    </section>
  </div>`;
}

function uniqueValues(getter) { return [...new Set(db.useCases.map(getter))].filter(Boolean).sort(); }

function wireUseCaseFilters() {
  const agencies = [...new Set(db.useCases.map(u => u.agencyId))];
  const events = [...new Set(db.useCases.map(u => u.eventId))];
  const bands = ['High Potential', 'Needs Incubation', 'Not Ready'];

  const cb = (group, value, label) => `<label><input type="checkbox" data-group="${group}" value="${esc(value)}"> ${esc(label)}</label>`;
  document.getElementById('f-agency').innerHTML = agencies.map(a => cb('agency', a, agencyName(a))).join('');
  document.getElementById('f-event').innerHTML = events.map(e => cb('event', e, eventName(e))).join('');
  document.getElementById('f-band').innerHTML = bands.map(b => cb('band', b, b)).join('');

  document.getElementById('facets').addEventListener('change', (e) => {
    const grp = e.target.dataset.group; if (!grp) return;
    const set = ucFilter[grp];
    if (e.target.checked) set.add(e.target.value); else set.delete(e.target.value);
    renderUseCaseResults();
  });
  document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => applyView(btn.dataset.view)));
  document.getElementById('ucSearch').addEventListener('input', e => { ucFilter.q = e.target.value.toLowerCase(); renderUseCaseResults(); });
  document.getElementById('ucSort').addEventListener('change', renderUseCaseResults);
  // apply any inbound prefilter (e.g., from dashboard link)
  renderUseCaseResults();
}

function applyView(view) {
  ['agency', 'event', 'band'].forEach(g => ucFilter[g].clear());
  ucFilter.q = ''; ucFilter.noOwnerOnly = false; ucFilter.reusableOnly = false;
  document.querySelectorAll('#facets input[type=checkbox]').forEach(c => c.checked = false);
  const search = document.getElementById('ucSearch'); if (search) search.value = '';
  if (view === 'high') {
    ucFilter.band.add('High Potential');
    document.querySelectorAll('#f-band input').forEach(c => { if (c.value === 'High Potential') c.checked = true; });
  } else if (view === 'noowner') {
    ucFilter.noOwnerOnly = true;
  } else if (view === 'reusable') {
    ucFilter.reusableOnly = true;
  }
  renderUseCaseResults();
}

function renderUseCaseResults() {
  const list = filteredUseCases();
  document.getElementById('ucCount').textContent = `${list.length} use case${list.length === 1 ? '' : 's'}`;
  document.getElementById('ucResults').innerHTML = list.length ? list.map(ucCard).join('') : `<p class="muted">No use cases match these filters.</p>`;
}

// Apply the active facets / search / sort and return the resulting use cases.
// Shared by the on-screen results and the CSV export so both stay in lockstep.
function filteredUseCases() {
  let list = db.useCases.filter(uc => {
    if (isArchived(uc)) return false;
    if (ucFilter.agency.size && !ucFilter.agency.has(uc.agencyId)) return false;
    if (ucFilter.event.size && !ucFilter.event.has(uc.eventId)) return false;
    if (ucFilter.band.size && !ucFilter.band.has(uc._band.label)) return false;
    if (ucFilter.noOwnerOnly && !needsPipelineOwner(uc)) return false;
    if (ucFilter.reusableOnly && !uc._flags.some(f => f.key === 'reusable')) return false;
    if (ucFilter.q) {
      const hay = [uc.title, uc.businessProblem, uc.proposedSolution, (uc.services || []).join(' '), agencyName(uc.agencyId)].join(' ').toLowerCase();
      if (!hay.includes(ucFilter.q)) return false;
    }
    return true;
  });
  const sort = document.getElementById('ucSort')?.value || 'score';
  list.sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'agency' ? agencyName(a.agencyId).localeCompare(agencyName(b.agencyId)) : b._score - a._score);
  return list;
}

// ---- Use case detail ------------------------------------------------------
function pageUseCase(id) {
  const uc = db.byId[id];
  if (!uc) return `<p>Use case not found.</p>`;
  const fu = followupFor(id);
  setTimeout(() => wireTabs(), 0);

  // Easy production-readiness gates (simple ✓ / ✕).
  const gates = [
    { label: 'Production owner assigned', ok: hasOwner(uc) },
    { label: 'Compliance / risk cleared', ok: Number(uc.scores.compliance) >= 2 },
    { label: 'Technically feasible to productionize', ok: Number(uc.scores.feasibility) >= 2 },
    { label: 'Solves a real problem', ok: Number(uc.scores.realProblem) >= 2 },
    { label: 'Business value is clear', ok: Number(uc.scores.businessValue) >= 2 },
    { label: 'Recommended next step defined', ok: !!uc.nextStep }
  ];
  const gatesPassed = gates.filter(g => g.ok).length;
  const gateList = `<div class="checklist">${gates.map(g =>
    `<div class="check-row ${g.ok ? 'ok' : 'no'}"><span class="ck">${g.ok ? '✓' : '✕'}</span>${esc(g.label)}</div>`
  ).join('')}</div>`;

  // Scored dimensions as compact check states (✓ full / ◐ partial / ○ none).
  const dimChecks = `<div class="dim-checks">${DIMENSIONS.map(d => {
    const s = Number(uc.scores[d.key] ?? 0);
    const cls = s >= 3 ? 'ok' : s >= 1 ? 'mid' : 'no';
    const mark = s >= 3 ? '✓' : s >= 1 ? '◐' : '○';
    return `<div class="dim-row"><span class="ck ${cls}">${mark}</span><span class="dl">${esc(d.label)}</span><span class="dv">${s}/3 · wt ${d.weight}</span></div>`;
  }).join('')}</div>`;

  const champs = [];
  if (uc.champions?.apps) champs.push(`Apps: ${personName(uc.champions.apps)}`);
  if (uc.champions?.dataai) champs.push(`Data/AI: ${personName(uc.champions.dataai)}`);

  return `
  <div class="breadcrumb"><a href="#/usecases">Use Cases</a> / ${esc(uc.id)}</div>
  <div class="hero">
    <div class="spread">
      <div>
        <h1>${esc(uc.title)}</h1>
        <div class="hero-meta">
          <span>🏛️ ${esc(agencyName(uc.agencyId))}</span>
          <span>📅 <a href="#/event/${uc.eventId}">${esc(eventName(uc.eventId))}</a></span>
          <span>👥 ${esc(team(uc.teamId)?.name || '—')}</span>
        </div>
      </div>
      <div style="text-align:right">${bandBadge(uc._band)}${uc.inPipeline?'<div style="margin-top:6px"><span class="chip good">✅ In pipeline</span></div>':''}
        <div style="margin-top:8px">${recordActions('usecase', uc.id)}</div>
      </div>
    </div>
    <div class="tag-row" style="margin-top:6px">${flagChips(uc._flags)}</div>
  </div>

  <div class="tabs" id="ucTabs">
    <button class="active" data-tab="overview">Overview</button>
    <button data-tab="tech">Solution &amp; Tech</button>
    <button data-tab="value">Value &amp; Impact</button>
    <button data-tab="assess">Production Assessment</button>
    <button data-tab="champ">Champions &amp; Follow-ups</button>
    <button data-tab="artifacts">Artifacts &amp; Lessons</button>
  </div>

  <div class="detail-grid">
    <div>
      <div data-panel="overview">
        <dl class="fields">
          <dt>Business problem</dt><dd>${esc(uc.businessProblem)}</dd>
          <dt>Current process / pain</dt><dd>${esc(uc.currentProcess)}</dd>
          <dt>Challenge summary</dt><dd>${esc(uc.challengeSummary)}</dd>
          <dt>Proposed solution</dt><dd>${esc(uc.proposedSolution)}</dd>
          <dt>End users / beneficiaries</dt><dd>${esc(uc.beneficiaries)}</dd>
          <dt>Industry applicability</dt><dd>${(uc.industries||[]).map(i=>`<span class="chip">${esc(i)}</span>`).join(' ')}</dd>
        </dl>
      </div>
      <div data-panel="tech" class="hide">
        <dl class="fields">
          <dt>Components</dt><dd>${(uc.components||[]).map(c=>`<span class="chip">${esc(c)}</span>`).join(' ')}</dd>
          <dt>GitHub Copilot role</dt><dd>${esc(uc.copilotRole)}</dd>
          <dt>Azure / M365 / AI services</dt><dd>${(uc.services||[]).map(s=>`<span class="chip info">${esc(s)}</span>`).join(' ')}</dd>
          <dt>Solution pattern</dt><dd>${uc.patternId ? `<a href="#/pattern/${uc.patternId}">${esc(patternName(uc.patternId))}</a>` : '—'}</dd>
          <dt>Data dependencies</dt><dd>${esc(uc.dataDependencies)}</dd>
          <dt>Security / compliance</dt><dd>${esc(uc.compliance)}</dd>
          <dt>Risks / blockers</dt><dd>${esc(uc.risks)}</dd>
        </dl>
      </div>
      <div data-panel="value" class="hide">
        <dl class="fields">
          <dt>Business value</dt><dd>${esc(uc.businessValue)}</dd>
          <dt>Estimated impact</dt><dd>${esc(uc.estimatedImpact)}${uc.impactMetric ? ` — <strong>${esc(uc.impactMetric)}</strong>` : ''}</dd>
          <dt>Production feasibility</dt><dd>${esc(uc.feasibility)}</dd>
          <dt>Reusability / repeatability</dt><dd>${esc(uc.reusability)}</dd>
        </dl>
      </div>
      <div data-panel="assess" class="hide">
        <div class="spread"><h3 style="margin:0">Production potential — ${uc._score}/100</h3>${bandBadge(uc._band)}</div>
        <div class="assess-head">${gatesPassed} of ${gates.length} readiness gates met</div>
        <h4 class="sub-h">Production-readiness checklist</h4>
        ${gateList}
        <h4 class="sub-h">Scored dimensions (weighted to 100)</h4>
        ${dimChecks}
        <p class="muted tiny" style="margin-top:10px">Hard gate: compliance or feasibility = 0 caps to Not Ready. Scores are set by judges in the event Winners tab.</p>
      </div>
      <div data-panel="champ" class="hide">
        <dl class="fields">
          <dt>Assigned CSA(s)</dt><dd>${(uc.csaIds||[]).map(personName).join(', ') || '—'}</dd>
          <dt>Executive sponsor</dt><dd>${uc.execSponsorId ? esc(personName(uc.execSponsorId)) : '—'}</dd>
          <dt>Champions</dt><dd>${champs.length ? champs.map(c=>`<span class="chip good">${esc(c)}</span>`).join(' ') : '—'}</dd>
          <dt>MS supporting teams</dt><dd>${(uc.supportTeams||[]).map(t=>`<span class="chip">${esc(t)}</span>`).join(' ')}</dd>
          <dt>Recommended next step</dt><dd>${esc(uc.nextStep)}</dd>
          <dt>Production owner</dt><dd>${hasOwner(uc) ? esc(ownerDisplay(uc)) : (uc.inPipeline ? '<span class="chip danger">🔴 None — assign at pipeline</span>' : '<span class="muted">— assigned at pipeline step</span>')}</dd>
        </dl>
        ${fu ? `<div class="divider"></div><h4 style="margin:0 0 8px">Follow-up action</h4>
          <dl class="fields">
            <dt>Next step</dt><dd>${esc(fu.nextStep)}</dd>
            <dt>Owner</dt><dd>${fu.ownerId ? esc(personName(fu.ownerId)) : '—'}</dd>
            <dt>Motion</dt><dd>${esc(fu.motionType || '—')}</dd>
            <dt>Status</dt><dd>${esc(fu.status)}</dd>
            <dt>Due</dt><dd>${fmtDate(fu.dueDate)}</dd>
          </dl>` : ''}
      </div>
      <div data-panel="artifacts" class="hide">
        <dl class="fields">
          <dt>Demo recording</dt><dd><a href="${esc(uc.demoUrl)}">View demo ↗</a></dd>
          <dt>Repository</dt><dd><a href="${esc(uc.repoUrl)}">View repo ↗</a></dd>
          <dt>Notes / lessons learned</dt><dd>${esc(uc.lessons)}</dd>
        </dl>
      </div>
    </div>
    <div>
      <div class="card">
        <h3>Snapshot</h3>
        <dl class="fields" style="grid-template-columns:120px 1fr">
          <dt>Record</dt><dd>${esc(uc.id)}</dd>
          <dt>Pipeline</dt><dd>${uc.inPipeline ? '✅ In pipeline' : '—'}</dd>
          <dt>Potential</dt><dd>${bandBadge(uc._band)}</dd>
          <dt>Record state</dt><dd>${esc(uc.recordStatus)}</dd>
        </dl>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>Same agency</h3>
        <div class="stack-sm">
          ${useCasesForAgency(uc.agencyId).filter(u=>u.id!==uc.id).map(u=>`<a href="#/usecase/${u.id}">${esc(u.title)}</a>`).join('') || '<span class="muted tiny">No others</span>'}
        </div>
      </div>
    </div>
  </div>`;
}

// ---- Events ---------------------------------------------------------------
function eventCard(ev) {
  return `<div class="card hover" data-link="#/event/${ev.id}">
      <div class="spread"><h3>${esc(ev.name)}</h3><span class="chip info">${esc(ev.format)}</span></div>
      <div class="muted tiny">${fmtDate(ev.startDate)} – ${fmtDate(ev.endDate)} · ${esc(ev.location)}</div>
      <div class="tag-row" style="margin-top:10px">
        <span class="chip">${useCasesForEvent(ev.id).length} use cases</span>
        <span class="chip">${ev.numTeams} teams</span>
        <span class="chip">${ev.numParticipants} participants</span>
        <span class="chip good">${useCasesForEvent(ev.id).filter(u=>u._band.key==='high').length} high potential</span>
      </div>
    </div>`;
}

function pageEvents() {
  setTimeout(wireEventsFilter, 0);
  const formats = [...new Set(db.events.map(e => e.format))].filter(Boolean).sort();
  return `
  <div class="page-head"><h1>Hackathons</h1><p>${db.events.length} past events. Upcoming events live on the <a href="#/calendar">calendar</a>.</p></div>
  <div class="searchbar">
    <input id="evSearch" type="search" placeholder="Search by name, location, format…" />
    <select id="evFormat" class="select"><option value="">All formats</option>${formats.map(f=>`<option>${esc(f)}</option>`).join('')}</select>
  </div>
  <div class="results-head"><strong id="evCount"></strong></div>
  <div class="grid cols-2" id="evResults"></div>`;
}

function wireEventsFilter() {
  const search = document.getElementById('evSearch'); const fmt = document.getElementById('evFormat');
  if (!search) return;
  const render = () => {
    const q = (search.value || '').toLowerCase(); const f = fmt.value;
    const list = db.events.filter(ev => {
      if (isArchived(ev)) return false;
      if (f && ev.format !== f) return false;
      if (q && ![ev.name, ev.location, ev.format].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
    document.getElementById('evCount').textContent = `${list.length} hackathon${list.length === 1 ? '' : 's'}`;
    document.getElementById('evResults').innerHTML = list.length ? list.map(eventCard).join('') : '<p class="muted">No hackathons match.</p>';
  };
  search.addEventListener('input', render); fmt.addEventListener('change', render); render();
}

function pageEvent(id) {
  const ev = db.byId[id];
  if (!ev) return `<p>Event not found.</p>`;
  const ucs = useCasesForEvent(id);
  const teams = teamsForEvent(id);
  const imps = improvementsForEvent(id);
  const retro = ev.retrospective || {};
  setTimeout(() => wireTabs(), 0);
  return `
  <div class="breadcrumb"><a href="#/events">Hackathons</a> / ${esc(ev.name)}</div>
  <div class="hero">
    <div class="spread">
      <div><h1>${esc(ev.name)}</h1>
        <div class="hero-meta">
          <span>📅 ${fmtDate(ev.startDate)} – ${fmtDate(ev.endDate)}</span>
          <span>📍 ${esc(ev.location)}</span>
          <span>🎙️ Host: ${esc(personName(ev.hostId))}</span>
        </div>
      </div>
      <span class="chip info">${esc(ev.format)}</span>
    </div>
    <div class="tag-row" style="margin-top:4px">
      ${(ev.agencyMix||[]).map(a=>`<span class="chip">🏛️ ${esc(agencyName(a))}</span>`).join('')}
    </div>
    <div style="margin-top:10px" class="record-actions">${recordActions('event', ev.id)}
      <button class="btn tiny" data-export="event:${esc(ev.id)}">⬇ Export hackathon report</button>
    </div>
    <div class="tag-row" style="margin-top:8px">
      <span class="chip">${ucs.length} use cases</span>
      <span class="chip">${ev.numTeams} teams</span>
      <span class="chip">${ev.numParticipants} participants</span>
      <span class="chip">${ev.numSupportStaff} MS support staff</span>
    </div>
  </div>
  <div class="tabs" id="evTabs">
    <button class="active" data-tab="uc">Use Cases</button>
    <button data-tab="teams">Teams &amp; People</button>
    <button data-tab="winners">Winners &amp; Outcomes</button>
    <button data-tab="lessons">Lessons Learned</button>
  </div>
  <div data-panel="uc"><div class="grid cols-3">${ucs.map(ucCard).join('')}</div></div>
  <div data-panel="teams" class="hide">
    <h4 class="sub-h">Participating agencies (${(ev.agencyMix||[]).length})</h4>
    <div class="tag-row" style="margin-bottom:14px">${(ev.agencyMix||[]).map(a=>`<span class="chip">🏛️ ${esc(agencyName(a))}</span>`).join('')}</div>
    <h4 class="sub-h">Teams &amp; attendees</h4>
    <table class="tbl"><thead><tr><th>Team</th><th>Agency</th><th>Attendees</th><th>Assigned CSA(s)</th><th>Use cases</th></tr></thead>
    <tbody>${teams.map(t=>`<tr><td>${esc(t.name)}</td><td>${esc(agencyName(t.agencyId))}</td><td>${(t.participants||[]).join(', ')}</td><td>${(t.csaIds||[]).map(personName).join(', ')}</td><td>${(t.useCaseIds||[]).length}</td></tr>`).join('')}</tbody></table>
    <div class="grid cols-3" style="margin-top:16px">
      <div class="card"><h4 class="sub-h" style="margin-top:0">Organizers</h4><div class="stack-sm">${(ev.organizerIds||[]).map(p=>`<div>${esc(staffLabel(p))}</div>`).join('') || '<span class="muted tiny">—</span>'}</div></div>
      <div class="card"><h4 class="sub-h" style="margin-top:0">Technical support team</h4><div class="stack-sm">${(ev.technicalSupportTeam||[]).map(p=>`<div>${esc(staffLabel(p))}</div>`).join('') || '<span class="muted tiny">—</span>'}</div></div>
      <div class="card"><h4 class="sub-h" style="margin-top:0">Partners</h4><div class="stack-sm">${(ev.partnerOrgs||[]).map(o=>`<div>${esc(o)}</div>`).join('') || '<span class="muted tiny">—</span>'}</div></div>
    </div>
  </div>
  <div data-panel="winners" class="hide">
    ${(ev.winners && ev.winners.length)
      ? ev.winners.filter(w=>w.ucId).map(w=>{
          const medal = w.place==='1st Place'?'🥇':w.place==='2nd Place'?'🥈':'🥉';
          return `<div class="card" style="margin-bottom:12px"><div class="spread"><h3 style="margin:0">${medal} ${esc(w.place)}: <a href="#/usecase/${w.ucId}">${esc(db.byId[w.ucId]?.title||w.ucId)}</a></h3></div>${w.rationale?`<p class="muted" style="margin-bottom:0">${esc(w.rationale)}</p>`:''}</div>`;
        }).join('')
      : `<div class="alert-banner good">🏆 Winner: ${(ev.winnerUseCaseIds||[]).map(w=>`<a href="#/usecase/${w}">${esc(db.byId[w]?.title||w)}</a>`).join(', ') || '—'}</div>`}
    <dl class="fields"><dt>Outcomes</dt><dd>${esc(ev.outcomes)}</dd><dt>Follow-up meeting planned?</dt><dd>${ev.followupPlanned?'Yes':'No'}</dd><dt>Demo session</dt><dd>${esc(ev.demoDetails)}</dd></dl>
  </div>
  <div data-panel="lessons" class="hide">
    <h4 class="sub-h" style="margin-top:0">Event retrospective</h4>
    <div class="retro-grid">
      ${RETRO_FIELDS.map(f=>`<div class="retro-card"><div class="retro-cat">${esc(f.label)}</div><div class="retro-hint">${esc(f.hint)}</div><p>${retro[f.key]?esc(retro[f.key]):'<span class="muted tiny">Not captured.</span>'}</p></div>`).join('')}
    </div>
    <h4 class="sub-h">Tracked improvement items</h4>
    <table class="tbl"><thead><tr><th>Item</th><th>Type</th><th>Category</th><th>Severity</th><th>Status</th></tr></thead>
    <tbody>${imps.map(i=>`<tr><td>${esc(i.title)}</td><td>${esc(i.type)}</td><td>${esc(i.category)}</td><td>${esc(i.severity)}</td><td>${esc(i.status)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No items.</td></tr>'}</tbody></table>
  </div>`;
}

// ---- Calendar -------------------------------------------------------------
function calCard(c) {
  return `<div class="card">
      <div class="cal-item">
        <div class="cal-date"><div class="m">${fmtDate(c.startDate).split(' ')[0]}</div><div class="d">${new Date(c.startDate+'T00:00:00').getDate()}</div><div class="y">${c.startDate.slice(0,4)}</div></div>
        <div style="flex:1">
          <div class="spread"><h3 style="margin:0">${esc(c.title)}</h3><span class="chip ${c.status==='Confirmed'?'good':c.status==='Open for registration'?'info':''}">${esc(c.status)}</span></div>
          <div class="muted tiny">${fmtDate(c.startDate)} – ${fmtDate(c.endDate)} · ${esc(c.format)} · ${esc(c.location)}</div>
          <div class="tag-row" style="margin-top:8px">${(c.themes||[]).map(t=>`<span class="chip">${esc(t)}</span>`).join('')}</div>
          <div class="tiny muted" style="margin-top:8px">Organizers: ${(c.organizerIds||[]).map(staffLabel).join(', ') || '—'}</div>
          <div class="tiny" style="margin-top:6px">${esc(c.notes)}</div>
          <div class="divider" style="margin:10px 0"></div>
          <div class="record-actions">
            <button class="btn tiny" data-edit-calendar="${c.id}">✏️ Edit</button>
            <button class="btn tiny ghost" data-audit="${c.id}">🕓 Audit</button>
            ${c.managedEventId && db.byId[c.managedEventId]
              ? `<a class="btn tiny" href="#/event/${c.managedEventId}">↗ Managed event</a>`
              : `<button class="btn tiny primary" data-promote-calendar="${c.id}">⤴ Promote to managed event</button>`}
            <button class="btn tiny danger ghost" data-remove-record="calendar:${c.id}">🗑️ Delete</button>
          </div>
        </div>
      </div>
    </div>`;
}

// Shared field set so "Plan an upcoming event" (Calendar) and "Create a new
// event" (Manage) capture exactly the same information in the same order.
function eventFormFields(v = {}) {
  const themes = Array.isArray(v.themes) ? v.themes.join(', ') : (v.themes || '');
  const partners = Array.isArray(v.partnerOrgs) ? v.partnerOrgs.join(', ') : (v.partners || '');
  const agencySel = v.agencyMix || v.focusAgencies || [];
  const regUrl = v.registrationUrl && v.registrationUrl !== '#' ? v.registrationUrl : '';
  return `
      <div class="form-field full"><label>Event name <span class="req">*</span></label><input name="name" required value="${esc(v.name || v.title || '')}" placeholder="e.g., Tampa SLED AI Hackathon"></div>
      <div class="form-field"><label>Start date <span class="req">*</span></label><input type="date" name="startDate" required value="${esc(v.startDate || '')}"></div>
      <div class="form-field"><label>End date</label><input type="date" name="endDate" value="${esc(v.endDate || '')}"></div>
      <div class="form-field"><label>Status</label><select name="status">${optSel(['Proposed','Confirmed','Open for registration','Closed'], v.status || 'Proposed')}</select></div>
      <div class="form-field"><label>Format</label><select name="format">${optSel(['In-person','Hybrid','Virtual'], v.format || 'In-person')}</select></div>
      <div class="form-field full"><label>Location</label><input name="location" value="${esc(v.location || '')}" placeholder="Venue, City"></div>
      <div class="form-field full"><label>Primary Domain <span class="hint">(comma-separated)</span></label><input name="themes" value="${esc(themes)}" placeholder="e.g., Permitting, Benefits"></div>
      <div class="form-field"><label>Host</label><select name="host"><option value="">Select…</option>${optSel(db.people, v.hostId || '', p=>p.id, p=>p.name)}</select></div>
      <div class="form-field"><label>Or add a new host</label><input name="hostNew" placeholder="Type a name to add a new host"></div>
      <div class="form-field full"><label>Participating agencies <span class="hint">(multiple)</span></label>
        <div class="check-grid">${db.agencies.map(a=>`<label class="chk"><input type="checkbox" name="agencies" value="${esc(a.id)}"${agencySel.includes(a.id)?' checked':''}> ${esc(a.name)}</label>`).join('')}</div></div>
      <div class="form-field full"><label>Organizers <span class="hint">(first / last / email)</span></label>${staffRows('organizers', v.organizerIds || [])}</div>
      <div class="form-field full"><label>Technical support team <span class="hint">(first / last / email)</span></label>${staffRows('techSupport', v.technicalSupportTeam || [])}</div>
      <div class="form-field full"><label>Partners <span class="hint">(comma-separated)</span></label><input name="partners" value="${esc(partners)}" placeholder="e.g., Contoso, Fabrikam"></div>
      <div class="form-field full"><label>Registration URL</label><input name="registrationUrl" value="${esc(regUrl)}" placeholder="https://…"></div>
      <div class="form-field full"><label>Notes</label><textarea name="notes">${esc(v.notes || '')}</textarea></div>`;
}

function pageCalendar() {
  setTimeout(() => { wireCalendarFilter(); wireCalendarForm(); }, 0);
  const statuses = [...new Set(db.calendar.map(c => c.status))].filter(Boolean).sort();
  return `
  <div class="page-head"><h1>Calendar</h1><p>Upcoming hackathons and their themes, owners, and format.</p></div>
  <details class="panel" style="margin-bottom:16px"><summary>＋ Plan an upcoming event</summary><div class="panel-body">
    <form id="calForm" class="form-grid">
      ${eventFormFields()}
      <div class="form-field full"><button class="btn primary">Add to calendar</button></div>
    </form>
  </div></details>
  <div class="searchbar">
    <input id="calSearch" type="search" placeholder="Search by title, location, theme…" />
    <select id="calStatus" class="select"><option value="">All statuses</option>${statuses.map(s=>`<option>${esc(s)}</option>`).join('')}</select>
  </div>
  <div class="results-head"><strong id="calCount"></strong></div>
  <div class="grid cols-2" id="calResults"></div>`;
}

function wireCalendarForm() {
  const form = document.getElementById('calForm'); if (!form) return;
  wireStaffRows(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault(); if (!form.reportValidity()) return;
    const fd = new FormData(form);
    if (fd.get('endDate') && fd.get('endDate') < fd.get('startDate')) { toast('End date cannot be before start date.'); return; }
    const id = `CAL-NEW-${newIdSeq++}`;
    let hostId = fd.get('host') || null;
    const hostNew = (fd.get('hostNew') || '').trim();
    if (hostNew) {
      const pid = `PR-NEW-${newIdSeq++}`;
      const person = buildPerson({ id: pid, name: hostNew, roleTitle: 'Event host', hackathonRoles: ['Host'] });
      db.people.push(person); db.byId[pid] = person; hostId = pid;
    }
    const c = buildCalendarEvent({
      id, title: fd.get('name'), startDate: fd.get('startDate'), endDate: fd.get('endDate') || fd.get('startDate'),
      status: fd.get('status'), format: fd.get('format'), location: fd.get('location'),
      themes: fd.get('themes'), hostId, focusAgencies: fd.getAll('agencies'),
      organizerIds: gatherStaff(form, 'organizers'), technicalSupportTeam: gatherStaff(form, 'techSupport'),
      partnerOrgs: (fd.get('partners') || '').split(',').map(s => s.trim()).filter(Boolean),
      registrationUrl: fd.get('registrationUrl') || '#', notes: fd.get('notes')
    });
    stampCreate(c, 'Calendar');
    db.calendar.push(c); db.byId[id] = c;
    persistSoon();
    toast(`"${c.title}" added to the calendar.`);
    router();
  });
}

function wireCalendarFilter() {
  const search = document.getElementById('calSearch'); const status = document.getElementById('calStatus');
  if (!search) return;
  const render = () => {
    const q = (search.value || '').toLowerCase(); const st = status.value;
    const list = [...db.calendar]
      .filter(c => {
        if (st && c.status !== st) return false;
        if (q && ![c.title, c.location, c.format, (c.themes||[]).join(' ')].join(' ').toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    document.getElementById('calCount').textContent = `${list.length} upcoming event${list.length === 1 ? '' : 's'}`;
    document.getElementById('calResults').innerHTML = list.length ? list.map(calCard).join('') : '<p class="muted">No events match.</p>';
  };
  search.addEventListener('input', render); status.addEventListener('change', render); render();
}

// ---- Pipeline -------------------------------------------------------------
function pagePipeline() {
  const bands = [{ s: 'High Potential', k: 'high' }, { s: 'Needs Incubation', k: 'incubation' }, { s: 'Not Ready', k: 'notready' }];
  const counts = bands.map(b => ({ s: b.s, n: db.useCases.filter(u => u._band.key === b.k).length }));
  const inPipeline = db.useCases.filter(u => u.inPipeline);
  const max = Math.max(...counts.map(c => c.n), 1);
  const noOwner = db.useCases.filter(u => needsPipelineOwner(u));
  const quickWins = db.useCases.filter(u => u._flags.some(f => f.key === 'polished'));
  const strategic = db.useCases.filter(u => u._flags.some(f => f.key === 'strategic'));
  const ranked = [...db.useCases].sort((a, b) => b._score - a._score);
  setTimeout(() => { const b = document.getElementById('triageBtn'); if (b) b.addEventListener('click', () => { if (noOwner[0]) location.hash = `#/usecase/${noOwner[0].id}`; }); }, 0);
  return `
  <div class="page-head spread"><div><h1>Production Pipeline</h1><p>Turn demos into a managed funnel with owners and next steps.</p></div>
    <button class="btn" data-export="pipeline">⬇ Export pipeline CSV</button>
  </div>
  ${noOwner.length ? `<div class="alert-banner">🔴 <strong>${noOwner.length}</strong> pipeline use case${noOwner.length>1?'s have':' has'} no owner — ${noOwner.map(u=>`<a href="#/usecase/${u.id}">${esc(u.title)}</a>`).join(', ')}. <button class="btn" id="triageBtn" style="margin-left:auto">Triage now</button></div>` : ''}

  <div class="grid cols-2" style="margin-bottom:18px">
    <div class="card"><h3>Use cases by potential band</h3><div class="funnel">
      ${counts.map(c => `<div class="funnel-row"><span>${esc(c.s)}</span><span class="bar" style="width:${Math.max(12,(c.n/max)*100)}%">${c.n}</span><span></span></div>`).join('')}
    </div></div>
    <div class="card">
      <h3>Highlights</h3>
      <div class="stack-sm">
        <div><span class="chip good">📈 In pipeline</span> ${inPipeline.map(u=>`<a href="#/usecase/${u.id}">${esc(u.title)}</a>`).join(', ') || '—'}</div>
        <div><span class="chip good">✨ Polished builds</span> ${quickWins.map(u=>`<a href="#/usecase/${u.id}">${esc(u.title)}</a>`).join(', ') || '—'}</div>
        <div><span class="chip good">🎯 Strategic bets</span> ${strategic.map(u=>`<a href="#/usecase/${u.id}">${esc(u.title)}</a>`).join(', ') || '—'}</div>
        <div><span class="chip danger">🔴 No owner</span> ${noOwner.map(u=>`<a href="#/usecase/${u.id}">${esc(u.title)}</a>`).join(', ') || '—'}</div>
      </div>
    </div>
  </div>

  <h3 style="font-size:16px;margin:0 0 8px">All use cases by production potential</h3>
  <table class="tbl">
    <thead><tr><th>Use case</th><th>Agency</th><th>Pipeline</th><th>Score</th><th>Band</th><th>Owner</th></tr></thead>
    <tbody>${ranked.map(u => `<tr class="clickable" data-link="#/usecase/${u.id}">
      <td>${esc(u.title)}</td><td>${esc(agencyName(u.agencyId))}</td><td>${u.inPipeline?'✅':'—'}</td>
      <td><strong>${u._score}</strong></td><td>${bandBadge(u._band)}</td>
      <td>${hasOwner(u) ? esc(ownerDisplay(u)) : '<span class="chip danger">None</span>'}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// ---- Patterns -------------------------------------------------------------
function pagePatterns() {
  return `
  <div class="page-head"><h1>Reusable Accelerators &amp; Patterns</h1><p>Proven solution patterns the next team can start from.</p></div>
  <div class="grid cols-3">
    ${db.patterns.filter(notArchived).map(p => {
      const uses = useCasesForPattern(p.id);
      const accs = db.accelerators.filter(a => a.patternId === p.id);
      return `<div class="card hover" data-link="#/pattern/${p.id}">
        <div class="spread"><h3>${esc(p.name)}</h3><span class="chip ${p.repeatability==='High'?'good':''}">${esc(p.repeatability)}</span></div>
        <p class="muted tiny">${esc(p.summary)}</p>
        <div class="tag-row">${(p.components||[]).map(c=>`<span class="chip info">${esc(c)}</span>`).join('')}</div>
        <div class="divider"></div>
        <div class="tiny">Applied in <strong>${uses.length}</strong> use case${uses.length===1?'':'s'} · ${accs.length} accelerator${accs.length===1?'':'s'}</div>
      </div>`;
    }).join('')}
  </div>`;
}

function pagePattern(id) {
  const p = db.byId[id];
  if (!p) return `<p>Pattern not found.</p>`;
  const uses = useCasesForPattern(id);
  const accs = db.accelerators.filter(a => a.patternId === id);
  return `
  <div class="breadcrumb"><a href="#/patterns">Patterns</a> / ${esc(p.name)}</div>
  <div class="hero"><div class="spread"><h1>${esc(p.name)}</h1><span class="chip ${p.repeatability==='High'?'good':''}">Repeatability: ${esc(p.repeatability)}</span></div>
    <p class="muted">${esc(p.summary)}</p>
    <div class="tag-row">${(p.components||[]).map(c=>`<span class="chip info">${esc(c)}</span>`).join('')}</div>
  </div>
  <div class="detail-grid">
    <div>
      <h3 style="font-size:16px">Use cases applying this pattern (${uses.length})</h3>
      <div class="grid cols-2">${uses.map(ucCard).join('') || '<p class="muted">None yet.</p>'}</div>
    </div>
    <div class="card"><h3>Accelerators</h3>
      <div class="stack-sm">${accs.map(a=>`<div><a href="${esc(a.url)}">${esc(a.name)} ↗</a><div class="tiny muted">${esc(a.type)}</div></div>`).join('') || '<span class="muted tiny">None linked.</span>'}</div>
      <div class="divider"></div>
      <div class="tiny muted">Solution play: ${esc(p.solutionPlay||'—')}</div>
    </div>
  </div>`;
}

// ---- Lessons --------------------------------------------------------------
function pageLessons() {
  const imps = db.improvements.filter(notArchived);
  const blockers = topBlockers();
  const hasRetro = e => e.retrospective && Object.values(e.retrospective).some(v => v && String(v).trim());
  const withRetro = db.events.filter(hasRetro);
  setTimeout(wireLessonsFilter, 0);
  return `
  <div class="page-head"><h1>Lessons Learned</h1><p>Structured retrospectives across events — the loop that improves each hackathon.</p></div>
  ${blockers.length ? `<div class="card" style="margin-bottom:16px"><h3>⚠️ Recurring blockers &amp; high-severity items</h3>
    <div class="stack-sm">${blockers.map(b=>`<div class="spread"><div><strong>${esc(b.title)}</strong><div class="tiny muted">${esc(b.category)} · ${esc(eventName(b.eventId))}</div></div><span class="chip ${b.type==='Repeat blocker'?'danger':'warn'}">${esc(b.type)}</span></div>`).join('')}</div></div>` : ''}

  <div class="spread"><h3 class="sec-h" style="margin:0">Retrospective by event</h3>
    <label class="tiny muted">Filter&nbsp;<select id="lessonsEventFilter" class="select"><option value="">All events</option>${optTag(withRetro, e=>e.id, e=>e.name)}</select></label></div>
  <div id="lessonsRetros" style="margin-top:10px">
  ${withRetro.length ? withRetro.map(ev => `
    <details class="panel" data-event="${ev.id}" style="margin-bottom:10px">
      <summary>${esc(ev.name)} <span class="muted tiny">· ${fmtDate(ev.startDate)}</span></summary>
      <div class="panel-body">
        <div class="retro-grid">
          ${RETRO_FIELDS.map(f=>`<div class="retro-card"><div class="retro-cat">${esc(f.label)}</div><p>${ev.retrospective[f.key]?esc(ev.retrospective[f.key]):'<span class="muted tiny">Not captured.</span>'}</p></div>`).join('')}
        </div>
      </div>
    </details>`).join('') : '<p class="muted">No retrospectives captured yet — use <a href="#/register/feedback">Capture Feedback</a>.</p>'}
  </div>

  <h3 class="sec-h">Tracked improvement items</h3>
  <table class="tbl">
    <thead><tr><th>Item</th><th>Type</th><th>Category</th><th>Event</th><th>Severity</th><th>Status</th><th>Owner</th></tr></thead>
    <tbody>${imps.length ? imps.map(i=>`<tr><td>${esc(i.title)}<div class="tiny muted">${esc(i.suggestedAction)}</div></td><td>${esc(i.type)}</td><td>${esc(i.category)}</td><td>${esc(eventName(i.eventId))}</td><td>${esc(i.severity)}</td><td>${esc(i.status)}</td><td>${i.ownerId?esc(personName(i.ownerId)):'—'}</td></tr>`).join('') : '<tr><td colspan="7" class="muted">No items yet.</td></tr>'}</tbody>
  </table>`;
}

function wireLessonsFilter() {
  const sel = document.getElementById('lessonsEventFilter'); if (!sel) return;
  sel.addEventListener('change', () => {
    const v = sel.value;
    document.querySelectorAll('#lessonsRetros [data-event]').forEach(d => {
      const show = !v || d.dataset.event === v;
      d.style.display = show ? '' : 'none';
      if (v && d.dataset.event === v) d.open = true;
    });
  });
}

// ---- Register hub + forms -------------------------------------------------
const optTag = (arr, get = x => x, lbl = x => x) => arr.map(x => `<option value="${esc(get(x))}">${esc(lbl(x))}</option>`).join('');

function pageRegister() {
  const steps = [
    { n: 1, route: 'register/agency', title: 'Register an agency', desc: 'Capture the agency, jurisdiction, and customer decision maker.' },
    { n: 2, route: 'register/event', title: 'Manage an event', desc: 'Register participants, build teams, define use cases, align teams, assign coaches, and call out winners.' },
    { n: 3, route: 'register/usecase', title: 'Register a use case & team assignment', desc: 'Capture the challenge, solution, assign it to a team, and set the follow-up owner.' },
    { n: 4, route: 'register/pattern', title: 'Define a reusable pattern / accelerator', desc: 'Promote a repeatable solution so the next team starts ahead.' },
    { n: 5, route: 'register/feedback', title: 'Capture feedback', desc: 'Record the structured event retrospective across all ten categories.' }
  ];
  return `
  <div class="page-head"><h1>Register &amp; Capture</h1><p>Follow the steps in order. In production these are Power Apps forms writing to SharePoint lists, with curator approval via Power Automate.</p></div>
  <ol class="register-steps">
    ${steps.map(s => `<li data-link="#/${s.route}">
      <span class="step-n">${s.n}</span>
      <span class="step-body"><strong>${esc(s.title)}</strong><span class="muted tiny">${esc(s.desc)}</span></span>
      <span class="step-go">Open →</span>
    </li>`).join('')}
  </ol>`;
}

function formShell(title, intro, body, hintId = 'formHint') {
  return `
  <div class="breadcrumb"><a href="#/register">Register</a> / ${esc(title)}</div>
  <div class="page-head"><h1>${esc(title)}</h1><p>${esc(intro)}</p></div>
  <form id="regForm" class="card">
    <div class="form-grid">${body}</div>
    <div class="divider"></div>
    <div class="spread">
      <span class="hint" id="${hintId}">Required fields marked <span class="req">*</span>. ${formPersistHint()}</span>
      <button type="submit" class="btn primary">Submit</button>
    </div>
  </form>`;
}

function pageRegisterAgency() {
  setTimeout(() => wireSavingForm(async (fd) => {
    const id = `AG-NEW-${newIdSeq++}`;
    const ag = buildAgency({
      id, name: fd.get('name'), jurisdiction: fd.get('jurisdiction'),
      level: fd.get('level'), domain: fd.get('domain'),
      decisionMaker: {
        firstName: fd.get('dmFirstName'), lastName: fd.get('dmLastName'),
        jobTitle: fd.get('dmJobTitle'), role: fd.get('dmRole'),
        email: fd.get('dmEmail'), country: fd.get('dmCountry'), businessPhone: fd.get('dmBusinessPhone')
      }
    });
    db.agencies.push(ag); db.byId[id] = ag;
    stampCreate(ag, 'Agency');
    return {
      ok: `Agency "${ag.name}" registered — now available when creating an event.`,
      // If the save fails we roll the new record back out of memory so a retry
      // doesn't double-create, and the form keeps the user's typed values.
      rollback: () => { db.agencies.pop(); delete db.byId[id]; }
    };
  }), 0);
  return formShell('Register an Agency', 'Add a state or local government agency and its primary customer decision maker.', `
    <div class="form-field full"><label>Agency name <span class="req">*</span></label><input name="name" required placeholder="e.g., Metro Buildings Department"></div>
    <div class="form-field full"><label>Jurisdiction <span class="req">*</span></label><input name="jurisdiction" required placeholder="e.g., Metro City"></div>
    <div class="form-field"><label>Government level</label><select name="level">${optTag(['City','County','State','Regional / Authority','Federal'])}</select></div>
    <div class="form-field"><label>Primary domain</label><input name="domain" placeholder="e.g., Permitting, Benefits, Transit"></div>

    <div class="form-section full"><span class="form-section-title">Customer decision maker</span></div>
    <div class="form-field"><label>First name <span class="req">*</span></label><input name="dmFirstName" required placeholder="e.g., Anwar"></div>
    <div class="form-field"><label>Last name <span class="req">*</span></label><input name="dmLastName" required placeholder="e.g., Shaikh"></div>
    <div class="form-field"><label>Job title <span class="req">*</span></label><input name="dmJobTitle" required placeholder="e.g., Deputy Commissioner, Technology"></div>
    <div class="form-field"><label>Role</label><input name="dmRole" placeholder="e.g., Economic Buyer, Champion"></div>
    <div class="form-field"><label>Email <span class="req">*</span></label><input type="email" name="dmEmail" required placeholder="name@agency.gov"></div>
    <div class="form-field"><label>Country <span class="req">*</span></label><input name="dmCountry" required value="United States"></div>
    <div class="form-field"><label>Business phone</label><input name="dmBusinessPhone" placeholder="+1 212-555-0100"></div>
  `);
}

// ====================================================================
// MANAGE AN EVENT — end-to-end event workspace
// ====================================================================
const MANAGE_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'participants', label: 'Participants' },
  { key: 'teams', label: 'Teams' },
  { key: 'usecases', label: 'Use Cases' },
  { key: 'align', label: 'Team ↔ Use Case' },
  { key: 'coaches', label: 'Coaches / CSA' },
  { key: 'winners', label: 'Winning Use Cases' },
  { key: 'pipeline', label: 'Pipeline / Potentials' }
];
let manageState = { eventId: null, tab: 'overview' };
const manageAttendees = {}; // eventId -> [{id,name,agency,teamId,role,email}]
let newIdSeq = 1;

function decorateUc(uc) {
  return factoryDecorate(uc);
}

function eventAttendees(eventId) {
  if (!manageAttendees[eventId]) {
    const list = [];
    teamsForEvent(eventId).forEach(t => (t.participants || []).forEach((p, i) => {
      list.push({ id: `AT-${t.id}-${i}`, name: p.replace(/\s*\(.*\)$/, ''), agency: t.agencyId, teamId: t.id, role: 'Participant', email: '' });
    }));
    manageAttendees[eventId] = list;
  }
  return manageAttendees[eventId];
}

const evAgencyIds = (ev) => (ev.agencyMix && ev.agencyMix.length ? ev.agencyMix : db.agencies.map(a => a.id));
const evAgencyOpts = (ev) => evAgencyIds(ev).map(id => `<option value="${id}">${esc(agencyName(id))}</option>`).join('');

function pageManageEvent() {
  if (!manageState.eventId || !db.byId[manageState.eventId]) manageState.eventId = db.events[0]?.id || null;
  setTimeout(mountManage, 0);
  return `
  <div class="breadcrumb"><a href="#/register">Register</a> / Manage an Event</div>
  <div class="page-head"><h1>Manage an Event</h1><p>Run the event end-to-end: register participants, build teams, define use cases, align teams, assign coaches, and call out winners. <span class="hint">${formPersistHint()}</span></p></div>
  <div class="manage-toolbar">
    <label class="tiny muted">Managing event &nbsp;<select id="manageEventSel" class="select">${optTag(db.events, e=>e.id, e=>e.name)}</select></label>
    <button class="btn" id="newEventBtn">+ New event</button>
  </div>
  <div id="manageRoot"></div>`;
}

function mountManage() {
  const sel = document.getElementById('manageEventSel');
  if (sel) { sel.value = manageState.eventId; sel.onchange = () => { manageState.eventId = sel.value; manageState.tab = 'overview'; renderManage(); }; }
  const nb = document.getElementById('newEventBtn');
  if (nb) nb.onclick = showNewEventForm;
  renderManage();
}

function showNewEventForm() {
  const root = document.getElementById('manageRoot'); if (!root) return;
  root.innerHTML = `
  <form id="newEventForm" class="card">
    <h3 style="margin-top:0">Create a new event</h3>
    <div class="form-grid">
      ${eventFormFields()}
    </div>
    <div class="divider"></div>
    <div class="spread"><span class="hint" id="newEvtHint">Required fields marked <span class="req">*</span>.</span>
      <div><button type="button" class="btn" id="cancelNewEvt">Cancel</button> <button type="submit" class="btn primary">Create &amp; manage</button></div></div>
  </form>`;
  document.getElementById('cancelNewEvt').onclick = renderManage;
  wireStaffRows(document.getElementById('newEventForm'));
  const evForm = document.getElementById('newEventForm');
  let createdEventId = null;
  wireSavingForm((fd) => {
    if (fd.get('endDate') && fd.get('endDate') < fd.get('startDate')) return 'End date cannot be before start date.';
    let hostId = fd.get('host') || null;
    let newPersonId = null;
    const hostNew = (fd.get('hostNew') || '').trim();
    if (hostNew) {
      const pid = `PR-NEW-${newIdSeq++}`;
      const person = buildPerson({ id: pid, name: hostNew, roleTitle: 'Event host', hackathonRoles: ['Host'] });
      db.people.push(person); db.byId[pid] = person; hostId = pid; newPersonId = pid;
    }
    const id = `EV-NEW-${newIdSeq++}`;
    const ev = buildEvent({
      id, name: fd.get('name'), startDate: fd.get('startDate'), endDate: fd.get('endDate'),
      location: fd.get('location'), format: fd.get('format'), hostId, status: fd.get('status'),
      agencyMix: fd.getAll('agencies'),
      organizerIds: gatherStaff(evForm, 'organizers'), technicalSupportTeam: gatherStaff(evForm, 'techSupport'),
      partnerOrgs: (fd.get('partners') || '').split(',').map(s => s.trim()).filter(Boolean),
      themes: fd.get('themes'), registrationUrl: fd.get('registrationUrl') || '#', notes: fd.get('notes')
    });
    db.events.push(ev); db.byId[id] = ev;
    stampCreate(ev, 'Event');
    createdEventId = id;
    return {
      ok: `Event "${ev.name}" created.`,
      rollback: () => {
        createdEventId = null;
        db.events.pop(); delete db.byId[id];
        if (newPersonId) { db.people.pop(); delete db.byId[newPersonId]; }
      }
    };
  }, { form: evForm, hintId: 'newEvtHint', onSuccess: () => {
    manageState.eventId = createdEventId; manageState.tab = 'overview';
    renderManage();
  } });
}

function renderManage() {
  const root = document.getElementById('manageRoot'); if (!root) return;
  const ev = db.byId[manageState.eventId];
  if (!ev) { root.innerHTML = '<div class="card">No event selected. Create one to begin.</div>'; return; }
  const sel = document.getElementById('manageEventSel'); if (sel) sel.value = ev.id;
  root.innerHTML = `
    <div class="tabs">${MANAGE_TABS.map(t => `<button data-mtab="${t.key}" class="${t.key===manageState.tab?'active':''}">${esc(t.label)}</button>`).join('')}</div>
    <div id="manageBody">${renderManageTab(ev)}</div>`;
  root.querySelectorAll('[data-mtab]').forEach(b => b.onclick = () => { manageState.tab = b.dataset.mtab; renderManage(); });
  wireManageBody(ev);
}

function renderManageTab(ev) {
  switch (manageState.tab) {
    case 'participants': return manageParticipants(ev);
    case 'teams': return manageTeams(ev);
    case 'usecases': return manageUseCases(ev);
    case 'align': return manageAlign(ev);
    case 'coaches': return manageCoaches(ev);
    case 'winners': return manageWinners(ev);
    case 'pipeline': return managePipeline(ev);
    default: return manageOverview(ev);
  }
}

function manageOverview(ev) {
  const ucs = useCasesForEvent(ev.id), teams = teamsForEvent(ev.id), at = eventAttendees(ev.id);
  return `
  <div class="grid cols-4" style="margin-bottom:16px">
    <div class="kpi"><div class="num">${at.length}</div><div class="lbl">Attendees</div></div>
    <div class="kpi"><div class="num">${teams.length}</div><div class="lbl">Teams</div></div>
    <div class="kpi"><div class="num">${ucs.length}</div><div class="lbl">Use cases</div></div>
    <div class="kpi good"><div class="num">${ucs.filter(u=>u._band.key==='high').length}</div><div class="lbl">High potential</div></div>
  </div>
  <div class="card"><div class="spread"><h3 style="margin:0 0 4px">Event details</h3>${recordActions('event', ev.id)}</div><dl class="fields">
    <dt>Event</dt><dd>${esc(ev.name)}</dd>
    <dt>Dates</dt><dd>${fmtDate(ev.startDate)} – ${fmtDate(ev.endDate)}</dd>
    <dt>Location</dt><dd>${esc(ev.location)}</dd>
    <dt>Format</dt><dd>${esc(ev.format)}</dd>
    <dt>Host</dt><dd>${ev.hostId?esc(personName(ev.hostId)):'—'}</dd>
    <dt>Agencies</dt><dd>${(ev.agencyMix||[]).map(a=>`<span class="chip">${esc(agencyName(a))}</span>`).join(' ') || '—'}</dd>
    <dt>Organizers</dt><dd>${(ev.organizerIds||[]).map(staffLabel).join(', ') || '—'}</dd>
    <dt>Technical support</dt><dd>${(ev.technicalSupportTeam||[]).map(staffLabel).join(', ') || '—'}</dd>
    <dt>Partners</dt><dd>${(ev.partnerOrgs||[]).map(esc).join(', ') || '—'}</dd>
    <dt>Winner</dt><dd>${(ev.winnerUseCaseIds||[]).map(w=>esc(db.byId[w]?.title||w)).join(', ') || '—'}</dd>
  </dl>
  <details class="panel" style="margin-top:12px"><summary>Edit organizers, technical support &amp; partners</summary><div class="panel-body">
    <form data-mform="eventdetails" class="form-grid">
      <div class="form-field full"><label>Organizers <span class="hint">(first / last / email)</span></label>${staffRows('organizers', ev.organizerIds || [])}</div>
      <div class="form-field full"><label>Technical support team <span class="hint">(first / last / email)</span></label>${staffRows('techSupport', ev.technicalSupportTeam || [])}</div>
      <div class="form-field full"><label>Partners <span class="hint">(comma-separated)</span></label><input name="partners" value="${esc((ev.partnerOrgs||[]).join(', '))}"></div>
      <div class="form-field full"><button class="btn primary">Save event details</button></div>
    </form>
  </div></details>
  <p class="hint" style="margin-top:12px">Use the tabs above to run each step of the event. The public event page is <a href="#/event/${ev.id}">here</a>.</p></div>`;
}

function manageParticipants(ev) {
  const at = eventAttendees(ev.id);
  return `
  <div class="card" style="margin-bottom:16px"><h3 style="margin-top:0">Register a participant</h3>
    <form data-mform="attendee" class="form-grid">
      <div class="form-field"><label>Full name <span class="req">*</span></label><input name="name" required></div>
      <div class="form-field"><label>Agency</label><select name="agency">${evAgencyOpts(ev)}</select></div>
      <div class="form-field"><label>Role</label><select name="role">${optTag(['Participant','Team lead','Observer','Agency sponsor'])}</select></div>
      <div class="form-field"><label>Email</label><input type="email" name="email" placeholder="name@agency.gov"></div>
      <div class="form-field full"><button class="btn primary">Add to attendee list</button></div>
    </form></div>
  <h4 class="sub-h" style="margin-top:0">Attendee list (${at.length})</h4>
  <table class="tbl"><thead><tr><th>Name</th><th>Agency</th><th>Role</th><th>Email</th><th>Team</th><th></th></tr></thead>
  <tbody>${at.length ? at.map(a=>`<tr>
    <td>${esc(a.name)}</td><td>${esc(agencyName(a.agency))}</td><td>${esc(a.role)}</td><td>${esc(a.email||'—')}</td>
    <td>${a.teamId?esc(team(a.teamId)?.name||'—'):'<span class="muted tiny">Unassigned</span>'}</td>
    <td><button class="linkbtn" data-remove="attendee" data-id="${a.id}">Remove</button></td></tr>`).join('') : '<tr><td colspan="6" class="muted">No attendees yet.</td></tr>'}</tbody></table>`;
}

function manageTeams(ev) {
  const teams = teamsForEvent(ev.id), at = eventAttendees(ev.id);
  return `
  <div class="card" style="margin-bottom:16px"><h3 style="margin-top:0">Create a team</h3>
    <form data-mform="team" class="form-grid">
      <div class="form-field"><label>Team name <span class="req">*</span></label><input name="name" required placeholder="e.g., Team 5 — Permit Pathfinders"></div>
      <div class="form-field"><label>Agency <span class="req">*</span></label><select name="agency" required>${evAgencyOpts(ev)}</select></div>
      <div class="form-field full"><button class="btn primary">Create team</button></div>
    </form></div>
  <h4 class="sub-h" style="margin-top:0">Teams (${teams.length})</h4>
  <table class="tbl"><thead><tr><th>Team</th><th>Agency</th><th>Attendees</th><th>Coaches / CSA</th><th>Use cases</th><th></th></tr></thead>
  <tbody>${teams.length ? teams.map(t=>`<tr>
    <td>${esc(t.name)}</td><td>${esc(agencyName(t.agencyId))}</td>
    <td>${at.filter(a=>a.teamId===t.id).length}</td>
    <td>${(t.csaIds||[]).map(personName).join(', ') || '—'}</td>
    <td>${(t.useCaseIds||[]).length}</td>
    <td><button class="linkbtn" data-remove="team" data-id="${t.id}">Remove</button></td></tr>`).join('') : '<tr><td colspan="6" class="muted">No teams yet.</td></tr>'}</tbody></table>`;
}

function manageUseCases(ev) {
  const ucs = useCasesForEvent(ev.id), teams = teamsForEvent(ev.id);
  const peopleOpt = (sel) => `<option value="">${esc(sel)}</option>${optTag(db.people, p=>p.id, p=>p.name)}`;
  return `
  <div class="card" style="margin-bottom:16px"><h3 style="margin-top:0">Define a use case</h3>
    <p class="muted tiny" style="margin:0 0 12px">Capture the full use case here while managing the event. Only the title and agency are required — fill the rest as you have it. Lifecycle is the computed Band plus pipeline membership (no status).</p>
    <form data-mform="usecase">
      <div class="form-grid">
        <div class="form-field full"><label>Title <span class="req">*</span></label><input name="title" required placeholder="e.g., AI permit-status assistant"></div>
        <div class="form-field"><label>Agency <span class="req">*</span></label><select name="agency" required>${evAgencyOpts(ev)}</select></div>
        <div class="form-field"><label>Assign to team</label><select name="team"><option value="">Unassigned</option>${optTag(teams, t=>t.id, t=>t.name)}</select></div>
        <div class="form-field"><label>Production pipeline</label><label style="display:flex;align-items:center;gap:6px;font-weight:400"><input type="checkbox" name="inPipeline"> Mark as a pipeline candidate</label></div>
        <div class="form-field full"><label>Business problem</label><textarea name="problem" placeholder="What problem does this address?"></textarea></div>
        <div class="form-field full"><label>Proposed solution</label><textarea name="solution" placeholder="What was built / proposed?"></textarea></div>
      </div>

      <details class="panel"><summary>Overview detail</summary><div class="panel-body"><div class="form-grid">
        <div class="form-field full"><label>Current process / pain</label><textarea name="current"></textarea></div>
        <div class="form-field full"><label>Challenge summary</label><textarea name="challenge"></textarea></div>
        <div class="form-field full"><label>End users / beneficiaries</label><input name="beneficiaries"></div>
        <div class="form-field full"><label>Industry applicability <span class="hint">(comma-separated)</span></label><input name="industries"></div>
      </div></div></details>

      <details class="panel"><summary>Solution &amp; tech</summary><div class="panel-body"><div class="form-grid">
        <div class="form-field full"><label>Key components <span class="hint">(comma-separated)</span></label><input name="components"></div>
        <div class="form-field full"><label>GitHub Copilot role</label><input name="copilotRole"></div>
        <div class="form-field full"><label>Azure / M365 / AI services <span class="hint">(comma-separated)</span></label><input name="services"></div>
        <div class="form-field full"><label>Solution pattern</label><select name="pattern"><option value="">None</option>${optTag(db.patterns, p=>p.id, p=>p.name)}</select></div>
        <div class="form-field full"><label>Data dependencies</label><textarea name="dataDeps"></textarea></div>
        <div class="form-field full"><label>Security / compliance</label><textarea name="complianceNote"></textarea></div>
        <div class="form-field full"><label>Risks / blockers</label><textarea name="risks"></textarea></div>
      </div></div></details>

      <details class="panel"><summary>Value &amp; impact</summary><div class="panel-body"><div class="form-grid">
        <div class="form-field full"><label>Business value</label><textarea name="bizValue"></textarea></div>
        <div class="form-field full"><label>Estimated impact</label><textarea name="impact"></textarea></div>
        <div class="form-field"><label>Impact metric</label><input name="impactMetric"></div>
        <div class="form-field"><label>Production feasibility</label><select name="feasibility"><option value="">Select…</option>${optTag(['High','Medium','Low'])}</select></div>
        <div class="form-field full"><label>Reusability / repeatability</label><textarea name="reusability"></textarea></div>
      </div></div></details>

      <details class="panel"><summary>Champions &amp; follow-ups</summary><div class="panel-body"><div class="form-grid">
        <div class="form-field"><label>Executive sponsor</label><select name="execSponsor">${peopleOpt('— none —')}</select></div>
        <div class="form-field"><label>Champion — Apps</label><select name="champApps">${peopleOpt('— none —')}</select></div>
        <div class="form-field"><label>Champion — Data / AI</label><select name="champData">${peopleOpt('— none —')}</select></div>
        <div class="form-field full"><label>MS supporting teams <span class="hint">(comma-separated)</span></label><input name="supportTeams"></div>
        <div class="form-field full"><label>Recommended next step</label><input name="nextStep" placeholder="e.g., Scope a 4-week production pilot"></div>
      </div></div></details>

      <div class="spread" style="margin-top:14px"><span class="hint">Title &amp; agency required.</span><button class="btn primary">Add use case</button></div>
    </form></div>
  <h4 class="sub-h" style="margin-top:0">Use cases (${ucs.length})</h4>
  <table class="tbl"><thead><tr><th>Title</th><th>Agency</th><th>Team</th><th>Band</th><th>Pipeline</th><th></th></tr></thead>
  <tbody>${ucs.length ? ucs.map(u=>`<tr>
    <td><a href="#/usecase/${u.id}">${esc(u.title)}</a></td><td>${esc(agencyName(u.agencyId))}</td>
    <td>${u.teamId?esc(team(u.teamId)?.name||'—'):'<span class="muted tiny">Unassigned</span>'}</td>
    <td>${bandBadge(u._band)}</td><td>${u.inPipeline?'✅':'—'}</td>
    <td><button class="linkbtn" data-remove="usecase" data-id="${u.id}">Remove</button></td></tr>`).join('') : '<tr><td colspan="6" class="muted">No use cases yet.</td></tr>'}</tbody></table>`;
}

function manageAlign(ev) {
  const ucs = useCasesForEvent(ev.id), teams = teamsForEvent(ev.id);
  return `
  <p class="muted">Align each use case to the team that will build it.</p>
  <table class="tbl"><thead><tr><th>Use case</th><th>Agency</th><th>Assigned team</th></tr></thead>
  <tbody>${ucs.length ? ucs.map(u=>`<tr>
    <td>${esc(u.title)}</td><td>${esc(agencyName(u.agencyId))}</td>
    <td><select class="select" data-assign-team="${u.id}"><option value="">Unassigned</option>${teams.map(t=>`<option value="${t.id}" ${t.id===u.teamId?'selected':''}>${esc(t.name)}</option>`).join('')}</select></td>
    </tr>`).join('') : '<tr><td colspan="3" class="muted">No use cases to align.</td></tr>'}</tbody></table>`;
}

function manageCoaches(ev) {
  const teams = teamsForEvent(ev.id);
  return `
  <p class="muted">Add coaches / CSAs to each team — just their name and email.</p>
  ${teams.length ? teams.map(t=>`
    <div class="card" style="margin-bottom:12px">
      <div class="spread"><strong>${esc(t.name)}</strong><span class="chip">${esc(agencyName(t.agencyId))}</span></div>
      <div class="tag-row" style="margin:10px 0">
        ${(t.csaIds||[]).length ? t.csaIds.map(id=>{
          const p = db.byId[id];
          const label = p ? `${esc(p.name)}${p.email?` · ${esc(p.email)}`:''}` : esc(personName(id));
          return `<span class="chip good">${label} <button class="chip-x" data-team="${t.id}" data-removecoach="${id}" title="Remove">×</button></span>`;
        }).join('') : '<span class="muted tiny">No coaches yet.</span>'}
      </div>
      <div class="form-grid" data-coach-form="${t.id}">
        <div class="form-field"><label>First name</label><input data-coach-first placeholder="e.g., Priya"></div>
        <div class="form-field"><label>Last name</label><input data-coach-last placeholder="e.g., Nair"></div>
        <div class="form-field"><label>Email</label><input type="email" data-coach-email placeholder="name@microsoft.com"></div>
        <div class="form-field" style="justify-content:flex-end"><button class="btn primary" data-add-coach="${t.id}">Add coach</button></div>
      </div>
    </div>`).join('') : '<div class="card muted">No teams yet — create teams first.</div>'}`;
}

const WINNER_PLACES = ['1st Place', '2nd Place', '3rd Place'];

function syncWinnerIds(ev) {
  ev.winnerUseCaseIds = (ev.winners || []).filter(w => w.ucId).map(w => w.ucId);
}

function manageWinners(ev) {
  const ucs = useCasesForEvent(ev.id).slice().sort((a, b) => b._score - a._score);
  ev.winners = ev.winners || [];
  const byPlace = {}; ev.winners.forEach(w => { byPlace[w.place] = w; });
  const rank = {}; ucs.forEach((u, i) => { rank[u.id] = i + 1; });
  const medalFor = (i) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
  const matrix = `
  <h4 class="sub-h" style="margin-top:0">Judging matrix — score each use case, ranked by production potential</h4>
  <p class="muted tiny">Judges score each dimension 0–3 directly in this matrix. The weighted score (0–100) ranks every use case live. The top three are suggested winners — use <em>Auto-fill from scores</em>, then confirm and add a rationale.</p>
  ${scoringGuide()}
  <div class="tbl-scroll">
  <table class="tbl matrix"><thead><tr><th>#</th><th>Use case</th><th>Team</th>${DIMENSIONS.map(d=>`<th class="num" title="${esc(d.label)} (weight ${d.weight})">${esc(d.label.split(' ').map(w=>w[0]).join('').slice(0,3).toUpperCase())}</th>`).join('')}<th class="num">Score</th><th>Band</th></tr></thead>
  <tbody>${ucs.length ? ucs.map((u, i) => `<tr class="${i<3?'top-rank':''}">
    <td>${medalFor(i) || (i+1)}</td>
    <td><a href="#/usecase/${u.id}">${esc(u.title)}</a></td>
    <td class="tiny">${u.teamId?esc(team(u.teamId)?.name||'—'):'<span class="muted">—</span>'}</td>
    ${DIMENSIONS.map(d=>{const s=Number(u.scores?.[d.key]??0);return `<td class="num ${s>=3?'s3':s>=1?'s1':'s0'}"><select class="mini-score" data-uc-score="${u.id}" data-dim="${d.key}">${[0,1,2,3].map(n=>`<option value="${n}" ${n===s?'selected':''}>${n}</option>`).join('')}</select></td>`;}).join('')}
    <td class="num"><strong>${u._score}</strong></td>
    <td>${bandBadge(u._band)}</td>
  </tr>`).join('') : `<tr><td colspan="${DIMENSIONS.length+5}" class="muted">No use cases yet.</td></tr>`}</tbody></table>
  </div>
  <div class="spread" style="margin:10px 0 18px"><span class="hint">Judges set the scores here. Editing any score re-ranks this matrix instantly.</span>${ucs.length?`<button class="btn" data-suggest-winners>Auto-fill winners from scores</button>`:''}</div>`;

  return `
  ${matrix}
  <h4 class="sub-h">Confirm winners &amp; rationale</h4>
  <p class="muted tiny">Score decides the ranking; you confirm each place and record <strong>why</strong> it was chosen. Rationale is saved with the event.</p>
  ${WINNER_PLACES.map(place => {
    const w = byPlace[place] || {};
    const medal = place === '1st Place' ? '🥇' : place === '2nd Place' ? '🥈' : '🥉';
    return `
    <div class="card" style="margin-bottom:14px">
      <h3 style="margin-top:0">${medal} ${esc(place)}</h3>
      <div class="form-grid">
        <div class="form-field full"><label>Winning use case</label>
          <select class="select" data-winner-place="${esc(place)}"><option value="">— none —</option>${ucs.map(u=>`<option value="${u.id}" ${w.ucId===u.id?'selected':''}>#${rank[u.id]} · ${esc(u.title)} — ${u._score}/100 (${esc(agencyName(u.agencyId))})</option>`).join('')}</select></div>
        <div class="form-field full"><label>Why this was chosen <span class="req">*</span></label>
          <textarea data-winner-rationale="${esc(place)}" placeholder="What made this use case stand out — impact, feasibility, demo quality…">${esc(w.rationale||'')}</textarea></div>
      </div>
    </div>`;
  }).join('')}
  <div class="spread"><span class="hint" id="winnersHint">Selections save as you change them. Add a rationale before saving.</span><button class="btn primary" data-save-winners>Save rationale</button></div>`;
}

function managePipeline(ev) {
  const ucs = useCasesForEvent(ev.id);
  const winners = ev.winnerUseCaseIds || [];
  return `
  <p class="muted">After the hackathon, coaches build the production pipeline: mark the use cases worth advancing and assign a production owner. Lifecycle is expressed by the computed Band and pipeline membership — no manual status.</p>
  <table class="tbl"><thead><tr><th>Pipeline?</th><th>Use case</th><th>Team</th><th>Band</th><th>Owner name</th><th>Owner email</th></tr></thead>
  <tbody>${ucs.length ? ucs.map(u=>`<tr>
    <td style="text-align:center"><input type="checkbox" data-mark-potential="${u.id}" ${u.inPipeline?'checked':''}></td>
    <td>${esc(u.title)} ${winners.includes(u.id)?'🏆':''}</td>
    <td>${u.teamId?esc(team(u.teamId)?.name||'—'):'<span class="muted tiny">Unassigned</span>'}</td>
    <td>${bandBadge(u._band)}</td>
    <td><input class="select" data-owner-name="${u.id}" value="${esc(u.ownerName||'')}" placeholder="Full name"></td>
    <td><input class="select" type="email" data-owner-email="${u.id}" value="${esc(u.ownerEmail||'')}" placeholder="name@org.gov"></td>
    </tr>`).join('') : '<tr><td colspan="6" class="muted">No use cases yet.</td></tr>'}</tbody></table>
  <p class="hint" style="margin-top:12px">Selected items appear in the program <a href="#/pipeline">Pipeline</a>. The owner is captured here, at the pipeline step.</p>`;
}

function wireManageBody(ev) {
  const body = document.getElementById('manageBody'); if (!body) return;
  body.querySelectorAll('form[data-mform]').forEach(f => f.addEventListener('submit', (e) => {
    e.preventDefault(); if (!f.reportValidity()) return; handleManageAdd(ev, f.dataset.mform, new FormData(f));
  }));
  body.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.assignTeam !== undefined) { assignUcTeam(t.dataset.assignTeam, t.value); renderManage(); }
    else if (t.dataset.winnerPlace !== undefined) { setWinnerPlace(ev, t.dataset.winnerPlace, t.value); renderManage(); }
    else if (t.dataset.markPotential !== undefined) { togglePotential(ev, t.dataset.markPotential, t.checked); }
    else if (t.dataset.ucScore !== undefined) {
      const uc = db.byId[t.dataset.ucScore];
      if (uc) { uc.scores = uc.scores || {}; uc.scores[t.dataset.dim] = Number(t.value); decorateUc(uc); stampEdit(uc, 'Use case', `Judging score "${t.dataset.dim}" set to ${t.value}`); persistSoon(); renderManage(); }
    }
  });
  // Owner inputs persist on input without re-rendering, so typing is not interrupted.
  body.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.ownerName !== undefined) { const uc = db.byId[t.dataset.ownerName]; if (uc) { uc.ownerName = t.value; uc.modifiedBy = CURRENT_USER; uc.modifiedAt = nowIso(); persistSoon(); } }
    else if (t.dataset.ownerEmail !== undefined) { const uc = db.byId[t.dataset.ownerEmail]; if (uc) { uc.ownerEmail = t.value; uc.modifiedBy = CURRENT_USER; uc.modifiedAt = nowIso(); persistSoon(); } }
  });
  wireStaffRows(body);
  body.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]'); if (rm) { handleManageRemove(ev, rm.dataset.remove, rm.dataset.id); return; }
    const rc = e.target.closest('[data-removecoach]'); if (rc) { removeCoach(rc.dataset.team, rc.dataset.removecoach); renderManage(); return; }
    const ac = e.target.closest('[data-add-coach]');
    if (ac) {
      e.preventDefault();
      const wrap = ac.closest('[data-coach-form]');
      const first = wrap.querySelector('[data-coach-first]').value.trim();
      const last = wrap.querySelector('[data-coach-last]').value.trim();
      const email = wrap.querySelector('[data-coach-email]').value.trim();
      if (!first && !last) { toast('Enter at least a first or last name.'); return; }
      addCoach(ac.dataset.addCoach, { first, last, email }); renderManage(); return;
    }
    if (e.target.closest('[data-suggest-winners]')) {
      suggestWinnersFromScores(ev); renderManage(); return;
    }
    if (e.target.closest('[data-save-winners]')) {
      body.querySelectorAll('[data-winner-rationale]').forEach(ta => setWinnerRationale(ev, ta.dataset.winnerRationale, ta.value));
      persistSoon();
      toast('Winner rationale saved.');
    }
  });
}

function handleManageAdd(ev, kind, fd) {
  if (kind === 'attendee') {
    eventAttendees(ev.id).push({ id: `AT-NEW-${newIdSeq++}`, name: fd.get('name'), agency: fd.get('agency'), teamId: null, role: fd.get('role'), email: fd.get('email') });
    toast('Participant added to the attendee list.');
  } else if (kind === 'team') {
    const id = `T-NEW-${newIdSeq++}`;
    const t = buildTeam({ id, name: fd.get('name'), eventId: ev.id, agencyId: fd.get('agency'), managerId: ev.hostId || null });
    db.teams.push(t); db.byId[id] = t; stampCreate(t, 'Team'); toast('Team created.');
  } else if (kind === 'usecase') {
    const splitList = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
    const id = `UC-NEW-${newIdSeq++}`;
    const champions = {};
    if (fd.get('champApps')) champions.apps = fd.get('champApps');
    if (fd.get('champData')) champions.dataai = fd.get('champData');
    const uc = buildUseCase({
      id, title: fd.get('title'), eventId: ev.id, agencyId: fd.get('agency'),
      teamId: fd.get('team') || null, inPipeline: fd.get('inPipeline') === 'on',
      businessProblem: fd.get('problem'), currentProcess: fd.get('current'),
      challengeSummary: fd.get('challenge'), proposedSolution: fd.get('solution'),
      beneficiaries: fd.get('beneficiaries'), industries: splitList(fd.get('industries')),
      components: splitList(fd.get('components')), copilotRole: fd.get('copilotRole'),
      services: splitList(fd.get('services')), patternId: fd.get('pattern') || null,
      dataDependencies: fd.get('dataDeps'), compliance: fd.get('complianceNote'), risks: fd.get('risks'),
      businessValue: fd.get('bizValue'), estimatedImpact: fd.get('impact'),
      impactMetric: fd.get('impactMetric'), feasibility: fd.get('feasibility'), reusability: fd.get('reusability'),
      champions, execSponsorId: fd.get('execSponsor') || null, supportTeams: splitList(fd.get('supportTeams')),
      nextStep: fd.get('nextStep')
    });
    db.useCases.push(uc); db.byId[id] = uc;
    stampCreate(uc, 'Use case');
    if (uc.teamId) { const tm = db.byId[uc.teamId]; if (tm) { tm.useCaseIds = tm.useCaseIds || []; tm.useCaseIds.push(id); } }
    toast(`Use case added — ${uc._band.label} (${uc._score}/100).`);
  } else if (kind === 'eventdetails') {
    ev.organizerIds = gatherStaff(document.querySelector('form[data-mform="eventdetails"]'), 'organizers');
    ev.technicalSupportTeam = gatherStaff(document.querySelector('form[data-mform="eventdetails"]'), 'techSupport');
    ev.partnerOrgs = (fd.get('partners') || '').split(',').map(s => s.trim()).filter(Boolean);
    stampEdit(ev, 'Event', 'Organizers / support / partners updated');
    toast('Event details saved.');
  }
  persistSoon();
  renderManage();
}

function handleManageRemove(ev, kind, id) {
  if (kind === 'attendee') { manageAttendees[ev.id] = eventAttendees(ev.id).filter(a => a.id !== id); }
  else if (kind === 'team') { db.teams = db.teams.filter(t => t.id !== id); delete db.byId[id]; eventAttendees(ev.id).forEach(a => { if (a.teamId === id) a.teamId = null; }); db.useCases.forEach(u => { if (u.teamId === id) u.teamId = null; }); }
  else if (kind === 'usecase') { db.useCases = db.useCases.filter(u => u.id !== id); delete db.byId[id]; db.teams.forEach(t => { if (t.useCaseIds) t.useCaseIds = t.useCaseIds.filter(x => x !== id); }); }
  toast('Removed.'); renderManage();
}

function assignUcTeam(ucId, teamId) {
  const uc = db.byId[ucId]; if (!uc) return;
  const old = uc.teamId; if (old && db.byId[old]?.useCaseIds) db.byId[old].useCaseIds = db.byId[old].useCaseIds.filter(x => x !== ucId);
  uc.teamId = teamId || null;
  if (teamId) { const t = db.byId[teamId]; if (t) { t.useCaseIds = t.useCaseIds || []; if (!t.useCaseIds.includes(ucId)) t.useCaseIds.push(ucId); } }
  toast('Use case aligned to team.');
}

function addCoach(teamId, coach) {
  const t = db.byId[teamId]; if (!t) return;
  const id = `PR-NEW-${newIdSeq++}`;
  const person = buildPerson({ id, first: coach.first, last: coach.last, email: coach.email, roleTitle: 'Coach / CSA', hackathonRoles: ['Coach'] });
  const name = person.name;
  db.people.push(person); db.byId[id] = person;
  t.csaIds = t.csaIds || []; t.csaIds.push(id);
  persistSoon();
  toast(`Coach "${name}" added.`);
}
function removeCoach(teamId, personId) { const t = db.byId[teamId]; if (t && t.csaIds) { t.csaIds = t.csaIds.filter(x => x !== personId); persistSoon(); toast('Coach removed.'); } }
function togglePotential(ev, ucId, on) { const uc = db.byId[ucId]; if (uc) uc.inPipeline = !!on; persistSoon(); toast(on ? 'Marked for pipeline.' : 'Removed from pipeline.'); }

function setWinnerPlace(ev, place, ucId) {
  ev.winners = ev.winners || [];
  let w = ev.winners.find(x => x.place === place);
  if (!ucId) { ev.winners = ev.winners.filter(x => x.place !== place); }
  else if (w) { w.ucId = ucId; }
  else { ev.winners.push({ place, ucId, rationale: '' }); }
  syncWinnerIds(ev);
  persistSoon();
  toast(ucId ? `${place} set.` : `${place} cleared.`);
}

function setWinnerRationale(ev, place, rationale) {
  ev.winners = ev.winners || [];
  const w = ev.winners.find(x => x.place === place);
  if (w) w.rationale = rationale.trim();
}

function suggestWinnersFromScores(ev) {
  const top = useCasesForEvent(ev.id).slice().sort((a, b) => b._score - a._score).slice(0, WINNER_PLACES.length);
  ev.winners = ev.winners || [];
  WINNER_PLACES.forEach((place, i) => {
    const uc = top[i];
    const existing = ev.winners.find(x => x.place === place);
    if (!uc) { ev.winners = ev.winners.filter(x => x.place !== place); return; }
    if (existing) existing.ucId = uc.id;
    else ev.winners.push({ place, ucId: uc.id, rationale: '' });
  });
  syncWinnerIds(ev);
  persistSoon();
  toast('Winners auto-filled from scores. Confirm and add rationale.');
}

function pageRegisterUseCase() {
  setTimeout(wireUseCaseRegister, 0);
  const peopleOpts = (sel) => `<option value="">${esc(sel)}</option>${optTag(db.people, p=>p.id, p=>p.name)}`;
  return `
  <div class="breadcrumb"><a href="#/register">Register</a> / Register a Use Case</div>
  <div class="page-head"><h1>Register a Use Case</h1><p>Capture the full use case in one place. Move through the tabs. <span class="hint">Scoring happens later, when judges rank entries at the event. ${formPersistHint()}</span></p></div>
  <form id="regForm" class="card">
    <div class="tabs" id="ucRegTabs">
      <button type="button" class="active" data-tab="ov">Overview</button>
      <button type="button" data-tab="tech">Solution &amp; Tech</button>
      <button type="button" data-tab="val">Value &amp; Impact</button>
      <button type="button" data-tab="champ">Champions &amp; Follow-ups</button>
    </div>

    <div data-panel="ov"><div class="form-grid">
      <div class="form-field full"><label>Use case title <span class="req">*</span></label><input name="title" placeholder="e.g., AI permit-status assistant"></div>
      <div class="form-field"><label>Hackathon event <span class="req">*</span></label><select name="event"><option value="">Select…</option>${optTag(db.events, e=>e.id, e=>e.name)}</select></div>
      <div class="form-field"><label>Agency <span class="req">*</span></label><select name="agency"><option value="">Select…</option>${optTag(db.agencies, a=>a.id, a=>a.name)}</select></div>
      <div class="form-field"><label>Assigned team <span class="req">*</span></label><select name="team"><option value="">Select…</option>${optTag(db.teams, t=>t.id, t=>`${t.name} (${agencyName(t.agencyId)})`)}</select></div>
      <div class="form-field"><label>Production pipeline</label><label style="display:flex;align-items:center;gap:6px;font-weight:400"><input type="checkbox" name="inPipeline"> Mark as a pipeline candidate</label></div>
      <div class="form-field full"><label>Business problem <span class="req">*</span></label><textarea name="problem" placeholder="What problem does this address?"></textarea></div>
      <div class="form-field full"><label>Current process / pain</label><textarea name="current" placeholder="How is it handled today, and where does it hurt?"></textarea></div>
      <div class="form-field full"><label>Challenge summary</label><textarea name="challenge" placeholder="One-line framing of the challenge."></textarea></div>
      <div class="form-field full"><label>Proposed solution <span class="req">*</span></label><textarea name="solution" placeholder="What was built / proposed?"></textarea></div>
      <div class="form-field full"><label>End users / beneficiaries</label><input name="beneficiaries" placeholder="e.g., Claims processors, residents"></div>
      <div class="form-field full"><label>Industry applicability <span class="hint">(comma-separated)</span></label><input name="industries" placeholder="e.g., Workforce / Labor, Benefits"></div>
    </div></div>

    <div data-panel="tech" class="hide"><div class="form-grid">
      <div class="form-field full"><label>Key components <span class="hint">(comma-separated)</span></label><input name="components" placeholder="e.g., Azure AI Search, Azure OpenAI, Functions"></div>
      <div class="form-field full"><label>GitHub Copilot role</label><input name="copilotRole" placeholder="How Copilot accelerated the build"></div>
      <div class="form-field full"><label>Azure / M365 / AI services <span class="hint">(comma-separated)</span></label><input name="services" placeholder="e.g., Azure OpenAI, Document Intelligence"></div>
      <div class="form-field full"><label>Solution pattern</label><select name="pattern"><option value="">None</option>${optTag(db.patterns, p=>p.id, p=>p.name)}</select></div>
      <div class="form-field full"><label>Data dependencies</label><textarea name="dataDeps" placeholder="What data is required, and its source / access path"></textarea></div>
      <div class="form-field full"><label>Security / compliance</label><textarea name="complianceNote" placeholder="Privacy, regulatory, residency considerations"></textarea></div>
      <div class="form-field full"><label>Risks / blockers</label><textarea name="risks" placeholder="What could stop this from reaching production"></textarea></div>
    </div></div>

    <div data-panel="val" class="hide"><div class="form-grid">
      <div class="form-field full"><label>Business value</label><textarea name="bizValue" placeholder="Mission / citizen / ROI value if productionized"></textarea></div>
      <div class="form-field full"><label>Estimated impact</label><textarea name="impact" placeholder="Expected outcome / scale"></textarea></div>
      <div class="form-field"><label>Impact metric</label><input name="impactMetric" placeholder="e.g., −40% backlog"></div>
      <div class="form-field"><label>Production feasibility</label><select name="feasibility"><option value="">Select…</option>${optTag(['High','Medium','Low'])}</select></div>
      <div class="form-field full"><label>Reusability / repeatability</label><textarea name="reusability" placeholder="Could other agencies reuse this?"></textarea></div>
    </div></div>

    </div></div>

    <div data-panel="champ" class="hide"><div class="form-grid">
      <div class="form-field"><label>Executive sponsor</label><select name="execSponsor">${peopleOpts('— none —')}</select></div>
      <div class="form-field"><label>Champion — Apps</label><select name="champApps">${peopleOpts('— none —')}</select></div>
      <div class="form-field"><label>Champion — Data / AI</label><select name="champData">${peopleOpts('— none —')}</select></div>
      <div class="form-field full"><label>MS supporting teams <span class="hint">(comma-separated)</span></label><input name="supportTeams" placeholder="e.g., FastTrack, CSU, Industry Solutions"></div>
      <div class="form-field full"><label>Recommended next step <span class="req">*</span></label><input name="nextStep" placeholder="e.g., Scope a 4-week production pilot"></div>
    </div></div>

    <div class="divider"></div>
    <div class="spread">
      <span class="hint" id="formHint">Required fields marked <span class="req">*</span>. ${formPersistHint()}</span>
      <button type="submit" class="btn primary">Submit use case</button>
    </div>
  </form>`;
}

// Scoring cheat sheet — anchors for each 0–3 dimension plus the judging lens
// each one supports. Used in the winners (judging) matrix.
const SCORING_GUIDE = {
  realProblem:   { zero: 'No real problem / unclear', three: 'Real, well-defined problem tied to actual workflows', lens: 'Problem relevance & clarity · evidence of user need' },
  businessValue: { zero: 'No articulated value', three: 'Clear, quantified mission / citizen impact or ROI', lens: 'Business value & impact' },
  aiTools:       { zero: 'No / superficial AI use', three: 'Innovative, well-justified use of AI', lens: 'Innovation · AI / model-choice justification' },
  feasibility:   { zero: 'Slideware only / not buildable', three: 'Working MVP on a sound, scalable architecture', lens: 'Technical execution · production-viable' },
  demo:          { zero: 'No working demo', three: 'Polished, functional end-to-end demo', lens: 'Working prototype (MVP) · presentation' },
  ui:            { zero: 'Unusable / no UI', three: 'Clear, usable UI / conversational flow', lens: 'User experience' },
  repeatability: { zero: 'One-off, not reusable', three: 'Reusable pattern other agencies can adopt', lens: 'Scalability & sustainability' },
  playFit:       { zero: 'No fit to a play', three: 'Strong fit to a Microsoft solution play', lens: 'Solution-play alignment' },
  compliance:    { zero: 'Blocking, unaddressed risk', three: 'Low risk; privacy, safety & Responsible AI addressed', lens: 'Responsible AI — bias, privacy, safety' }
};

function scoringGuide() {
  const rows = DIMENSIONS.map(d => {
    const g = SCORING_GUIDE[d.key] || {};
    return `<tr><td>${esc(d.label)}</td><td class="num">${d.weight}</td><td class="tiny muted">${esc(g.zero||'')}</td><td class="tiny">${esc(g.three||'')}</td><td class="tiny muted">${esc(g.lens||'')}</td></tr>`;
  }).join('');
  return `
  <details class="panel guide">
    <summary>📋 Scoring cheat sheet — how to score &amp; what judges look for</summary>
    <div class="panel-body">
      <p class="muted tiny">Score each dimension <strong>0–3</strong> (0 = absent · 1 = low · 2 = moderate · 3 = strong). Weighted to a total of 100.</p>
      <div class="tbl-scroll"><table class="tbl guide-tbl">
        <thead><tr><th>Dimension</th><th class="num">Wt</th><th>Score 0</th><th>Score 3 (strong)</th><th>Judging lens</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="guide-legend">
        <div><strong>Bands:</strong> 🟢 High Potential ≥ 70 · 🟡 Needs Incubation 45–69 · ⚪ Not Ready &lt; 45</div>
        <div><strong>Hard gate:</strong> Compliance or Technical feasibility = 0 → Not Ready.</div>
      </div>
      <details class="panel sub">
        <summary>Full AI-hackathon judging rubric (reference)</summary>
        <ol class="guide-rubric tiny muted">
          <li><strong>Problem relevance &amp; clarity</strong> — real, well-defined problem aligned to actual workflows; evidence of user need.</li>
          <li><strong>Innovation &amp; creativity</strong> — novel, differentiated, creative use of AI (not just a wrapper).</li>
          <li><strong>Technical execution</strong> — architecture, model selection, integration, code quality, performance.</li>
          <li><strong>AI-specific</strong> — model-choice justification, accuracy, explainability, Responsible AI.</li>
          <li><strong>Business value / impact</strong> — cost savings, productivity, citizen / customer impact.</li>
          <li><strong>Feasibility &amp; deployability</strong> — path to production; data / infra / governance; ownership.</li>
          <li><strong>Working prototype (MVP)</strong> — functional end-to-end demo, not slides.</li>
          <li><strong>User experience</strong> — usable, clear UI / conversational flow, easy onboarding.</li>
          <li><strong>Presentation &amp; storytelling</strong> — problem → solution → outcome clarity.</li>
          <li><strong>Scalability &amp; sustainability</strong> — scales across agencies; maintainable; viable long-term.</li>
          <li><strong>Production-viable</strong> — a credible path to a supported production app.</li>
        </ol>
        <p class="tiny muted">UX (#8) and storytelling (#9) are judged qualitatively at demo time and feed the Business value and Technical feasibility scores above.</p>
      </details>
    </div>
  </details>`;
}

function switchUcRegTab(tab) {
  const tabs = document.getElementById('ucRegTabs'); if (!tabs) return;
  tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  tabs.parentElement.querySelectorAll('[data-panel]').forEach(p => p.classList.toggle('hide', p.dataset.panel !== tab));
}

function wireUseCaseRegister() {
  wireTabs();
  const form = document.getElementById('regForm'); if (!form) return;
  wireSavingForm((fd) => {
    const splitList = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
    const req = [
      ['title', 'Use case title', 'ov'], ['event', 'Hackathon event', 'ov'], ['agency', 'Agency', 'ov'],
      ['team', 'Assigned team', 'ov'], ['problem', 'Business problem', 'ov'],
      ['solution', 'Proposed solution', 'ov'], ['nextStep', 'Recommended next step', 'champ']
    ];
    for (const [name, label, tab] of req) {
      if (!String(fd.get(name) || '').trim()) { switchUcRegTab(tab); return `${label} is required.`; }
    }
    const champions = {};
    if (fd.get('champApps')) champions.apps = fd.get('champApps');
    if (fd.get('champData')) champions.dataai = fd.get('champData');
    const id = `UC-NEW-${newIdSeq++}`;
    const uc = buildUseCase({
      id, title: fd.get('title'), eventId: fd.get('event'), agencyId: fd.get('agency'),
      teamId: fd.get('team') || null, inPipeline: fd.get('inPipeline') === 'on',
      businessProblem: fd.get('problem'), currentProcess: fd.get('current'),
      challengeSummary: fd.get('challenge'), proposedSolution: fd.get('solution'),
      beneficiaries: fd.get('beneficiaries'), industries: splitList(fd.get('industries')),
      components: splitList(fd.get('components')), copilotRole: fd.get('copilotRole'),
      services: splitList(fd.get('services')), patternId: fd.get('pattern') || null,
      dataDependencies: fd.get('dataDeps'), compliance: fd.get('complianceNote'), risks: fd.get('risks'),
      businessValue: fd.get('bizValue'), estimatedImpact: fd.get('impact'),
      impactMetric: fd.get('impactMetric'), feasibility: fd.get('feasibility'), reusability: fd.get('reusability'),
      champions, execSponsorId: fd.get('execSponsor') || null, supportTeams: splitList(fd.get('supportTeams')),
      nextStep: fd.get('nextStep')
    });
    db.useCases.push(uc); db.byId[id] = uc;
    stampCreate(uc, 'Use case');
    let linkedTeam = null;
    if (uc.teamId) { const tm = db.byId[uc.teamId]; if (tm) { tm.useCaseIds = tm.useCaseIds || []; tm.useCaseIds.push(id); linkedTeam = tm; } }
    return {
      ok: `Use case "${uc.title}" registered. Judges score it at the event.`,
      rollback: () => {
        db.useCases.pop(); delete db.byId[id];
        if (linkedTeam) linkedTeam.useCaseIds = linkedTeam.useCaseIds.filter(x => x !== id);
      }
    };
  });
}


function pageRegisterPattern() {
  setTimeout(mountPatternManager, 0);
  return `
  <div class="breadcrumb"><a href="#/register">Register</a> / Reusable Pattern / Accelerator</div>
  <div class="page-head"><h1>Reusable Pattern / Accelerator</h1><p>Promote repeatable solutions and link the starter kits that let the next team begin ahead. <span class="hint">${formPersistHint()}</span></p></div>
  <div id="patternRoot"></div>`;
}

function mountPatternManager() { renderPatternManager(); }

function renderPatternManager() {
  const root = document.getElementById('patternRoot'); if (!root) return;
  root.innerHTML = `
  <div class="grid cols-2" style="margin-bottom:18px">
    <form id="patForm" class="card">
      <h3 style="margin-top:0">Define a reusable pattern</h3>
      <div class="form-grid">
        <div class="form-field full"><label>Pattern name <span class="req">*</span></label><input name="name" required placeholder="e.g., RAG over line-of-business data"></div>
        <div class="form-field"><label>Repeatability <span class="req">*</span></label><select name="repeatability" required>${optTag(['High','Medium','Low'])}</select></div>
        <div class="form-field"><label>Solution play</label><input name="play" placeholder="e.g., Azure AI / Knowledge mining"></div>
        <div class="form-field full"><label>Summary <span class="req">*</span></label><textarea name="summary" required placeholder="What problem this pattern solves and how"></textarea></div>
        <div class="form-field full"><label>Key components <span class="hint">(comma-separated)</span></label><input name="components" placeholder="e.g., Azure AI Search, Azure OpenAI, Azure Functions"></div>
      </div>
      <div class="divider"></div>
      <div class="spread"><span class="hint" id="patHint">Required fields marked <span class="req">*</span>.</span><button class="btn primary">Add pattern</button></div>
    </form>

    <form id="accForm" class="card">
      <h3 style="margin-top:0">Add an accelerator / starter kit</h3>
      <div class="form-grid">
        <div class="form-field full"><label>Accelerator name <span class="req">*</span></label><input name="name" required placeholder="e.g., SLG RAG Starter Kit"></div>
        <div class="form-field"><label>Type <span class="req">*</span></label><select name="type" required>${optTag(['Repo template','Flow template','Solution accelerator','Sample app','Doc / guide'])}</select></div>
        <div class="form-field"><label>Linked pattern <span class="req">*</span></label><select name="pattern" required><option value="">Select…</option>${optTag(db.patterns, p=>p.id, p=>p.name)}</select></div>
        <div class="form-field full"><label>Link / URL</label><input name="url" placeholder="https://… repo, template, or starter kit"></div>
      </div>
      <div class="divider"></div>
      <div class="spread"><span class="hint" id="accHint">Required fields marked <span class="req">*</span>.</span><button class="btn primary">Add accelerator</button></div>
    </form>
  </div>

  <h3 class="sec-h">Pattern library (${db.patterns.filter(notArchived).length})</h3>
  <div class="grid cols-3">
    ${db.patterns.filter(notArchived).map(p => {
      const uses = useCasesForPattern(p.id);
      const accs = db.accelerators.filter(a => a.patternId === p.id);
      return `<div class="card">
        <div class="spread"><h3 style="margin:0"><a href="#/pattern/${p.id}">${esc(p.name)}</a></h3><span class="chip ${p.repeatability==='High'?'good':''}">${esc(p.repeatability)}</span></div>
        <p class="muted tiny">${esc(p.summary)}</p>
        <div class="tag-row">${(p.components||[]).map(c=>`<span class="chip info">${esc(c)}</span>`).join('')}</div>
        <div class="divider"></div>
        <div class="tiny">Applied in <strong>${uses.length}</strong> use case${uses.length===1?'':'s'}</div>
        <div class="stack-sm" style="margin-top:6px">${accs.length ? accs.map(a=>`<div class="tiny spread"><span>📦 ${esc(a.name)} <span class="muted">· ${esc(a.type)}</span></span><button class="btn tiny danger ghost" data-del-acc="${a.id}" title="Delete accelerator">🗑️</button></div>`).join('') : '<span class="muted tiny">No accelerators linked.</span>'}</div>
        <div class="record-actions" style="margin-top:10px"><button class="btn tiny danger ghost" data-del-pattern="${p.id}">🗑️ Delete pattern</button></div>
      </div>`;
    }).join('')}
  </div>`;

  root.querySelectorAll('[data-del-pattern]').forEach(b => b.onclick = () => confirmDelete('pattern', b.dataset.delPattern, renderPatternManager));
  root.querySelectorAll('[data-del-acc]').forEach(b => b.onclick = () => confirmDelete('accelerator', b.dataset.delAcc, renderPatternManager));

  const patForm = document.getElementById('patForm');
  wireSavingForm((fd) => {
    const id = `PAT-NEW-${newIdSeq++}`;
    const p = buildPattern({ id, name: fd.get('name'), repeatability: fd.get('repeatability'), solutionPlay: fd.get('play'), summary: fd.get('summary'), components: fd.get('components') });
    db.patterns.push(p); db.byId[id] = p;
    return {
      ok: `Pattern "${p.name}" added.`,
      rollback: () => { db.patterns.pop(); delete db.byId[id]; }
    };
  }, { form: patForm, hintId: 'patHint', onSuccess: renderPatternManager });

  const accForm = document.getElementById('accForm');
  wireSavingForm((fd) => {
    const id = `ACC-NEW-${newIdSeq++}`;
    const a = buildAccelerator({ id, name: fd.get('name'), type: fd.get('type'), url: fd.get('url'), patternId: fd.get('pattern') });
    db.accelerators.push(a); db.byId[id] = a;
    let linkedPat = null;
    const pat = db.byId[a.patternId]; if (pat) { pat.acceleratorIds = pat.acceleratorIds || []; pat.acceleratorIds.push(id); linkedPat = pat; }
    return {
      ok: `Accelerator "${a.name}" linked.`,
      rollback: () => {
        db.accelerators.pop(); delete db.byId[id];
        if (linkedPat) linkedPat.acceleratorIds = linkedPat.acceleratorIds.filter(x => x !== id);
      }
    };
  }, { form: accForm, hintId: 'accHint', onSuccess: renderPatternManager });
}

function pageRegisterLessons() {
  setTimeout(mountFeedback, 0);
  return `
  <div class="breadcrumb"><a href="#/register">Register</a> / Capture Feedback</div>
  <div class="page-head"><h1>Capture Feedback</h1><p>Record the structured event retrospective across all ten categories. Pick an event to load and edit its existing feedback. <span class="hint">${formPersistHint()}</span></p></div>
  <div class="manage-toolbar"><label class="tiny muted">Event &nbsp;<select id="fbEventSel" class="select">${optTag(db.events, e=>e.id, e=>e.name)}</select></label></div>
  <form id="fbForm" class="card">
    <div class="form-grid">
      ${RETRO_FIELDS.map(f=>`<div class="form-field full"><label>${esc(f.label)}</label><span class="hint">${esc(f.hint)}</span><textarea name="${f.key}"></textarea></div>`).join('')}
    </div>
    <div class="divider"></div>
    <div class="spread"><span class="hint" id="fbHint">All fields optional — capture what you have.</span><button class="btn primary">Save feedback</button></div>
  </form>
  <div id="impSection"></div>`;
}

function mountFeedback() {
  const sel = document.getElementById('fbEventSel');
  const form = document.getElementById('fbForm');
  if (!sel || !form) return;
  const impSection = document.getElementById('impSection');
  const load = () => {
    const ev = db.byId[sel.value]; const retro = (ev && ev.retrospective) || {};
    RETRO_FIELDS.forEach(f => { const ta = form.elements[f.key]; if (ta) ta.value = retro[f.key] || ''; });
  };
  const renderImps = () => {
    if (!impSection) return;
    const ev = db.byId[sel.value];
    const imps = ev ? improvementsForEvent(ev.id).filter(notArchived) : [];
    impSection.innerHTML = `
    <h3 class="sec-h" style="margin-top:24px">Tracked improvement items${ev?` — ${esc(ev.name)}`:''}</h3>
    <p class="muted tiny">Turn retrospective findings into tracked actions. Each item is linked to this event.</p>
    <form id="impForm" class="card" style="margin-bottom:14px"><div class="form-grid">
      <div class="form-field full"><label>Item <span class="req">*</span></label><input name="title" required placeholder="e.g., Provision data access one week before the event"></div>
      <div class="form-field"><label>Type</label><select name="type">${optTag(['Lesson','Repeat blocker','Improvement','Risk'])}</select></div>
      <div class="form-field"><label>Category</label><select name="category">${optTag(['Logistics','Technical','Coaching','Content','Customer','Operations'])}</select></div>
      <div class="form-field"><label>Severity</label><select name="severity">${optTag(['High','Medium','Low'])}</select></div>
      <div class="form-field"><label>Owner</label><select name="owner"><option value="">— none —</option>${optTag(db.people, p=>p.id, p=>p.name)}</select></div>
      <div class="form-field full"><label>Suggested action</label><textarea name="suggestedAction"></textarea></div>
      <div class="form-field full"><button class="btn primary">Add improvement item</button></div>
    </div></form>
    <table class="tbl"><thead><tr><th>Item</th><th>Type</th><th>Category</th><th>Severity</th><th>Owner</th><th>Status</th><th></th></tr></thead>
    <tbody>${imps.length ? imps.map(i=>`<tr><td>${esc(i.title)}<div class="tiny muted">${esc(i.suggestedAction||'')}</div></td><td>${esc(i.type)}</td><td>${esc(i.category)}</td><td>${esc(i.severity)}</td><td>${i.ownerId?esc(personName(i.ownerId)):'—'}</td><td>${esc(i.status)}</td><td style="text-align:right"><button class="btn tiny danger ghost" data-del-imp="${i.id}" title="Delete item">🗑️</button></td></tr>`).join('') : '<tr><td colspan="7" class="muted">No items yet.</td></tr>'}</tbody></table>`;
    const impForm = document.getElementById('impForm');
    impSection.querySelectorAll('[data-del-imp]').forEach(b => b.onclick = () => confirmDelete('improvement', b.dataset.delImp, renderImps));
    if (impForm) wireSavingForm((fd) => {
      const ev2 = db.byId[sel.value]; if (!ev2) return 'Select an event first.';
      const id = `IMP-NEW-${newIdSeq++}`;
      const imp = buildImprovement({ id, title: fd.get('title'), type: fd.get('type'), category: fd.get('category'), severity: fd.get('severity'), suggestedAction: fd.get('suggestedAction'), ownerId: fd.get('owner') || null, eventId: ev2.id });
      db.improvements.push(imp); db.byId[id] = imp;
      return {
        ok: 'Improvement item added.',
        rollback: () => { db.improvements.pop(); delete db.byId[id]; }
      };
    }, { form: impForm, onSuccess: renderImps });
  };
  sel.onchange = () => { load(); renderImps(); };
  load(); renderImps();
  wireSavingForm((fd) => {
    const ev = db.byId[sel.value]; if (!ev) return 'Select an event first.';
    const prev = ev.retrospective ? { ...ev.retrospective } : null;
    ev.retrospective = ev.retrospective || {};
    RETRO_FIELDS.forEach(f => { ev.retrospective[f.key] = form.elements[f.key].value.trim(); });
    return {
      ok: `Feedback saved for "${ev.name}".`,
      rollback: () => { if (prev) ev.retrospective = prev; else delete ev.retrospective; }
    };
  }, { form, hintId: 'fbHint', hintHtml: 'All fields optional — capture what you have.', onSuccess: () => {} });
}

// Shared form wiring: HTML5 required + optional custom validator, then toast.
function wireForm(validate) {
  const form = document.getElementById('regForm');
  if (!form) return;
  const hint = document.getElementById('formHint');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const err = validate ? validate(fd) : null;
    if (err) { if (hint) hint.innerHTML = `<span style="color:var(--red)">${esc(err)}</span>`; return; }
    toast(`Saved. Routed to a curator for review. ${savedNote()}`);
    form.reset();
    if (hint) hint.innerHTML = `Required fields marked <span class="req">*</span>. ${formPersistHint()}`;
  });
}

// Like wireForm, but the submit handler actually WAITS for the record to be
// written to SharePoint (or CSV/demo) before telling the user it saved. The
// handler returns either an error string (validation failed, nothing added) or
// an object { ok: <success message>, rollback?: fn }. If the save fails, the
// rollback removes the optimistic record and the form keeps the typed values so
// the user can fix the problem and resubmit.
//
// opts (all optional):
//   form / formId      – the form element (default: #regForm)
//   hint / hintId      – the inline hint element (default: #formHint)
//   hintHtml           – the idle hint text to restore after a save
//   onSuccess          – called after a successful save (default: reset form +
//                        restore hint). Use this when the page re-renders itself.
function wireSavingForm(handler, opts = {}) {
  const form = opts.form || document.getElementById(opts.formId || 'regForm');
  if (!form) return;
  const hint = opts.hint || document.getElementById(opts.hintId || 'formHint');
  // A <button> inside a form defaults to type="submit", so also match buttons
  // that omit the attribute (just not explicit type="button" like Cancel).
  const btn = form.querySelector('button[type="submit"]') || form.querySelector('button:not([type])');
  const defaultHint = () => opts.hintHtml || `Required fields marked <span class="req">*</span>. ${formPersistHint()}`;
  const resetHint = () => { if (hint) hint.innerHTML = defaultHint(); };
  const finish = () => { if (opts.onSuccess) opts.onSuccess(); else { form.reset(); resetHint(); } };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    if (btn && btn.disabled) return;

    const result = handler(new FormData(form));
    const built = result instanceof Promise ? await result : result;
    if (typeof built === 'string') { if (hint) hint.innerHTML = `<span style="color:var(--red)">${esc(built)}</span>`; return; }
    if (!built) { resetHint(); return; }

    // Demo / seed / sample modes have no backend — keep the record in memory for
    // the session and confirm without claiming it was persisted.
    if (!isLiveMode()) {
      toast(`${built.ok} ${savedNote()}`);
      finish();
      return;
    }

    const origLabel = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    if (hint) hint.innerHTML = `<span class="muted">Saving to SharePoint…</span>`;

    let ok = true;
    try { ok = await persist(); } catch { ok = false; }

    if (btn) { btn.disabled = false; btn.textContent = origLabel; }

    if (ok) {
      clearSaveError();
      toast(`${built.ok} ${savedNote()}`);
      finish();
    } else {
      if (typeof built.rollback === 'function') built.rollback();
      // The onPersist listener already surfaced the detailed save-error banner.
      if (hint) hint.innerHTML = `<span style="color:var(--red)">Not saved — see the error banner below. Your entries are kept; fix the issue and submit again.</span>`;
    }
  });
}

// =====================================================================
// EDIT MODALS — every record's fields are editable in place
// =====================================================================
// <option> list with the current value pre-selected.
const optSel = (arr, cur, get = x => x, lbl = x => x) =>
  arr.map(x => { const v = get(x); return `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(lbl(x))}</option>`; }).join('');
const scoreSelOpts = (cur) => [0, 1, 2, 3].map(n => `<option value="${n}"${Number(cur) === n ? ' selected' : ''}>${n}</option>`).join('');

function modalActions() {
  return `<div class="form-field full modal-actions"><button type="button" class="btn" data-cancel>Cancel</button><button class="btn primary" type="submit">Save changes</button></div>`;
}

// ---- Agencies index page --------------------------------------------------
function pageAgencies() {
  const list = [...db.agencies].filter(notArchived).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return `
  <div class="page-head spread"><div><h1>Agencies</h1><p>${list.length} registered agencies. Every field is editable.</p></div>
    <a class="btn primary" href="#/register/agency">+ Register agency</a></div>
  <div class="grid cols-2">${list.length ? list.map(agencyCard).join('') : '<p class="muted">No agencies yet. Register one to begin.</p>'}</div>`;
}
function agencyCard(a) {
  const dm = a.decisionMaker || {};
  const ucCount = db.useCases.filter(u => u.agencyId === a.id).length;
  return `<div class="card">
    <div class="spread"><h3 style="margin:0">${esc(a.name)}</h3><span class="chip">${esc(a.type || '—')}</span></div>
    <div class="muted tiny" style="margin:4px 0 8px">${esc(a.jurisdiction || a.region || '—')}${a.domain ? ' · ' + esc(a.domain) : ''}</div>
    <div class="tiny">👤 ${esc([dm.firstName, dm.lastName].filter(Boolean).join(' ') || '—')}${dm.jobTitle ? ' — ' + esc(dm.jobTitle) : ''}${dm.email ? ` · <a href="mailto:${esc(dm.email)}">${esc(dm.email)}</a>` : ''}</div>
    <div class="tiny muted" style="margin-top:6px">${ucCount} use case${ucCount === 1 ? '' : 's'}</div>
    <div class="divider" style="margin:10px 0"></div>
    ${recordActions('agency', a.id)}
  </div>`;
}

function openEditAgency(id) {
  const a = db.byId[id]; if (!a) return;
  const dm = a.decisionMaker || {};
  const body = `<form id="editForm" class="form-grid modal-form">
    <div class="form-field full"><label>Agency name <span class="req">*</span></label><input name="name" required value="${esc(a.name)}"></div>
    <div class="form-field full"><label>Jurisdiction</label><input name="jurisdiction" value="${esc(a.jurisdiction || a.region)}"></div>
    <div class="form-field"><label>Government level</label><select name="type">${optSel(['City', 'County', 'State', 'Regional / Authority', 'Federal'], a.type)}</select></div>
    <div class="form-field"><label>Primary domain</label><input name="domain" value="${esc(a.domain)}"></div>
    <div class="form-section full"><span class="form-section-title">Customer decision maker</span></div>
    <div class="form-field"><label>First name</label><input name="dmFirstName" value="${esc(dm.firstName)}"></div>
    <div class="form-field"><label>Last name</label><input name="dmLastName" value="${esc(dm.lastName)}"></div>
    <div class="form-field"><label>Job title</label><input name="dmJobTitle" value="${esc(dm.jobTitle)}"></div>
    <div class="form-field"><label>Role</label><input name="dmRole" value="${esc(dm.role)}"></div>
    <div class="form-field"><label>Email</label><input type="email" name="dmEmail" value="${esc(dm.email)}"></div>
    <div class="form-field"><label>Country</label><input name="dmCountry" value="${esc(dm.country)}"></div>
    <div class="form-field"><label>Business phone</label><input name="dmBusinessPhone" value="${esc(dm.businessPhone)}"></div>
    ${modalActions()}
  </form>`;
  openModal(`Edit agency — ${a.name}`, body, { wide: true });
  const form = document.getElementById('editForm');
  form.querySelector('[data-cancel]').onclick = closeModal;
  form.addEventListener('submit', (e) => {
    e.preventDefault(); if (!form.reportValidity()) return;
    const fd = new FormData(form);
    a.name = fd.get('name'); a.jurisdiction = fd.get('jurisdiction'); a.region = fd.get('jurisdiction');
    a.type = fd.get('type'); a.domain = fd.get('domain');
    a.decisionMaker = {
      firstName: fd.get('dmFirstName'), lastName: fd.get('dmLastName'), jobTitle: fd.get('dmJobTitle'),
      role: fd.get('dmRole'), email: fd.get('dmEmail'), country: fd.get('dmCountry'), businessPhone: fd.get('dmBusinessPhone')
    };
    stampEdit(a, 'Agency', 'Agency details updated');
    persistSoon(); closeModal(); toast('Agency updated.'); router();
  });
}

function openEditUseCase(id) {
  const uc = db.byId[id]; if (!uc) return;
  const s = uc.scores || {};
  const ta = (name, val) => `<textarea name="${name}">${esc(val)}</textarea>`;
  const inp = (name, val) => `<input name="${name}" value="${esc(val)}">`;
  const scoreGrid = DIMENSIONS.map(d => `<div class="score-cell"><label class="tiny">${esc(d.label)} <span class="muted">· wt ${d.weight}</span></label><select name="score_${d.key}">${scoreSelOpts(s[d.key])}</select></div>`).join('');
  const body = `<form id="editForm" class="form-grid modal-form">
    <div class="form-field full"><label>Title <span class="req">*</span></label><input name="title" required value="${esc(uc.title)}"></div>
    <div class="form-field"><label>Agency</label><select name="agencyId">${optSel(db.agencies, uc.agencyId, a => a.id, a => a.name)}</select></div>
    <div class="form-field"><label>Event</label><select name="eventId">${optSel(db.events, uc.eventId, e => e.id, e => e.name)}</select></div>
    <div class="form-field"><label>Production pipeline</label><label class="chk"><input type="checkbox" name="inPipeline"${uc.inPipeline ? ' checked' : ''}> Pipeline candidate</label></div>
    <div class="form-section full"><span class="form-section-title">Overview</span></div>
    <div class="form-field full"><label>Business problem</label>${ta('businessProblem', uc.businessProblem)}</div>
    <div class="form-field full"><label>Current process</label>${ta('currentProcess', uc.currentProcess)}</div>
    <div class="form-field full"><label>Challenge summary</label>${ta('challengeSummary', uc.challengeSummary)}</div>
    <div class="form-field full"><label>Proposed solution</label>${ta('proposedSolution', uc.proposedSolution)}</div>
    <div class="form-field full"><label>Beneficiaries</label>${inp('beneficiaries', uc.beneficiaries)}</div>
    <div class="form-field full"><label>Industries <span class="hint">(comma-separated)</span></label>${inp('industries', (uc.industries || []).join(', '))}</div>
    <div class="form-section full"><span class="form-section-title">Solution &amp; tech</span></div>
    <div class="form-field full"><label>Components <span class="hint">(comma-separated)</span></label>${inp('components', (uc.components || []).join(', '))}</div>
    <div class="form-field full"><label>Copilot / AI role</label>${inp('copilotRole', uc.copilotRole)}</div>
    <div class="form-field full"><label>Services <span class="hint">(comma-separated)</span></label>${inp('services', (uc.services || []).join(', '))}</div>
    <div class="form-field full"><label>Data dependencies</label>${ta('dataDependencies', uc.dataDependencies)}</div>
    <div class="form-field full"><label>Compliance notes</label>${ta('compliance', uc.compliance)}</div>
    <div class="form-field full"><label>Risks</label>${ta('risks', uc.risks)}</div>
    <div class="form-section full"><span class="form-section-title">Value &amp; impact</span></div>
    <div class="form-field full"><label>Business value</label>${ta('businessValue', uc.businessValue)}</div>
    <div class="form-field full"><label>Estimated impact</label>${inp('estimatedImpact', uc.estimatedImpact)}</div>
    <div class="form-field full"><label>Impact metric</label>${inp('impactMetric', uc.impactMetric)}</div>
    <div class="form-field full"><label>Feasibility notes</label>${ta('feasibility', uc.feasibility)}</div>
    <div class="form-field full"><label>Reusability notes</label>${ta('reusability', uc.reusability)}</div>
    <div class="form-section full"><span class="form-section-title">Pipeline &amp; owner</span></div>
    <div class="form-field full"><label>Recommended next step</label>${inp('nextStep', uc.nextStep)}</div>
    <div class="form-field"><label>Production owner name</label>${inp('ownerName', uc.ownerName)}</div>
    <div class="form-field"><label>Production owner email</label><input type="email" name="ownerEmail" value="${esc(uc.ownerEmail)}"></div>
    <div class="form-field"><label>Demo URL</label>${inp('demoUrl', uc.demoUrl)}</div>
    <div class="form-field"><label>Repo URL</label>${inp('repoUrl', uc.repoUrl)}</div>
    <div class="form-field full"><label>Lessons</label>${ta('lessons', uc.lessons)}</div>
    <div class="form-section full"><span class="form-section-title">Judging scores (0–3)</span></div>
    <div class="form-field full"><div class="score-grid">${scoreGrid}</div></div>
    ${modalActions()}
  </form>`;
  openModal(`Edit use case — ${uc.title}`, body, { wide: true });
  const form = document.getElementById('editForm');
  form.querySelector('[data-cancel]').onclick = closeModal;
  form.addEventListener('submit', (e) => {
    e.preventDefault(); if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const splitList = (v) => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
    uc.title = fd.get('title'); uc.agencyId = fd.get('agencyId'); uc.eventId = fd.get('eventId');
    uc.inPipeline = fd.get('inPipeline') === 'on';
    uc.businessProblem = fd.get('businessProblem'); uc.currentProcess = fd.get('currentProcess');
    uc.challengeSummary = fd.get('challengeSummary'); uc.proposedSolution = fd.get('proposedSolution');
    uc.beneficiaries = fd.get('beneficiaries'); uc.industries = splitList(fd.get('industries'));
    uc.components = splitList(fd.get('components')); uc.copilotRole = fd.get('copilotRole');
    uc.services = splitList(fd.get('services')); uc.dataDependencies = fd.get('dataDependencies');
    uc.compliance = fd.get('compliance'); uc.risks = fd.get('risks');
    uc.businessValue = fd.get('businessValue'); uc.estimatedImpact = fd.get('estimatedImpact');
    uc.impactMetric = fd.get('impactMetric'); uc.feasibility = fd.get('feasibility'); uc.reusability = fd.get('reusability');
    uc.nextStep = fd.get('nextStep'); uc.ownerName = fd.get('ownerName'); uc.ownerEmail = fd.get('ownerEmail');
    uc.demoUrl = fd.get('demoUrl') || '#'; uc.repoUrl = fd.get('repoUrl') || '#'; uc.lessons = fd.get('lessons');
    uc.scores = uc.scores || {};
    DIMENSIONS.forEach(d => { uc.scores[d.key] = Number(fd.get('score_' + d.key)); });
    decorateUc(uc);
    stampEdit(uc, 'Use case', 'Use case fields & scores updated');
    persistSoon(); closeModal(); toast('Use case updated.'); router();
  });
}

function openEditEvent(id) {
  const ev = db.byId[id]; if (!ev) return;
  const agencyChecks = db.agencies.map(a => `<label class="chk"><input type="checkbox" name="agencies" value="${esc(a.id)}"${(ev.agencyMix || []).includes(a.id) ? ' checked' : ''}> ${esc(a.name)}</label>`).join('');
  const body = `<form id="editForm" class="form-grid modal-form">
    <div class="form-field full"><label>Event name <span class="req">*</span></label><input name="name" required value="${esc(ev.name)}"></div>
    <div class="form-field"><label>Start date</label><input type="date" name="startDate" value="${esc(ev.startDate)}"></div>
    <div class="form-field"><label>End date</label><input type="date" name="endDate" value="${esc(ev.endDate)}"></div>
    <div class="form-field"><label>Location</label><input name="location" value="${esc(ev.location)}"></div>
    <div class="form-field"><label>Format</label><select name="format">${optSel(['In-person', 'Hybrid', 'Virtual'], ev.format)}</select></div>
    <div class="form-field"><label>Status</label><select name="status">${optSel(['Proposed', 'Confirmed', 'Open for registration', 'Closed'], ev.status || 'Proposed')}</select></div>
    <div class="form-field"><label>Host</label><select name="hostId"><option value="">—</option>${optSel(db.people, ev.hostId, p => p.id, p => p.name)}</select></div>
    <div class="form-field"><label># Teams</label><input type="number" min="0" name="numTeams" value="${esc(ev.numTeams)}"></div>
    <div class="form-field"><label># Participants</label><input type="number" min="0" name="numParticipants" value="${esc(ev.numParticipants)}"></div>
    <div class="form-field"><label># MS support staff</label><input type="number" min="0" name="numSupportStaff" value="${esc(ev.numSupportStaff)}"></div>
    <div class="form-field full"><label>Primary Domain <span class="hint">(comma-separated)</span></label><input name="themes" value="${esc((ev.themes || []).join(', '))}"></div>
    <div class="form-field full"><label>Participating agencies</label><div class="check-grid">${agencyChecks}</div></div>
    <div class="form-field full"><label>Organizers <span class="hint">(first / last / email)</span></label>${staffRows('organizers', ev.organizerIds || [])}</div>
    <div class="form-field full"><label>Technical support team <span class="hint">(first / last / email)</span></label>${staffRows('techSupport', ev.technicalSupportTeam || [])}</div>
    <div class="form-field full"><label>Partners <span class="hint">(comma-separated)</span></label><input name="partners" value="${esc((ev.partnerOrgs || []).join(', '))}"></div>
    <div class="form-field full"><label>Registration URL</label><input name="registrationUrl" value="${esc(ev.registrationUrl && ev.registrationUrl !== '#' ? ev.registrationUrl : '')}" placeholder="https://…"></div>
    <div class="form-field full"><label>Notes</label><textarea name="notes">${esc(ev.notes)}</textarea></div>
    <div class="form-field full"><label>Agenda summary</label><textarea name="agendaSummary">${esc(ev.agendaSummary)}</textarea></div>
    <div class="form-field full"><label>Demo details</label><textarea name="demoDetails">${esc(ev.demoDetails)}</textarea></div>
    <div class="form-field full"><label>Outcomes</label><textarea name="outcomes">${esc(ev.outcomes)}</textarea></div>
    <div class="form-field"><label>Follow-up planned</label><label class="chk"><input type="checkbox" name="followupPlanned"${ev.followupPlanned ? ' checked' : ''}> Yes</label></div>
    ${modalActions()}
  </form>`;
  openModal(`Edit event — ${ev.name}`, body, { wide: true });
  const form = document.getElementById('editForm');
  wireStaffRows(form);
  form.querySelector('[data-cancel]').onclick = closeModal;
  form.addEventListener('submit', (e) => {
    e.preventDefault(); if (!form.reportValidity()) return;
    const fd = new FormData(form);
    if (fd.get('endDate') && fd.get('startDate') && fd.get('endDate') < fd.get('startDate')) { toast('End date cannot be before start date.'); return; }
    ev.name = fd.get('name'); ev.startDate = fd.get('startDate'); ev.endDate = fd.get('endDate');
    ev.location = fd.get('location'); ev.format = fd.get('format'); ev.hostId = fd.get('hostId') || null;
    ev.numTeams = Number(fd.get('numTeams')) || 0; ev.numParticipants = Number(fd.get('numParticipants')) || 0;
    ev.numSupportStaff = Number(fd.get('numSupportStaff')) || 0;
    ev.themes = String(fd.get('themes') || '').split(',').map(s => s.trim()).filter(Boolean);
    ev.status = fd.get('status');
    ev.registrationUrl = fd.get('registrationUrl') || '#'; ev.notes = fd.get('notes');
    ev.agencyMix = fd.getAll('agencies');
    ev.organizerIds = gatherStaff(form, 'organizers');
    ev.technicalSupportTeam = gatherStaff(form, 'techSupport');
    ev.partnerOrgs = String(fd.get('partners') || '').split(',').map(s => s.trim()).filter(Boolean);
    ev.agendaSummary = fd.get('agendaSummary'); ev.demoDetails = fd.get('demoDetails'); ev.outcomes = fd.get('outcomes');
    ev.followupPlanned = fd.get('followupPlanned') === 'on';
    stampEdit(ev, 'Event', 'Event details updated');
    persistSoon(); closeModal(); toast('Event updated.'); router();
  });
}

function openEditCalendar(id) {
  const c = db.byId[id]; if (!c) return;
  const agencyChecks = db.agencies.map(a => `<label class="chk"><input type="checkbox" name="agencies" value="${esc(a.id)}"${(c.focusAgencies || []).includes(a.id) ? ' checked' : ''}> ${esc(a.name)}</label>`).join('');
  const body = `<form id="editForm" class="form-grid modal-form">
    <div class="form-field full"><label>Title <span class="req">*</span></label><input name="title" required value="${esc(c.title)}"></div>
    <div class="form-field"><label>Start date</label><input type="date" name="startDate" value="${esc(c.startDate)}"></div>
    <div class="form-field"><label>End date</label><input type="date" name="endDate" value="${esc(c.endDate)}"></div>
    <div class="form-field"><label>Status</label><select name="status">${optSel(['Proposed', 'Confirmed', 'Open for registration', 'Closed'], c.status)}</select></div>
    <div class="form-field"><label>Format</label><select name="format">${optSel(['In-person', 'Hybrid', 'Virtual'], c.format)}</select></div>
    <div class="form-field full"><label>Location</label><input name="location" value="${esc(c.location)}"></div>
    <div class="form-field full"><label>Primary Domain <span class="hint">(comma-separated)</span></label><input name="themes" value="${esc((c.themes || []).join(', '))}"></div>
    <div class="form-field"><label>Host</label><select name="hostId"><option value="">—</option>${optSel(db.people, c.hostId, p => p.id, p => p.name)}</select></div>
    <div class="form-field full"><label>Participating agencies</label><div class="check-grid">${agencyChecks}</div></div>
    <div class="form-field full"><label>Organizers <span class="hint">(first / last / email)</span></label>${staffRows('organizers', c.organizerIds || [])}</div>
    <div class="form-field full"><label>Technical support team <span class="hint">(first / last / email)</span></label>${staffRows('techSupport', c.technicalSupportTeam || [])}</div>
    <div class="form-field full"><label>Partners <span class="hint">(comma-separated)</span></label><input name="partners" value="${esc((c.partnerOrgs || []).join(', '))}"></div>
    <div class="form-field full"><label>Registration URL</label><input name="registrationUrl" value="${esc(c.registrationUrl && c.registrationUrl !== '#' ? c.registrationUrl : '')}" placeholder="https://…"></div>
    <div class="form-field full"><label>Notes</label><textarea name="notes">${esc(c.notes)}</textarea></div>
    ${modalActions()}
  </form>`;
  openModal(`Edit upcoming event — ${c.title}`, body, { wide: true });
  const form = document.getElementById('editForm');
  wireStaffRows(form);
  form.querySelector('[data-cancel]').onclick = closeModal;
  form.addEventListener('submit', (e) => {
    e.preventDefault(); if (!form.reportValidity()) return;
    const fd = new FormData(form);
    c.title = fd.get('title'); c.startDate = fd.get('startDate'); c.endDate = fd.get('endDate') || fd.get('startDate');
    c.status = fd.get('status'); c.format = fd.get('format'); c.location = fd.get('location');
    c.themes = String(fd.get('themes') || '').split(',').map(s => s.trim()).filter(Boolean);
    c.hostId = fd.get('hostId') || null;
    c.focusAgencies = fd.getAll('agencies');
    c.organizerIds = gatherStaff(form, 'organizers');
    c.technicalSupportTeam = gatherStaff(form, 'techSupport');
    c.partnerOrgs = String(fd.get('partners') || '').split(',').map(s => s.trim()).filter(Boolean);
    c.registrationUrl = fd.get('registrationUrl') || '#'; c.notes = fd.get('notes');
    stampEdit(c, 'Calendar', 'Upcoming event updated');
    persistSoon(); closeModal(); toast('Upcoming event updated.'); router();
  });
}

// Promote a calendar entry into a fully managed event (no duplication — they
// stay linked so the same hackathon is editable from Manage Event).
function promoteCalendar(id) {
  const c = db.byId[id]; if (!c) return;
  if (c.managedEventId && db.byId[c.managedEventId]) {
    manageState = { eventId: c.managedEventId, tab: 'overview' };
    toast('Already linked — opening in Manage Event.');
    location.hash = '#/register/event';
    return;
  }
  const eid = `EV-NEW-${newIdSeq++}`;
  const ev = buildEvent({
    id: eid, name: c.title, startDate: c.startDate, endDate: c.endDate, location: c.location,
    format: c.format, status: c.status, themes: c.themes, organizerIds: c.organizerIds,
    technicalSupportTeam: c.technicalSupportTeam, partnerOrgs: c.partnerOrgs, hostId: c.hostId,
    agencyMix: c.focusAgencies, registrationUrl: c.registrationUrl, notes: c.notes, calendarId: c.id
  });
  stampCreate(ev, 'Event'); logAudit(ev, 'Event', 'Promoted', `Promoted from calendar entry ${c.id}`);
  db.events.push(ev); db.byId[eid] = ev;
  c.managedEventId = eid;
  stampEdit(c, 'Calendar', `Promoted to managed event ${eid}`);
  persistSoon();
  manageState = { eventId: eid, tab: 'overview' };
  toast(`"${c.title}" is now a managed event.`);
  location.hash = '#/register/event';
}

// ---- Tabs wiring (shared) -------------------------------------------------
function wireTabs() {
  document.querySelectorAll('.tabs').forEach(tabs => {
    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]'); if (!btn) return;
      tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
      const scope = tabs.parentElement;
      scope.querySelectorAll('[data-panel]').forEach(p => p.classList.toggle('hide', p.dataset.panel !== btn.dataset.tab));
    });
  });
}

// =====================================================================
// ROUTER
// =====================================================================
// ---- About ----------------------------------------------------------------
// Single source of truth for product / build identity, surfaced on the About
// page. Update BUILD.version / BUILD.date when cutting a new build.
const BUILD = {
  product: 'Hackathon Content Library',
  tagline: 'SLED AI Hackathons — capture, score & productionize',
  version: 'Draft v2',
  date: '2026-06-17',
  author: 'Anwar Shaikh',
  repo: 'https://github.com/shaikhanwar/HackathonContentLibrary'
};
const TECH_STACK = [
  { area: 'Front end', detail: 'Vanilla JavaScript (ES modules), hash router, zero build step' },
  { area: 'UI', detail: 'Hand-rolled CSS design tokens — responsive cards, modals & tables' },
  { area: 'Data model', detail: 'Factory-driven records (single source of truth in factory.js)' },
  { area: 'Persistence', detail: 'SharePoint Online Lists via REST (same-origin), CSV store for local dev' },
  { area: 'Scoring', detail: 'Weighted production-readiness framework (scoring.js)' },
  { area: 'Governance', detail: 'Per-record audit trail, soft archive/restore, admin-gated delete' },
  { area: 'Hosting', detail: 'SharePoint site (SiteAssets) — custom .aspx page pipeline' }
];

function pageAbout() {
  const features = [
    ['🏛️', 'Agencies & decision makers', 'Capture customer agencies and their primary contacts.'],
    ['📅', 'Hackathons & calendar', 'Plan upcoming events and record past ones end-to-end.'],
    ['💡', 'Use cases & scoring', 'Score ideas on a weighted production-readiness framework.'],
    ['🚀', 'Pipeline & patterns', 'Promote winners and reuse proven solution accelerators.'],
    ['🕓', 'Audit & governance', 'One central trail of every change, with archive & restore.']
  ];
  return `
  <div class="page-head"><h1>About</h1><p>Product identity, build details, and the technology behind the library.</p></div>

  <div class="card" style="margin-bottom:18px">
    <div class="spread" style="align-items:flex-start;flex-wrap:wrap;gap:14px">
      <div>
        <h2 style="margin:0 0 4px">${esc(BUILD.product)}</h2>
        <p class="muted" style="margin:0">${esc(BUILD.tagline)}</p>
      </div>
      <div class="tag-row" style="margin:0">
        <span class="chip info">${esc(BUILD.version)}</span>
        <span class="chip">Build ${esc(BUILD.date)}</span>
      </div>
    </div>
    <div class="divider"></div>
    <dl class="fields">
      <dt>Version</dt><dd>${esc(BUILD.version)}</dd>
      <dt>Build date</dt><dd>${esc(fmtDate(BUILD.date))}</dd>
      <dt>Built by</dt><dd><strong>${esc(BUILD.author)}</strong></dd>
      <dt>Repository</dt><dd><a href="${esc(BUILD.repo)}" target="_blank" rel="noopener noreferrer">${esc(BUILD.repo)} ↗</a></dd>
    </dl>
  </div>

  <div class="detail-grid">
    <div class="card">
      <h3 style="margin-top:0">Description</h3>
      <p>The Hackathon Content Library is a single hub for running State &amp; Local Government AI hackathons end-to-end — from registering the customer agency and planning the event, through capturing and scoring use cases, to promoting the strongest ideas into a production pipeline and harvesting reusable patterns and lessons learned.</p>
      <p class="muted">Every record is form-driven and persists to SharePoint Lists, so the program's knowledge compounds across events instead of living in scattered decks and spreadsheets.</p>
      <div class="divider"></div>
      <h3>What it does</h3>
      <div class="stack-sm">
        ${features.map(([icon, title, desc]) => `<div class="spread" style="align-items:flex-start;gap:10px;justify-content:flex-start"><span style="font-size:18px">${icon}</span><div><strong>${esc(title)}</strong><div class="tiny muted">${esc(desc)}</div></div></div>`).join('')}
      </div>
    </div>

    <div class="card">
      <h3 style="margin-top:0">Technical stack</h3>
      <table class="tbl"><tbody>
        ${TECH_STACK.map(t => `<tr><td style="white-space:nowrap"><strong>${esc(t.area)}</strong></td><td>${esc(t.detail)}</td></tr>`).join('')}
      </tbody></table>
      <div class="divider"></div>
      <h3>Author</h3>
      <p style="margin:0"><strong>${esc(BUILD.author)}</strong></p>
      <p class="tiny muted" style="margin:4px 0 10px">Designer &amp; builder of the Hackathon Content Library.</p>
      <a class="btn primary" href="${esc(BUILD.repo)}" target="_blank" rel="noopener noreferrer">View on GitHub ↗</a>
    </div>
  </div>`;
}

// ---- Audit & Activity (centralized log) -----------------------------------
// Maps a record type to its detail route so log rows can deep-link.
const AUDIT_DETAIL_HASH = { 'Use case': '#/usecase/', 'Event': '#/event/', 'Pattern': '#/pattern/' };
function auditRecordCell(a) {
  const base = AUDIT_DETAIL_HASH[a.recordType];
  const title = a.recordTitle || a.recordId || '—';
  return (base && db.byId[a.recordId]) ? `<a href="${base}${esc(a.recordId)}">${esc(title)}</a>` : esc(title);
}
function auditChip(action) {
  if (action === 'Created' || action === 'Restored') return 'good';
  if (action === 'Deleted') return 'danger';
  if (action === 'Archived') return 'warn';
  return 'info';
}
function pageAudit() {
  setTimeout(wireAuditPage, 0);
  const entries = db.audit || [];
  const archived = archivedRecords();
  const types = [...new Set(entries.map(a => a.recordType))].filter(Boolean).sort();
  const actions = [...new Set(entries.map(a => a.action))].filter(Boolean).sort();
  return `
  <div class="page-head"><h1>Audit &amp; Activity</h1><p>One centralized trail of every create, edit, archive, restore and delete across the library. ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}.</p></div>
  ${archived.length ? `<div class="card" style="margin-bottom:18px">
    <h3 style="margin-top:0">🗄️ Archived records (${archived.length})</h3>
    <p class="muted tiny">Archived records are hidden from the catalog but kept here for recovery.</p>
    <table class="tbl"><thead><tr><th>Record</th><th>Type</th><th>Archived</th><th></th></tr></thead><tbody>
    ${archived.map(x => `<tr><td>${esc(recordTitleOf(x.r))}</td><td>${esc(RECORD_KINDS[x.kind].type)}</td><td>${esc(fmtDateTime(x.r.modifiedAt))}</td>
      <td style="text-align:right"><button class="btn tiny" data-restore-record="${x.kind}:${x.r.id}">↩︎ Restore</button>${isAdminMode() ? ` <button class="btn tiny danger ghost" data-remove-record="${x.kind}:${x.r.id}">🗑️ Delete</button>` : ''}</td></tr>`).join('')}
    </tbody></table>
  </div>` : ''}
  <div class="card">
    <div class="manage-toolbar" style="gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <input id="auditSearch" type="search" class="select" placeholder="Search record or details…" style="min-width:220px">
      <label class="tiny muted">Type&nbsp;<select id="auditType" class="select"><option value="">All</option>${types.map(t => `<option>${esc(t)}</option>`).join('')}</select></label>
      <label class="tiny muted">Action&nbsp;<select id="auditAction" class="select"><option value="">All</option>${actions.map(a => `<option>${esc(a)}</option>`).join('')}</select></label>
    </div>
    <div id="auditTableWrap"></div>
  </div>`;
}
function renderAuditTable() {
  const wrap = document.getElementById('auditTableWrap'); if (!wrap) return;
  const q = (document.getElementById('auditSearch')?.value || '').toLowerCase();
  const ty = document.getElementById('auditType')?.value || '';
  const ac = document.getElementById('auditAction')?.value || '';
  const list = (db.audit || []).filter(a => {
    if (ty && a.recordType !== ty) return false;
    if (ac && a.action !== ac) return false;
    if (q && ![a.recordTitle, a.summary, a.by, a.recordId].join(' ').toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  wrap.innerHTML = list.length
    ? `<div class="tbl-scroll"><table class="tbl audit-tbl"><thead><tr><th>When</th><th>Record</th><th>Type</th><th>Action</th><th>By</th><th>Details</th></tr></thead>
       <tbody>${list.map(a => `<tr><td>${esc(fmtDateTime(a.at))}</td><td>${auditRecordCell(a)}</td><td>${esc(a.recordType)}</td><td><span class="chip ${auditChip(a.action)}">${esc(a.action)}</span></td><td>${esc(a.by)}</td><td>${esc(a.summary)}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="muted">No activity matches these filters.</p>';
}
function wireAuditPage() {
  ['auditSearch', 'auditType', 'auditAction'].forEach(id => {
    const elm = document.getElementById(id);
    if (elm) elm.addEventListener(id === 'auditSearch' ? 'input' : 'change', renderAuditTable);
  });
  renderAuditTable();
}

const routes = {
  home: pageHome, events: pageEvents, usecases: pageUseCases,
  calendar: pageCalendar, pipeline: pagePipeline, patterns: pagePatterns,
  lessons: pageLessons, register: pageRegister, agencies: pageAgencies,
  audit: pageAudit, about: pageAbout
};

const registerRoutes = {
  agency: pageRegisterAgency, event: pageManageEvent, usecase: pageRegisterUseCase,
  pattern: pageRegisterPattern, lessons: pageRegisterLessons, feedback: pageRegisterLessons
};

function router() {
  const hash = location.hash.replace(/^#\//, '') || 'home';
  const [route, param] = hash.split('/');
  let html;
  if (route === 'usecase') html = pageUseCase(param);
  else if (route === 'event') html = pageEvent(param);
  else if (route === 'pattern') html = pagePattern(param);
  else if (route === 'register' && param && registerRoutes[param]) html = registerRoutes[param]();
  else if (routes[route]) html = routes[route]();
  else html = pageHome();

  app.innerHTML = '';
  app.appendChild(el(`<div>${html}</div>`));
  // nav active state
  document.querySelectorAll('.mainnav a').forEach(a => a.classList.toggle('active', a.dataset.route === route ||
    (route === 'usecase' && a.dataset.route === 'usecases') ||
    (route === 'event' && a.dataset.route === 'events') ||
    (route === 'pattern' && a.dataset.route === 'patterns')));
  const regMenu = document.getElementById('registerMenu');
  if (regMenu) { regMenu.classList.remove('open'); document.getElementById('registerToggle')?.setAttribute('aria-expanded', 'false'); }
  window.scrollTo(0, 0);
}

// Register dropdown menu toggle.
function wireRegisterMenu() {
  const menu = document.getElementById('registerMenu');
  const toggle = document.getElementById('registerToggle');
  if (!menu || !toggle) return;
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) { menu.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
  });
}

// Delegate clicks on [data-link] elements.
document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-link]');
  if (link && !e.target.closest('a')) { location.hash = link.dataset.link; }
});

// Delegate Edit / Audit actions (detail pages + cards).
document.addEventListener('click', (e) => {
  const audit = e.target.closest('[data-audit]');
  if (audit) { e.preventDefault(); e.stopPropagation(); openAuditModal(audit.dataset.audit); return; }
  const rm = e.target.closest('[data-remove-record]');
  if (rm) { e.preventDefault(); e.stopPropagation(); const [k, id] = rm.dataset.removeRecord.split(':'); confirmDelete(k, id); return; }
  const rs = e.target.closest('[data-restore-record]');
  if (rs) { e.preventDefault(); e.stopPropagation(); const [k, id] = rs.dataset.restoreRecord.split(':'); restoreRecord(k, id); toast('Record restored.'); router(); return; }
  const ea = e.target.closest('[data-edit-agency]');
  if (ea) { e.preventDefault(); e.stopPropagation(); openEditAgency(ea.dataset.editAgency); return; }
  const eu = e.target.closest('[data-edit-usecase]');
  if (eu) { e.preventDefault(); e.stopPropagation(); openEditUseCase(eu.dataset.editUsecase); return; }
  const ev = e.target.closest('[data-edit-event]');
  if (ev) { e.preventDefault(); e.stopPropagation(); openEditEvent(ev.dataset.editEvent); return; }
  const ec = e.target.closest('[data-edit-calendar]');
  if (ec) { e.preventDefault(); e.stopPropagation(); openEditCalendar(ec.dataset.editCalendar); return; }
  const pc = e.target.closest('[data-promote-calendar]');
  if (pc) { e.preventDefault(); e.stopPropagation(); promoteCalendar(pc.dataset.promoteCalendar); return; }
  const xp = e.target.closest('[data-export]');
  if (xp) { e.preventDefault(); e.stopPropagation(); handleExport(xp.dataset.export); return; }
});

// Resolve a [data-export] token to the right list + filename, then export.
function handleExport(token) {
  const [kind, arg] = String(token).split(':');
  if (kind === 'usecases') {
    exportUseCases(filteredUseCases(), `use-cases-${fileStamp()}.csv`);
  } else if (kind === 'pipeline') {
    const ranked = [...db.useCases].sort((a, b) => b._score - a._score);
    exportUseCases(ranked, `pipeline-${fileStamp()}.csv`);
  } else if (kind === 'event') {
    const ev = db.byId[arg];
    if (!ev) { toast('Hackathon not found.'); return; }
    const ucs = useCasesForEvent(arg).sort((a, b) => b._score - a._score);
    exportUseCases(ucs, `hackathon-${slug(ev.name)}-${fileStamp()}.csv`);
  }
}

window.addEventListener('hashchange', router);

// ---- Boot -----------------------------------------------------------------
loadData().then(() => {
  // Autosave is silent on success; on failure show a persistent banner so data
  // loss is never invisible (the always-on status bar was removed by design).
  onPersist((ok, err) => ok ? clearSaveError() : showSaveError(err));
  wireRegisterMenu();
  mountCsvBar();
  router();
  resolveAdminAccess();
}).catch(err => {
  app.innerHTML = `<div class="card"><h3>Could not load data</h3><p class="muted">${esc(err.message)}</p>
  <p class="tiny">This app loads JSON via fetch, which requires a web server (browsers block <code>file://</code> fetches). Serve the app folder over HTTP — see README.</p></div>`;
});

// ---- CSV-store control bar (only when running with ?data=csv) -------------
function mountCsvBar() {
  // SharePoint mode persists automatically (autosave); no status bar is shown.
  if (isSharePointMode()) return;
  if (!isCsvMode()) return;
  const bar = el(`<div class="csvbar">
    <span class="csvbar-tag">CSV mode</span>
    <span class="csvbar-status" id="csvStatus">Loaded from <code>data-live/</code> on disk — starts blank, fills as you capture.</span>
    <span class="csvbar-actions">
      <button class="btn tiny" id="csvSave">💾 Save to CSV</button>
      <button class="btn tiny" id="csvReload">↻ Reload</button>
      <button class="btn tiny danger" id="csvReset">⊘ Start blank</button>
    </span>
  </div>`);
  document.querySelector('.topbar').after(bar);
  const status = (msg) => { const s = document.getElementById('csvStatus'); if (s) s.textContent = msg; };
  document.getElementById('csvSave').onclick = async () => {
    status('Saving…'); await persist(); status('Saved all records to CSV on disk.'); toast('Saved to CSV.');
  };
  document.getElementById('csvReload').onclick = () => location.reload();
  document.getElementById('csvReset').onclick = async () => {
    if (!confirm('Delete all CSV records and start from a blank library?')) return;
    await resetCsv(); toast('CSV store cleared — starting blank.'); location.reload();
  };
}
