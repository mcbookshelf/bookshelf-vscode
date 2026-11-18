// Code completion. Run with: npm test --workspace packages/language
// Langium only completes keywords and cross-references, so anything worth proposing has to be
// one of the two rather than a terminal.
import assert from 'node:assert/strict';
import { EmptyFileSystem } from 'langium';
import { expectCompletion } from 'langium/test';
import { createBsdocServices } from '../out/index.js';

const completion = expectCompletion(createBsdocServices(EmptyFileSystem).Bsdoc);

const header = `> Read and modify player XP levels.

name XP
slug bookshelf-xp
version 5.0.0
`;

/** The labels proposed at the '<|>' marker of `text`. */
const proposalsAt = async (text) => {
    let labels;
    await completion({ text, index: 0, assert: (completions) => { labels = completions.items.map(item => item.label); } });
    return labels.sort();
};

const HEAD = ['documentation', 'name', 'slug', 'tags', 'version', 'weak_dependencies'];
const METADATA = ['authors', 'contributors', 'deprecated', 'experimental', 'since'];
const CONTEXTS = ['@dimension', '@executor', '@position', '@rotation', '@state'];
const REGISTRIES = ['block_tag', 'context_float_provider', 'context_int_provider', 'entity_type_tag', 'function', 'loot_table', 'predicate', 'structure'];
const DATA = ['any', 'boolean', 'byte', 'double', 'float', 'int', 'long', 'number', 'short', 'string', 'struct'];

// a line of the head, or 'feature', opens a line of the file; then a registry, then a free id
assert.deepEqual(await proposalsAt(`${header}<|>`), [...HEAD, ...METADATA, 'feature'].sort());
assert.deepEqual(await proposalsAt(`${header}feature <|>`), REGISTRIES);
assert.deepEqual(await proposalsAt(`${header}feature function <|>`), []);
// the value of a property is free text
assert.deepEqual(await proposalsAt(`${header}tags <|>`), []);

/** A feature body holding `lines`, with the cursor inside. */
const inFeature = (lines, registry = 'function') => `${header}feature ${registry} f > doc
  authors A
  since 2022/11/14 1.18.2
${lines}`;

// a line of a feature: metadata, and what its registry takes
assert.deepEqual(await proposalsAt(inFeature('  <|>')), [...CONTEXTS, ...METADATA, 'input', 'output'].sort());
assert.deepEqual(await proposalsAt(inFeature('  <|>', 'block_tag')), METADATA);
assert.deepEqual(await proposalsAt(`${header}feature function f > doc\n  <|>`), [...CONTEXTS, ...METADATA, 'input', 'output'].sort(), 'the first line of a feature');
assert.deepEqual(await proposalsAt(`${header}feature function f\n  <|>`), [...CONTEXTS, ...METADATA, 'input', 'output'].sort(), 'without a doc');
assert.deepEqual(await proposalsAt(inFeature('  @position\n  output success\n  <|>')), [...CONTEXTS, ...METADATA, 'input', 'output'].sort(), 'after lines without a doc');
// a line which starts the line after a feature closes it
assert.deepEqual(await proposalsAt(inFeature('<|>')), ['feature']);
assert.deepEqual(await proposalsAt(inFeature('  input arguments:\n    a: int\n<|>')), ['feature']);
assert.deepEqual(await proposalsAt(inFeature('  input arguments:\n    a: int\n  <|>')), [...CONTEXTS, ...METADATA, 'input', 'output'].sort(), 'back in the feature');

// a kind follows 'input' or 'output': only the ones the registry takes there
assert.deepEqual(await proposalsAt(inFeature('  input <|>')), ['arguments', 'macro', 'state', 'storage']);
assert.deepEqual(await proposalsAt(inFeature('  output <|>')), ['result', 'state', 'storage', 'success']);
assert.deepEqual(await proposalsAt(inFeature('  output <|>', 'predicate')), ['success']);
assert.deepEqual(await proposalsAt(inFeature('  input <|>', 'loot_table')), ['state', 'storage']);
assert.deepEqual(await proposalsAt(inFeature('  output s<|>')), ['state', 'storage', 'success']);
// a storage path is a free name
assert.deepEqual(await proposalsAt(inFeature('  input storage <|>')), []);
assert.deepEqual(await proposalsAt(inFeature('  input storage bs.xp:shared <|>')), []);

