/* ===========================================================================
 * deploy-app-browser.js
 * ---------------------------------------------------------------------------
 * Uploads the Hackathon Content Library app files to a SharePoint document
 * library using the *browser's own authenticated session* — no PnP, no app
 * registration. Run it from the DevTools console while signed in to the target
 * site (e.g. https://contoso.sharepoint.com).
 *
 * HOW TO RUN
 *   1. Open the target SharePoint SITE in the browser (must be a SP page so
 *      REST is same-origin), signed in as the dev admin.
 *   2. F12 -> Console. If pasting is blocked, type:  allow pasting  <Enter>.
 *   3. Paste this whole file and press Enter.
 *   4. A folder picker appears. Select your local "prototype" folder
 *      (d:\Anwar\MSFT\Stretched\ContentLibrary\prototype).
 *   5. It uploads index.html, css/styles.css and the js/*.js files into
 *      <library>/<folder> (default: SiteAssets/hcl) and prints the open URL.
 *
 * Re-running overwrites existing files (overwrite=true), so it is safe to
 * deploy updates the same way.
 * ======================================================================== */
(async () => {
  'use strict';

  const LIBRARY = 'SiteAssets';   // document library to host the app
  const FOLDER  = 'hcl';          // sub-folder inside the library

  const ctx = window._spPageContextInfo || {};
  const site = ctx.webAbsoluteUrl || location.origin;
  const webRel = (ctx.webServerRelativeUrl || '/').replace(/\/$/, ''); // '' for root web

  // App files to deploy, as paths relative to the selected "prototype" folder.
  const ALLOW = new Set([
    'index.html',
    'css/styles.css',
    'js/app.js',
    'js/csvstore.js',
    'js/csvtest.js',
    'js/data.js',
    'js/factory.js',
    'js/scoring.js',
    'js/selftest.js',
    'js/sharepointstore.js',
    'js/spconfig.js'
  ]);

  const log  = (...a) => console.log('%c[deploy]', 'color:#06c', ...a);
  const warn = (...a) => console.warn('[deploy]', ...a);
  const err  = (...a) => console.error('[deploy]', ...a);

  const VERBOSE = { 'Accept': 'application/json;odata=verbose' };

  async function getDigest() {
    const r = await fetch(`${site}/_api/contextinfo`, {
      method: 'POST',
      headers: { ...VERBOSE, 'Content-Type': 'application/json;odata=verbose' },
      credentials: 'same-origin'
    });
    if (!r.ok) throw new Error(`contextinfo failed (${r.status}). Are you signed in to ${site}?`);
    const j = await r.json();
    return j.d.GetContextWebInformation.FormDigestValue;
  }

  // Ensure a folder (by site-relative path) exists.
  async function ensureFolder(relPath, digest) {
    const serverRel = `${webRel}/${relPath}`.replace(/\/+/g, '/');
    const r = await fetch(`${site}/_api/web/folders`, {
      method: 'POST',
      headers: { ...VERBOSE, 'Content-Type': 'application/json;odata=verbose', 'X-RequestDigest': digest },
      credentials: 'same-origin',
      body: JSON.stringify({ '__metadata': { 'type': 'SP.Folder' }, 'ServerRelativeUrl': serverRel })
    });
    // 200/201 = created; an already-exists error is fine to ignore.
    if (!r.ok && r.status !== 409) {
      const t = await r.text();
      if (!/already exists/i.test(t)) warn(`ensureFolder ${serverRel}: ${r.status} ${t.slice(0,180)}`);
    }
    return serverRel;
  }

  async function uploadFile(folderServerRel, fileName, arrayBuffer, digest) {
    const url = `${site}/_api/web/GetFolderByServerRelativeUrl('${encodeURIComponent(folderServerRel)}')` +
                `/Files/add(url='${encodeURIComponent(fileName)}',overwrite=true)`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { ...VERBOSE, 'X-RequestDigest': digest },
      credentials: 'same-origin',
      body: arrayBuffer
    });
    if (!r.ok) throw new Error(`upload ${fileName} failed (${r.status}): ${(await r.text()).slice(0,200)}`);
  }

  // Pick the local prototype folder via a hidden directory input.
  function pickFolder() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      input.addEventListener('change', () => {
        const files = Array.from(input.files || []);
        document.body.removeChild(input);
        if (!files.length) reject(new Error('No folder selected.'));
        else resolve(files);
      });
      document.body.appendChild(input);
      log('Opening folder picker — select your local "prototype" folder...');
      input.click();
    });
  }

  try {
    log(`Target site: ${site}`);
    const files = await pickFolder();

    // Map selected files by their path relative to the top selected folder.
    // webkitRelativePath looks like "prototype/js/app.js".
    const wanted = [];
    for (const f of files) {
      const rel = f.webkitRelativePath.split('/').slice(1).join('/'); // drop top folder
      if (ALLOW.has(rel)) wanted.push({ f, rel });
    }
    if (!wanted.length) {
      throw new Error('None of the expected app files were found. Did you select the "prototype" folder?');
    }
    log(`Found ${wanted.length}/${ALLOW.size} app files. Uploading to ${LIBRARY}/${FOLDER} ...`);

    let digest = await getDigest();

    // Ensure base + sub folders exist.
    const base = `${LIBRARY}/${FOLDER}`;
    await ensureFolder(LIBRARY, digest);
    const baseServerRel = await ensureFolder(base, digest);
    await ensureFolder(`${base}/css`, digest);
    await ensureFolder(`${base}/js`, digest);

    let ok = 0, fail = 0;
    for (const { f, rel } of wanted) {
      const parts = rel.split('/');
      const fileName = parts.pop();
      const subFolderServerRel = parts.length
        ? `${baseServerRel}/${parts.join('/')}`
        : baseServerRel;
      try {
        const buf = await f.arrayBuffer();
        await uploadFile(subFolderServerRel, fileName, buf, digest);
        log(`  ✓ ${rel}`);
        ok++;
      } catch (e) {
        fail++;
        err(`  ✗ ${rel}: ${e.message}`);
        try { digest = await getDigest(); } catch (_) {}
      }
    }

    const openUrl = `${site}/${base}/index.html`;
    log('==================================================');
    log(`Uploaded: ${ok}, failed: ${fail}`);
    if (fail === 0) {
      log('Deploy complete. Open the app at:');
      console.log('%c' + openUrl, 'color:#0a7;font-weight:bold');
    } else {
      warn('Finished with some failures — review messages above.');
    }
  } catch (e) {
    err(e.message);
  }
})();
