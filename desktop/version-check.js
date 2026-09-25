/*
 * "New version available" check (desktop main process, plain Node.js — unit-tested directly).
 * Reads only a small JSON description of the latest published version (update.json, attached to the latest
 * GitHub release). Nothing is downloaded or installed automatically: the user is told and can open the
 * download page in the browser to install the new version themselves.
 *   update.json = { format: 'coldload-update', version, builtAt, sha256, ... }
 */

/** installed / published = parsed update.json of the running app and of the latest release. */
function compareBuilds(installed, published) {
  if (!published || published.format !== 'coldload-update' || typeof published.builtAt !== 'string' || typeof published.sha256 !== 'string') {
    return { status: 'invalid' };
  }
  const info = { version: String(published.version || '').slice(0, 20), builtAt: published.builtAt };
  if (!installed || !installed.sha256) return { ...info, status: 'unknown-installed' };
  if (published.sha256 === installed.sha256 || !(published.builtAt > (installed.builtAt || ''))) return { ...info, status: 'up-to-date' };
  return { ...info, status: 'available' };
}

async function checkLatest(fetchImpl, url, installed) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(res.status === 404 ? 'no published version found yet' : `HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > 100000) throw new Error('unexpected response');
  let published;
  try { published = JSON.parse(text); } catch (e) { throw new Error('the version information is not readable'); }
  const r = compareBuilds(installed, published);
  if (r.status === 'invalid') throw new Error('the version information is not valid');
  return r;
}

module.exports = { compareBuilds, checkLatest };