// a type follows a colon: only the ones the line takes. '[' opens a list, which is not proposed.
assert.deepEqual(await proposalsAt(inFeature('  input storage: <|>')), DATA);
assert.deepEqual(await proposalsAt(inFeature('  @position: <|>')), ['entity', 'player', 'xyz']);
assert.deepEqual(await proposalsAt(inFeature('  @rotation: <|>')), ['entity', 'player', 'xy']);
assert.deepEqual(await proposalsAt(inFeature('  @executor: <|>')), ['entity', 'player']);
assert.deepEqual(await proposalsAt(inFeature('  @dimension: <|>')), ['any', 'end', 'nether', 'overworld']);
assert.deepEqual(await proposalsAt(inFeature('  output result: <|>')), ['float', 'int']);
assert.deepEqual(await proposalsAt(inFeature('  @executor: player | <|>')), ['entity', 'player']);
// a field is data whatever the line, and its name is free
assert.deepEqual(await proposalsAt(inFeature('  input macro:\n    p: <|>')), DATA);
assert.deepEqual(await proposalsAt(inFeature('  input macro:\n    <|>')), []);
assert.deepEqual(await proposalsAt(inFeature('  input storage:\n    p: [<|>')), DATA);
assert.deepEqual(await proposalsAt(inFeature('  input storage:\n    p: #[id="block"] <|>')), DATA);
assert.deepEqual(await proposalsAt(inFeature('  input storage:\n    p:\n      q: <|>')), DATA);
// a definition takes any type, and its block either fields or lines
const defined = await proposalsAt(`${header}$v: <|>`);
assert.deepEqual(defined, [...DATA, 'end', 'entity', 'nether', 'overworld', 'player', 'xy', 'xyz'].sort());
assert.deepEqual(await proposalsAt(`${header}$v:\n  <|>`), [...CONTEXTS, ...METADATA, 'input', 'output'].sort());
// the text of a list property is free
assert.deepEqual(await proposalsAt(`${header}$v[a]:\n  key: <|>`), []);

// a '$' proposes the definitions which fit: types and structs as a type, lines in a feature,
// structs among fields; a list is written in an id or a text, where nothing is proposed
const definitions = `${header}$my_type: string > doc
$my_struct:
  x: int
$my_lines:
  @position > doc
$my_list[a, b]
`;
assert.deepEqual(await proposalsAt(definitions + inFeature('  input storage: $<|>')), ['$my_struct', '$my_type']);
assert.deepEqual(await proposalsAt(definitions + inFeature('  input storage: $my_s<|>')), ['$my_struct']);
assert.deepEqual(await proposalsAt(definitions + inFeature('  input storage:\n    p: $<|>')), ['$my_struct', '$my_type']);
assert.deepEqual(await proposalsAt(definitions + inFeature('  $<|>')), ['$my_lines']);
assert.deepEqual(await proposalsAt(definitions + inFeature('  input storage:\n    $<|>')), ['$my_struct']);
assert.deepEqual(await proposalsAt(definitions + inFeature('  input storage:\n    p: int\n    $<|>')), ['$my_struct']);
assert.deepEqual(await proposalsAt(definitions + inFeature('  input storage:\n    p: int\n  $<|>')), ['$my_lines']);
assert.deepEqual(await proposalsAt(definitions + `$other:\n  y: int\n  $<|>`), ['$my_struct']);
assert.deepEqual(await proposalsAt(definitions + `$other:\n  @rotation\n  $<|>`), ['$my_lines']);

// the proposal replaces the '$' already typed
let edit;
await completion({
    text: definitions + inFeature('  $<|>'), index: 0,
    assert: (completions) => { edit = completions.items[0].textEdit; },
});
const range = edit.range ?? edit.replace;
assert.equal(edit.newText, '$my_lines');
assert.equal(range.end.character - range.start.character, 1, "the '$' is replaced, not doubled");

console.log('ok');
