// Run with: npm test --workspace packages/language  (requires a prior `npm run build`)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createBsdocServices } from '../out/index.js';

const parse = parseHelper(createBsdocServices(EmptyFileSystem).Bsdoc);

let count = 0;
const uri = (path = 'modules/bs.x/module.bs') => `file:///${count++}/${path}`;

const check = async (text, path) => {
    const doc = await parse(text, { documentUri: uri(path) });
    assert.deepEqual(doc.parseResult.lexerErrors.map(e => e.message), [], text);
    assert.deepEqual(doc.parseResult.parserErrors.map(e => e.message), [], text);
    return doc.parseResult.value;
};
const parses = async (text) => {
    const doc = await parse(text, { documentUri: uri() });
    return [...doc.parseResult.lexerErrors, ...doc.parseResult.parserErrors].length === 0;
};

const propertyOf = (node, key) => ('head' in node ? node.head : node.items).findLast(item => item.$type === 'Property' && item.key === key)?.value;
const variable = (node, name) => ('head' in node ? node.head : node.items).find(item => item.$type === 'Variable' && item.name === name);
const slots = (feature) => feature.items.filter(item => item.$type === 'Slot');

const header = `> Read and modify player XP levels.

name: XP
slug: bookshelf-xp
version: 5.0.0
`;

// --- the head: a description doc, then properties with free text values

assert.equal((await check(`> desc\n`)).description, 'desc');
assert.equal((await check(`# a comment\n\n> desc\n`)).description, 'desc', 'comment and blank lines before the description');
assert.equal((await check(`\n> desc\n`)).description, 'desc', 'a leading blank line');
assert.equal((await check(``)).description, undefined, 'an empty file');
assert.equal((await check(`name: XP\n`)).description, undefined, 'no description');

const loose = await check(`${header}tags: runtime, datapack-only
documentation: https://docs.mcbookshelf.dev/en/latest/modules/xp.html
name: input storage: {} > 1..2, and "quotes" too! # not a comment
`);
assert.equal(propertyOf(loose, 'tags'), 'runtime, datapack-only');
assert.equal(propertyOf(loose, 'documentation'), 'https://docs.mcbookshelf.dev/en/latest/modules/xp.html');
assert.equal(propertyOf(loose, 'name'), 'input storage: {} > 1..2, and "quotes" too! # not a comment', 'free text holds anything');
assert.equal(propertyOf(await check(`name:    Player XP   \n`), 'name'), 'Player XP', 'surrounding whitespace is not part of the value');
assert.equal(propertyOf(await check(`name:\n`), 'name'), undefined, 'an empty value parses, validation reports it');
assert.ok(!await parses(`name:\nPlayer XP\n`), 'a value on the next line');

// --- line ends, comments and docs

assert.ok(await parses(`> desc\nname: XP`), 'the last line needs no line break');
assert.ok(await parses(`> desc\nname: XP\n# trailing comment`), 'a trailing comment line without a line break');
assert.ok(await parses(`> desc\n\n\n   \nname: XP\n\n`), 'blank lines, some holding spaces');
assert.ok(await parses(`> desc\r\nname: XP\r\n`), 'windows line ends');
assert.ok(await parses(`> desc\n  # indented comment\nname: XP\n`), 'an indented comment line');
assert.ok(!await parses(`> desc\n$x = state # not a comment\n`), 'a comment never follows code');

const docs = await check(`${header}$a = state > same line
$b = state
  > next line
$c = state

  > after a blank line
$d = state > first
  > second
  >   third, trimmed
$e = state > with # inside
`);
assert.equal(variable(docs, 'a').description, 'same line');
assert.equal(variable(docs, 'b').description, 'next line');
assert.equal(variable(docs, 'c').description, 'after a blank line');
assert.equal(variable(docs, 'd').description, 'first\nsecond\nthird, trimmed');
assert.equal(variable(docs, 'e').description, 'with # inside');

// --- '$' definitions: a slot definition or a type alias, one namespace

const defs = await check(`${header}$placed = state > a slot definition
$args = storage bs.x:shared payload/levels: {
  a: int > first operand
}
$block = string > a type alias
$union = #[id="block"] string | {
  id: #[id="block"] string
  properties?: #[as=mcdoc:block_states[[id]]] {}
}
`);
assert.equal(variable(defs, 'placed').declaration.kind, 'state');
assert.equal(variable(defs, 'placed').type, undefined);
const args = variable(defs, 'args').declaration;
assert.equal(args.kind, 'storage');
assert.equal(args.id, 'bs.x:shared');
assert.deepEqual(args.path, ['payload/levels']);
assert.equal(args.type.$type, 'StructType');
assert.equal(args.type.entries[0].description, 'first operand');
assert.equal(variable(defs, 'block').declaration, undefined);
assert.equal(variable(defs, 'block').type.$type, 'PrimitiveType');
const union = variable(defs, 'union').type;
assert.equal(union.$type, 'UnionType');
assert.deepEqual(union.members[0].attributes, ['#[id="block"]']);
assert.equal(union.members[1].entries[1].optional, true);
assert.deepEqual(union.members[1].entries[1].type.attributes, ['#[as=mcdoc:block_states[[id]]]'], 'nested brackets in an attribute');
assert.equal(union.members[1].entries[1].type.entries.length, 0, "'{}' is an empty compound");

// --- features and slots

const feature = (body) => `${header}feature function fill_block > Fill a region.
  authors: Aksiome
  created: 2024/12/30 1.21.4
  updated: 2026/09/19 26.3
${body}`;
const first = async (body) => (await check(feature(body))).features[0];

