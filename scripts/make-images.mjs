// Renders assets/og.png (1200×630) from templates/og.html and assets/apple-touch-icon.png
// (180×180) from assets/favicon.svg, using headless Chrome. Run once after design changes:
//   node scripts/make-images.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { launchChrome } from './lib/chrome.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chrome = await launchChrome();

async function shoot(url, width, height, out) {
  const { targetId } = await chrome.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await chrome.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => chrome.send(m, p, sessionId);
  await s('Page.enable');
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const loaded = chrome.waitFor(sessionId, 'Page.loadEventFired');
  await s('Page.navigate', { url });
  await loaded;
  const { data } = await s('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } });
  await writeFile(path.join(ROOT, out), Buffer.from(data, 'base64'));
  await chrome.send('Target.closeTarget', { targetId });
  console.log(`✓ ${out} (${width}×${height})`);
}

try {
  await shoot(pathToFileURL(path.join(ROOT, 'templates/og.html')).href, 1200, 630, 'assets/og.png');
  // iOS rounds the corners itself, so draw the icon full-bleed.
  const svg = (await readFile(path.join(ROOT, 'assets/favicon.svg'), 'utf8')).replace(' rx="14"', '');
  const html = `<!doctype html><style>html,body{margin:0;background:#0b1f3a}img{display:block;width:180px;height:180px}</style><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`;
  await shoot(`data:text/html;base64,${Buffer.from(html).toString('base64')}`, 180, 180, 'assets/apple-touch-icon.png');
} finally {
  await chrome.close();
}
