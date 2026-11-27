// Contract award amounts never go in this public repo: not in text, and not hidden in a source link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const files = ['SPEC.md', ...(await readdir(new URL('data/', root))).filter((f) => /\.(json|md)$/.test(f)).map((f) => `data/${f}`)];

// Links whose address states an award amount: "...-21-6-million-...", or Defense Daily
// contract-award pages, whose addresses end in the award amount.
const AMOUNT_IN_URL = /https?:\/\/[^\s"')<>]*(?:\d[-.]?(?:million|billion)|defensedaily\.com\/contract-awards\/)[^\s"')<>]*/i;

test('no source link states a contract award amount', async () => {
  for (const f of files) {
    const text = await readFile(new URL(f, root), 'utf8');
    const hit = text.match(AMOUNT_IN_URL);
    assert.equal(hit, null, `${f}: ${hit?.[0]}`);
  }
});
