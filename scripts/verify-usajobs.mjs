// Checks that each card's API open-job count equals what its "View jobs" link shows on the
// live USAJOBS website. Run by hand (it loads usajobs.gov in headless Chrome):
//   node scripts/verify-usajobs.mjs
// Reads USAJOBS_API_KEY / USAJOBS_EMAIL from the environment or .env. Never prints them.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { apiParamsFromJobsUrl, fetchUsajobs } from './lib/usajobs.mjs';
import { launchChrome } from './lib/chrome.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const key = process.env.USAJOBS_API_KEY;
const email = process.env.USAJOBS_EMAIL;
if (!key || !email) {
  console.error('USAJOBS_API_KEY and USAJOBS_EMAIL must be set (in .env or the environment).');
  process.exit(1);
}

const data = JSON.parse(await readFile(path.join(ROOT, 'data/employers.json'), 'utf8'));
const entries = data.employers.filter((e) => apiParamsFromJobsUrl(e.jobsUrl));
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

async function apiCount(e) {
  const r = await fetchUsajobs([e], { key, email });
  return r?.counts[e.id] ?? null;
}

async function siteCount(chrome, url) {
  const { targetId } = await chrome.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await chrome.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => chrome.send(m, p, sessionId);
  try {
    await s('Page.enable');
    await s('Runtime.enable');
    await s('Emulation.setUserAgentOverride', { userAgent: BROWSER_UA });
    const loaded = chrome.waitFor(sessionId, 'Page.loadEventFired', 30_000);
    await s('Page.navigate', { url });
    await loaded;
    // Results render client-side; poll for the "1 – N of N jobs" line or a no-results message.
    for (let i = 0; i < 30; i++) {
      const { result } = await s('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          const t = document.body.innerText;
          const m = t.match(/\\bof\\s+([\\d,]+)\\s+jobs?\\b/i);
          if (m) return Number(m[1].replace(/,/g, ''));
          if (/no jobs (were )?found|0 jobs|no results/i.test(t)) return 0;
          return null;
        })()`,
      });
      if (result.value !== null && result.value !== undefined) return result.value;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  } finally {
    await chrome.send('Target.closeTarget', { targetId });
  }
}

const chrome = await launchChrome();
let mismatches = 0;
try {
  console.log('employer                        API   website  result');
  for (const e of entries) {
    let api, web;
    for (let attempt = 1; attempt <= 2; attempt++) {
      [api, web] = [await apiCount(e), await siteCount(chrome, e.jobsUrl)];
      if (api !== null && api === web) break; // a job can close between the two reads, so retry once
    }
    const ok = api !== null && api === web;
    if (!ok) mismatches++;
    console.log(`${e.id.padEnd(30)}  ${String(api ?? '—').padStart(4)}  ${String(web ?? '—').padStart(7)}  ${ok ? 'match' : 'MISMATCH'}`);
  }
} finally {
  await chrome.close();
}
console.log(mismatches ? `\n${mismatches} mismatch(es)` : `\nAll ${entries.length} counts match the live site`);
process.exit(mismatches ? 1 : 0);
