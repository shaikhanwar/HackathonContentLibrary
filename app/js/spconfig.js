// spconfig.js — the ONLY place that knows anything tenant- or site-specific.
// Keeping every site detail here is what makes the app portable: to move the
// library to a different SharePoint site (e.g. from a personal site to the org
// site) you change nothing in code — you re-provision the lists on the new
// site and re-upload these files. The app always talks to whatever site it is
// hosted on.
//
// How the target site is resolved (first match wins):
//   1. window.HCL_SITE_URL          — optional global set on the host page.
//   2. SP_CONFIG.siteUrlOverride    — optional explicit URL set below.
//   3. _spPageContextInfo.webAbsoluteUrl — the site the app is hosted in
//                                          (the normal SharePoint-hosted case).
//   4. location.origin              — last-resort same-origin fallback.

export const SP_CONFIG = {
  // Leave blank for the portable default (use the current SharePoint site).
  // Set to a full web URL only if you must point a locally served copy at a
  // remote site, e.g. "https://contoso.sharepoint.com/sites/HackathonLibrary".
  siteUrlOverride: '',

  // List internal-name prefix. The provisioning script creates the lists as
  // HCLAgencies, HCLEvents, … If your tenant requires a different prefix (or a
  // shared site already uses HCL*), set it here and re-provision to match.
  listPrefix: '',

  // Max items to request per page when reading a list. SharePoint caps a single
  // response at 5000; the adapter follows paging automatically beyond this.
  pageSize: 5000,

  // Permanent (hard) delete is reserved for admins. In a SharePoint deployment
  // membership is decided by the live site, NOT a URL flag: a user qualifies if
  // they are a site collection administrator, or a member of the group named
  // here. Create this group on the site (Site settings → People and groups) and
  // add your curators. Leave the SharePoint Group name as-is or change it to an
  // existing group; if the group does not exist, only site admins qualify.
  adminGroup: 'HCL Admins'
};

// Derive the site (web) URL from the current location when the app is served
// as a static file from a SharePoint library (e.g. .../sites/X/SiteAssets/hcl/
// index.html). A raw .html file does NOT get _spPageContextInfo, so we cut the
// path at the first library segment to recover the web URL. Works for both
// root-hosted (/SiteAssets/...) and managed-path sites (/sites/X/SiteAssets/...).
function deriveWebUrlFromLocation() {
  if (typeof location === 'undefined') return '';
  const path = location.pathname || '';
  // Everything up to (but not including) the hosting library folder.
  const m = path.match(/^(.*?)\/(?:siteassets|style%20library|sitepages|shared%20documents|documents|lists)\//i);
  const webPath = m ? m[1] : '';
  return `${location.origin}${webPath}`;
}

// True when the app is hosted on a SharePoint Online domain (any *.sharepoint.com).
function onSharePointHost() {
  return typeof location !== 'undefined' && /\.sharepoint\.com$/i.test(location.hostname || '');
}

// Resolve the absolute web URL of the SharePoint site to talk to.
export function resolveSiteUrl() {
  const fromGlobal = (typeof window !== 'undefined' && window.HCL_SITE_URL) || '';
  const fromCtx = (typeof window !== 'undefined' && window._spPageContextInfo &&
    window._spPageContextInfo.webAbsoluteUrl) || '';
  const url = fromGlobal || SP_CONFIG.siteUrlOverride || fromCtx ||
    (onSharePointHost() ? deriveWebUrlFromLocation() : '') ||
    (typeof location !== 'undefined' ? location.origin : '');
  return String(url).replace(/\/+$/, ''); // no trailing slash
}

// True when the app is running against a SharePoint site. This is the case
// either inside a real SharePoint page (host injects _spPageContextInfo) or
// when the static files are served from a SharePoint library (any
// *.sharepoint.com host). Lets the deployed copy auto-activate SharePoint mode,
// while localhost stays on seed/CSV unless ?data=sharepoint is set.
export function inSharePointPage() {
  if (typeof window !== 'undefined' && window._spPageContextInfo &&
    window._spPageContextInfo.webAbsoluteUrl) return true;
  return onSharePointHost();
}

// Full internal list name for a logical list (applies the configured prefix).
export function listName(internal) {
  return `${SP_CONFIG.listPrefix || ''}${internal}`;
}
