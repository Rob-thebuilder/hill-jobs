// Minimal headless-Chrome driver over the DevTools protocol. Node 22+ built-ins only.
// Env: CHROME=/path/to/chrome, CHROME_FLAGS="--extra --flags"
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function launchChrome() {
  const profile = await mkdtemp(path.join(tmpdir(), 'wah-chrome-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    // e.g. CHROME_FLAGS=--no-sandbox on CI runners that need it
    ...(process.env.CHROME_FLAGS || '').split(' ').filter(Boolean),
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const close = async () => {
    try { ws?.close(); } catch {}
    proc.kill('SIGKILL');
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  };

  let ws;
  try {
    const wsUrl = await new Promise((resolve, reject) => {
      let buf = '';
      const t = setTimeout(() => reject(new Error('Chrome did not start (no DevTools URL in 20 s)')), 20_000);
      proc.stderr.on('data', (d) => {
        buf += d;
        const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
        if (m) { clearTimeout(t); resolve(m[1]); }
      });
      proc.on('error', reject);
      proc.on('exit', (code) => reject(new Error(`Chrome exited early (${code}); set CHROME=/path/to/chrome`)));
    });
    ws = new WebSocket(wsUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('DevTools socket failed')); });
  } catch (err) {
    await close();
    throw err;
  }

  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }));
    });
  const waitFor = (sessionId, method, ms = 15_000) =>
    new Promise((resolve, reject) => {
      const fn = (m) => {
        if (m.sessionId === sessionId && m.method === method) { clearTimeout(t); listeners.delete(fn); resolve(m.params); }
      };
      const t = setTimeout(() => { listeners.delete(fn); reject(new Error(`timeout waiting for ${method}`)); }, ms);
      listeners.add(fn);
    });

  return { send, waitFor, listeners, close };
}
