// Code completion. Run with: npm test --workspace packages/language
// Langium only completes keywords and cross-references, so anything worth proposing has to be
// one of the two rather than a terminal.
import assert from 'node:assert/strict';
import { EmptyFileSystem } from 'langium';
import { expectCompletion } from 'langium/test';
import { createBsdocServices } from '../out/index.js';

const completion = expectCompletion(createBsdocServices(EmptyFileSystem).Bsdoc);

const header = `> Read and modify player XP levels.

name: XP
slug: bookshelf-xp
version: 5.0.0
`;

/** The labels proposed at the '<|>' marker of `text`. */
const proposalsAt = async (text) => {
    let labels;
    await completion({ text, index: 0, assert: (completions) => { labels = completions.items.map(item => item.label); } });
    return labels.sort();
};

const REGISTRIES = ['block_tag', 'context_float_provider', 'context_int_provider', 'entity_type_tag', 'function', 'function_tag', 'loot_table', 'predicate'];
const KINDS = ['arguments', 'dimension', 'executor', 'macro', 'position', 'result', 'rotation', 'state', 'storage', 'success'];
const DATA = ['any', 'boolean', 'byte', 'double', 'float', 'int', 'long', 'number', 'short', 'string'];

// 'feature' opens a feature at the start of a line, then a registry, then a free name
assert.deepEqual(await proposalsAt(`${header}<|>`), ['feature']);
assert.deepEqual(await proposalsAt(`${header}feature <|>`), REGISTRIES);
assert.deepEqual(await proposalsAt(`${header}feature function <|>`), []);

/** A feature body holding `slots`, with the cursor inside. */
const inFeature = (slots, registry = 'function') => `${header}feature ${registry} f > doc
  authors: A
  created: 2022/11/14 1.18.2
  updated: 2026/11/19 26.3
${slots}`;

// a kind follows a role: only the ones the registry takes in that role
assert.deepEqual(await proposalsAt(inFeature('  input <|>')), ['arguments', 'macro', 'state', 'storage']);
assert.deepEqual(await proposalsAt(inFeature('  context <|>')), ['dimension', 'executor', 'position', 'rotation', 'state']);
assert.deepEqual(await proposalsAt(inFeature('  output <|>')), ['result', 'state', 'storage', 'success']);
assert.deepEqual(await proposalsAt(inFeature('  output <|>', 'predicate')), ['success']);
assert.deepEqual(await proposalsAt(inFeature('  input <|>', 'loot_table')), ['state', 'storage']);
assert.deepEqual(await proposalsAt(inFeature('  context <|>', 'block_tag')), []);
// a '$' definition takes any kind, and any type
const defined = await proposalsAt(`${header}$v = <|>`);
assert.deepEqual(defined.filter(label => KINDS.includes(label)), KINDS);
assert.deepEqual(defined.filter(label => DATA.includes(label)), DATA);
// a storage path is a free name
assert.deepEqual(await proposalsAt(inFeature('  input storage <|>')), []);
assert.deepEqual(await proposalsAt(inFeature('  input storage bs.xp:shared <|>')), []);

// a type follows a kind and its colon: only the primitives the kind takes. '{' and '[' open a
// composite type, which Langium does not reach through the Type -> Member -> Base chain.
assert.deepEqual(await proposalsAt(inFeature('  input storage: <|>')), DATA);
assert.deepEqual(await proposalsAt(inFeature('  context position: <|>')), ['entity', 'player', 'xyz']);
assert.deepEqual(await proposalsAt(inFeature('  context rotation: <|>')), ['entity', 'player', 'xy']);
assert.deepEqual(await proposalsAt(inFeature('  context executor: <|>')), ['entity', 'player']);
assert.deepEqual(await proposalsAt(inFeature('  context dimension: <|>')), ['any', 'end', 'nether', 'overworld']);
assert.deepEqual(await proposalsAt(inFeature('  output result: <|>')), ['float', 'int']);
assert.deepEqual(await proposalsAt(inFeature('  context executor: player | <|>')), ['entity', 'player']);
// a struct entry is data whatever the kind, a macro included, and its name is free
assert.deepEqual(await proposalsAt(inFeature('  input macro: {\n    p: <|>')), DATA);
assert.deepEqual(await proposalsAt(inFeature('  input macro: {\n    <|>')), []);
assert.deepEqual(await proposalsAt(inFeature('  input storage: {\n    p: [<|>')), DATA);
assert.deepEqual(await proposalsAt(inFeature('  input storage: {\n    p: #[id="block"] <|>')), DATA);

// a '$' in slot position proposes the slot definitions in scope whose kind the role and the
// registry take, in type position the type aliases
const definitions = `${header}$my_storage = storage: int > doc
$my_position = position: xyz > doc
$my_type = string > doc
`;
assert.deepEqual(await proposalsAt(definitions + inFeature('  input $<|>')), ['$my_storage']);
assert.deepEqual(await proposalsAt(definitions + inFeature('  input $my<|>')), ['$my_storage']);
assert.deepEqual(await proposalsAt(definitions + inFeature('  context $<|>')), ['$my_position']);
assert.deepEqual(await proposalsAt(definitions + inFeature('  input storage: $<|>')), ['$my_type']);
assert.deepEqual(await proposalsAt(definitions + inFeature('  input storage: {\n    p: $<|>')), ['$my_type']);
assert.deepEqual(await proposalsAt(definitions + inFeature('  output $<|>', 'loot_table')), []);

// the proposal replaces the '$' already typed
let edit;
await completion({
    text: definitions + inFeature('  input $<|>'), index: 0,
    assert: (completions) => { edit = completions.items[0].textEdit; },
});
const range = edit.range ?? edit.replace;
assert.equal(edit.newText, '$my_storage');
assert.equal(range.end.character - range.start.character, 1, "the '$' is replaced, not doubled");

console.log('ok');