const f = await first(`  context position > position to place at
  input arguments: {
    block: string
  }
  output $placed
`);
assert.equal(f.registry, 'function');
assert.equal(f.id, 'fill_block');
assert.equal(f.description, 'Fill a region.');
assert.equal(propertyOf(f, 'authors'), 'Aksiome');
assert.deepEqual(slots(f).map(s => s.role), ['context', 'input', 'output']);
assert.equal(slots(f)[0].declaration.kind, 'position');
assert.equal(slots(f)[0].description, 'position to place at');
assert.equal(slots(f)[1].declaration.kind, 'arguments');
assert.equal(slots(f)[2].reference.$refText, 'placed');
assert.ok(!await parses(`${header}feature function a
  $local = state
  output $local
`), "a '$' definition lives in the head, not in a feature");

assert.equal((await first(`  input storage bs.x:shared args: int\n`)).items.at(-1).declaration.id, 'bs.x:shared');
assert.deepEqual((await first(`  input storage in/deep: int\n`)).items.at(-1).declaration.path, ['in/deep'], "'/' belongs to a name");
assert.deepEqual((await first(`  input storage nested.storage.like/so: int\n`)).items.at(-1).declaration.path, ['nested', 'storage', 'like/so'], "'.' separates the segments");
assert.deepEqual((await first(`  input storage function/int.byte: int\n`)).items.at(-1).declaration.path, ['function/int', 'byte'], 'keywords in path segments');
assert.equal((await check(`${header}feature function bs.x:fill > doc\n`)).features[0].id, 'bs.x:fill', 'a namespaced feature id');
assert.equal((await check(`${header}feature function int > doc\n`)).features[0].id, 'int', 'a keyword as a feature id');
assert.equal((await check(`${header}feature function fill\n  > next line doc\n`)).features[0].description, 'next line doc');
assert.deepEqual((await check(`${header}feature function a\nfeature function b\nfeature predicate a\n`)).features.map(f => f.id), ['a', 'b', 'a'], "a feature runs until the next 'feature' line");
assert.ok(!await parses(`${header}feature function a context state > doc\n`), 'a slot needs its own line');
assert.ok(await parses(`${header}feature function a > doc context state\n`), 'a doc swallows its line');
assert.ok(!await parses(`${header}feature function a\n  input $x context state\n`), 'two slots on one line');

// --- types

const typed = async (type) => (await check(`${header}$t = ${type}\n`)).head.at(-1).type;
assert.equal((await typed('int @ 0..15')).range.min, 0);
assert.equal((await typed('int @ 0..15')).range.max, 15);
assert.equal((await typed('int @ 3')).range.value, 3);
assert.equal((await typed('int @ ..3')).range.min, undefined);
assert.equal((await typed('int @ -3..')).range.min, -3);
assert.equal((await typed('double @ 0.5..1.')).range.max, 1, "'1.' is a float");
assert.equal((await typed('double @ .5..')).range.min, 0.5);
assert.equal((await typed('[string]')).tuple, false);
assert.equal((await typed('[string] @ 2..')).range.min, 2);
assert.equal((await typed('[int, string]')).tuple, true);
assert.equal((await typed('[int,]')).elements.length, 1, 'a one element tuple');
assert.equal((await typed('int[]')).$type, 'ArrayType');
assert.equal((await typed('int[] @ 3')).range.value, 3);
assert.equal((await typed('int @ 0..1 [] @ 3')).element.range.max, 1, 'a value range then a size');
assert.deepEqual((await typed('#[x] int[] @ 3')).attributes, ['#[x]'], 'an attribute applies to the array as a whole');
assert.equal((await typed('#[x] int[] @ 3')).range.value, 3);
assert.equal((await typed('player[] | entity')).$type, 'UnionType', 'an executor array in a union');
assert.ok(!await parses(`${header}$t = string[]\n`), "only int, byte, long, entity and player take '[]'");
assert.ok(!await parses(`${header}$t = xyz[]\n`), "'xyz' takes no '[]'");
assert.ok(!await parses(`${header}$t = int[][]\n`), 'arrays do not nest');
assert.equal((await typed('byte @ 0..1 [] @ 3')).element.range.max, 1, 'a numeric element takes a range');
assert.ok(!await parses(`${header}$t = entity @ 1 []\n`), 'an entity element takes no range');
assert.equal((await typed('int | string | boolean')).members.length, 3, 'a flat union');
assert.equal((await typed('$other')).$type, 'ReferenceType');
assert.equal((await typed('#[x] $other')).attributes[0], '#[x]');
assert.equal((await typed('{}')).entries.length, 0);
assert.ok(await parses(`${header}$t = {\n}\n`), 'an empty struct over two lines');
assert.ok(!await parses(`${header}$t = { a: int }\n`), 'a struct is one entry per line');
assert.ok(await parses(`${header}$t = {\n  a: int,\n  b?: int\n}\n`), "mcdoc's trailing comma is accepted");
assert.ok(await parses(`${header}$t = {\n  # comment\n\n  a: int\n  # comment\n}\n`), 'comments and blank lines inside a struct');
assert.ok(await parses(`${header}$t = {\n  function: int\n  storage: int\n  int: int\n}\n`), 'keywords as entry names');
assert.ok(!await parses(`${header}$t = {\n  a:int\n}\n`), 'a colon without a space is a resource location');
assert.ok(await parses(`${header}$t = [{\n  a: int\n}] @ 1..3\n`), 'a struct inside a list');

console.log('ok');
