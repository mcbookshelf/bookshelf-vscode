// Run with: npm test --workspace packages/language  (requires a prior `npm run build`)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createBookshelfDocServices } from '../out/index.js';

const parse = parseHelper(createBookshelfDocServices(EmptyFileSystem).BookshelfDoc);

const check = async (text) => {
    const doc = await parse(text);
    assert.deepEqual(doc.parseResult.lexerErrors.map(e => e.message), []);
    assert.deepEqual(doc.parseResult.parserErrors.map(e => e.message), []);
    return doc.parseResult.value;
};

const propertyOf = (node, key) => node.slots.find(slot => slot.$type === 'Property' && slot.key === key)?.value;

const xp = await check(readFileSync(new URL('../../../exemple', import.meta.url), 'utf-8'));
assert.equal(propertyOf(xp, 'name'), 'XP');
assert.equal(propertyOf(xp, 'slug'), 'bookshelf-xp');
assert.equal(propertyOf(xp, 'version'), '5.0.0');
assert.equal(propertyOf(xp, 'tags'), 'runtime');
assert.equal(propertyOf(xp, 'description'), 'Read and modify player XP levels, and set the progress bar by percentage rather than by points.');

// fields in any order, multiple tags, short version, punctuation in free text
const other = await check(`description: 'Some free text: with punctuation, 2 numbers & symbols!'
tags: runtime, datapack-only
version: 5
slug: bookshelf-health
name: "Player XP"`);
assert.equal(propertyOf(other, 'name'), '"Player XP"');
assert.equal(propertyOf(other, 'description'), "'Some free text: with punctuation, 2 numbers & symbols!'");
assert.equal(propertyOf(other, 'tags'), 'runtime, datapack-only');
assert.equal(propertyOf(other, 'version'), '5');

console.log('ok');
