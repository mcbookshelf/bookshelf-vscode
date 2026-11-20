// Run with: npm test --workspace packages/language  (requires a prior `npm run build`)
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createBsdocServices } from '../out/index.js';

const parse = parseHelper(createBsdocServices(EmptyFileSystem).Bsdoc);

let count = 0;
const uri = (path = 'modules/bs.x/module.bs') => `file:///${count++}/${path}`;

/** The lexer and parser errors of a document, the indentation ones included. */
const errorsOf = (doc) => [...doc.parseResult.lexerErrors, ...doc.parseResult.lexerReport.diagnostics, ...doc.parseResult.parserErrors].map(e => e.message);
const check = async (text, path) => {
    const doc = await parse(text, { documentUri: uri(path) });
    assert.deepEqual(errorsOf(doc), [], text);
    return doc.parseResult.value;
};
const parses = async (text) => errorsOf(await parse(text, { documentUri: uri() })).length === 0;
const indentationErrors = async (text) => (await parse(text, { documentUri: uri() })).parseResult.lexerReport.diagnostics.map(e => `${e.line}: ${e.message}`);

const propertyOf = (module, key) => module.head.findLast(item => item.$type === 'Property' && item.key === key)?.value;
const metadataOf = (node, key) => (node.head ?? node.body).findLast(item => item.$type === 'Metadata' && item.key === key);
const definition = (module, name) => module.head.find(item => item.$type === 'Definition' && item.name === name);
const types = (items) => items.map(item => item.$type);

const header = `> Read and modify player XP levels.

name XP
slug bookshelf-xp
version 5.0.0
`;

// --- the samples: every file parses

const samples = new URL('./samples/', import.meta.url);
for (const file of readdirSync(samples).filter(name => name.endsWith('.bs'))) {
    const module = await check(readFileSync(new URL(file, samples), 'utf-8'), `modules/${file.replace(/\.bs$/, '')}/module.bs`);
    assert.ok(module.head.length > 0, file);
}

// --- the head: the doc of the module, then a word and its value

assert.equal((await check(`> desc\n`)).description, 'desc');
assert.equal((await check(`# a comment\n\n> desc\n`)).description, 'desc', 'comment and blank lines before the description');
assert.equal((await check(`\n> desc\n`)).description, 'desc', 'a leading blank line');
assert.equal((await check(`  # an indented comment\n> desc\n`)).description, 'desc', 'an indented comment opens no block');
assert.equal((await check(``)).description, undefined, 'an empty file');
assert.equal((await check(`name XP\n`)).description, undefined, 'no description');

const loose = await check(`${header}tags runtime, datapack-only
weak_dependencies bs.log, bs.block
documentation https://docs.mcbookshelf.dev/en/latest/modules/xp.html
name input storage: struct > 1..2, and "quotes" too! # not a comment
`);
assert.equal(propertyOf(loose, 'tags'), 'runtime, datapack-only');
assert.equal(propertyOf(loose, 'weak_dependencies'), 'bs.log, bs.block');
assert.equal(propertyOf(loose, 'documentation'), 'https://docs.mcbookshelf.dev/en/latest/modules/xp.html');
assert.equal(propertyOf(loose, 'name'), 'input storage: struct > 1..2, and "quotes" too! # not a comment', 'free text holds anything');
assert.equal(propertyOf(await check(`name    Player XP   \n`), 'name'), 'Player XP', 'surrounding whitespace is not part of the value');
assert.equal(propertyOf(await check(`name\n`), 'name'), undefined, 'a missing value parses, validation reports it');
assert.ok(!await parses(`name\nPlayer XP\n`), 'a value on the next line');
assert.ok(!await parses(`licence MIT\n`), 'the words of the head are the ones of the language');
assert.ok(!await parses(`name: XP\n`), 'the old syntax, with a colon');

const stamped = await check(`${header}authors Aksiome, Leirof
contributors theogiraudet
since 2022/04/14 1.18.2
deprecated
experimental
`);
assert.equal(metadataOf(stamped, 'authors').value, 'Aksiome, Leirof');
assert.equal(metadataOf(stamped, 'contributors').value, 'theogiraudet');
assert.equal(metadataOf(stamped, 'since').value, '2022/04/14 1.18.2');
assert.equal(metadataOf(stamped, 'deprecated').value, undefined);
assert.ok(metadataOf(stamped, 'experimental'));
assert.ok(!await parses(`deprecated true\n`), "'deprecated' takes no value");

// --- line ends, comments and docs

assert.ok(await parses(`> desc\nname XP`), 'the last line needs no line break');
assert.ok(await parses(`> desc\nname XP\n# trailing comment`), 'a trailing comment line without a line break');
assert.ok(await parses(`> desc\n\n\n   \nname XP\n\n`), 'blank lines, some holding spaces');
assert.ok(await parses(`> desc\r\nname XP\r\nfeature function a\r\n  since 2022/04/14 1.18.2\r\n  input arguments\r\n    a: int\r\n`), 'windows line ends');
assert.ok(await parses(`> desc\n  # indented comment\nname XP\n`), 'an indented comment line');
assert.ok(await parses(`${header}feature function a\n  @position\n      # a comment deeper than the block\n  @rotation\n# and one less deep\n  @dimension\n`), 'a comment opens and closes no block');
assert.ok(await parses(`${header}feature function a\n  input arguments\n    a: int`), 'the blocks left open at the end of the file are closed');
assert.ok(!await parses(`> desc\n$x: int # not a comment\n`), 'a comment never follows code');

// a doc is written at the end of its line, on the next line, or as the first line of the block
const docs = await check(`${header}$a: int > same line
$b: int
> next line
$c: int

> after a blank line
$d: int > first
  > second
  >   third, trimmed
$e: int > with # inside
$f: struct
  > the first line of the block
  x: int
$g: struct > on the line

  > and again as the first line of the block: one doc
  x: int
$h: int > a paragraph
>
> and another
$lines:
  > lines take their doc as the first line of their block
  @position
`);
assert.equal(definition(docs, 'a').description, 'same line');
assert.equal(definition(docs, 'b').description, 'next line');
assert.equal(definition(docs, 'c').description, 'after a blank line');
assert.equal(definition(docs, 'd').description, 'first\nsecond\nthird, trimmed');
assert.equal(definition(docs, 'e').description, 'with # inside');
assert.equal(definition(docs, 'f').description, 'the first line of the block');
assert.equal(definition(docs, 'f').body.length, 1);
assert.equal(definition(docs, 'g').description, 'on the line\nand again as the first line of the block: one doc');
assert.equal(definition(docs, 'h').description, 'a paragraph\n\nand another', "a '>' alone makes a new paragraph");
assert.equal(definition(docs, 'lines').description, 'lines take their doc as the first line of their block');
assert.ok(!await parses(`${header}$a: int\n  > a doc is not a block: this line has none\n`), 'an indented doc needs a block');
assert.ok(!await parses(`${header}$lines: > doc\n  @position\n`), 'lines have no type to follow the colon');

// --- '$' definitions: a type, a struct, lines or a list, one namespace

const defs = await check(`${header}$block: #[id="block"] string > a type
$union: #[id="block"] string | struct > a type holding a struct
  id: #[id="block"] string
  properties?: #[as=mcdoc:block_states[[id]]] struct
$position: struct
  x: int > a struct
  y: int
  z: int
$ray:
  contributors Bafy78
  @position > lines
  input arguments
    max_distance?: number
  output success
  $more
$more:
  @rotation
$face[bottom, east, north, south, top, west]
$flag[1, 2, 4, 8]
$axis[x]:
  nth: first
  since: 2025/01/25 1.21.4
$axis[y, z]:
  nth: another, with a colon: and a > too
`);
assert.equal(definition(defs, 'block').type.$type, 'PrimitiveType');
assert.equal(definition(defs, 'block').description, 'a type');
const union = definition(defs, 'union');
assert.equal(union.type.$type, 'UnionType');
assert.deepEqual(union.type.members[0].attributes, ['#[id="block"]']);
assert.equal(union.type.members[1].$type, 'StructType');
assert.deepEqual(types(union.body), ['Field', 'Field']);
assert.equal(union.body[1].optional, true);
assert.deepEqual(union.body[1].type.attributes, ['#[as=mcdoc:block_states[[id]]]'], 'nested brackets in an attribute');
assert.equal(definition(defs, 'position').type.$type, 'StructType');
assert.deepEqual(definition(defs, 'position').body.map(field => field.name), ['x', 'y', 'z']);
assert.equal(definition(defs, 'position').body[0].description, 'a struct');
assert.deepEqual(types(definition(defs, 'ray').body), ['Metadata', 'Context', 'Slot', 'Slot', 'Paste']);
assert.equal(definition(defs, 'ray').body[4].reference.$refText, 'more');
assert.equal(definition(defs, 'face').list, true);
assert.deepEqual(definition(defs, 'face').items, ['bottom', 'east', 'north', 'south', 'top', 'west']);
assert.deepEqual(definition(defs, 'flag').items, ['1', '2', '4', '8'], 'numbers as items');
assert.deepEqual(definition(defs, 'axis').properties.map(p => [p.key, p.value]), [['nth', 'first'], ['since', '2025/01/25 1.21.4']], 'a language word as a key');
const yz = defs.head.filter(item => item.name === 'axis')[1];
assert.deepEqual(yz.items, ['y', 'z'], 'a definition can name several items');
assert.equal(yz.properties[0].value, 'another, with a colon: and a > too', 'the text of a property runs to the end of the line');
assert.deepEqual((await check(`${header}$word[since, input, struct, int, end]\n`)).head.at(-1).items, ['since', 'input', 'struct', 'int', 'end'], 'language words as items');
assert.ok(!await parses(`${header}$x:\n`), "'$x:' needs a type or a block");
assert.ok(!await parses(`${header}$x[a]:\n`), "'$x[a]:' needs properties");
assert.ok(!await parses(`${header}$x[]\n`), 'a list needs an item');
assert.ok(!await parses(`${header}$x = int\n`), 'the old syntax, with an equals sign');
assert.ok(!await parses(`${header}$axis-aligned: int\n`), "a '$' name holds no '-'");
assert.equal((await check(`${header}$dimension: [overworld, nether, end]\n`)).head.at(-1).type.tuple, true, 'after a colon comes a type: this is a tuple, not a list');

// one line can follow the name of a definition directly: no line starts like a type
const inline = await check(`${header}$updated: output state > the bar is updated
$viewer: @executor: player > who looks
$dated: since 2024/01/01 1.20
$flagged: deprecated
$operands: input storage bs.x:shared in > the operands
  a: int
$alias: $viewer
$input: int
`);
assert.deepEqual(types(definition(inline, 'updated').body), ['Slot']);
assert.equal(definition(inline, 'updated').body[0].description, 'the bar is updated');
assert.equal(definition(inline, 'updated').description, undefined, 'the doc is the one of the line');
assert.equal(definition(inline, 'viewer').body[0].kind, '@executor');
assert.equal(definition(inline, 'viewer').body[0].type.name, 'player');
assert.equal(definition(inline, 'dated').body[0].value, '2024/01/01 1.20');
assert.equal(definition(inline, 'flagged').body[0].key, 'deprecated');
assert.equal(definition(inline, 'operands').body[0].id, 'bs.x:shared');
assert.deepEqual(definition(inline, 'operands').body[0].body.map(field => field.name), ['a']);
assert.equal(definition(inline, 'alias').type.$type, 'ReferenceType', "a paste aside: '$a: $b' is a type");
assert.equal(definition(inline, 'input').type.name, 'int', 'a name is not a line');
assert.ok(!await parses(`${header}$two: @position @rotation\n`), 'one line only');

// --- features and their lines

const feature = (body) => `${header}feature function fill_block > Fill a region.
  authors Aksiome
  since 2024/12/30 1.21.4
${body}`;
const first = async (body) => (await check(feature(body))).features[0];

const f = await first(`  @position > position to place at
  @executor: player[]
  @state
  input arguments
    block: string
  input state > something read
  output result: int @ 0..
  output success
  $placed
`);
assert.equal(f.registry, 'function');
assert.equal(f.id, 'fill_block');
assert.equal(f.description, 'Fill a region.');
assert.equal(metadataOf(f, 'authors').value, 'Aksiome');
assert.deepEqual(types(f.body), ['Metadata', 'Metadata', 'Context', 'Context', 'Context', 'Slot', 'Slot', 'Slot', 'Slot', 'Paste']);
assert.equal(f.body[2].kind, '@position');
assert.equal(f.body[2].description, 'position to place at');
assert.equal(f.body[3].type.$type, 'ArrayType');
assert.deepEqual([f.body[5].role, f.body[5].kind, f.body[5].type], ['input', 'arguments', undefined]);
assert.deepEqual(f.body[5].body.map(field => field.name), ['block']);
assert.equal(f.body[6].description, 'something read');
assert.equal(f.body[7].type.range.min, 0);
assert.equal(f.body[9].reference.$refText, 'placed');
assert.ok(!await parses(`${header}feature function a\n  $local: int\n`), "a '$' definition lives before the features, not in one");
assert.ok(!await parses(`${header}feature function a\n  context position\n`), "the old syntax, with 'context'");
assert.ok(!await parses(`${header}feature function a\n  updated 2026/09/19 26.3\n`), "'updated' is not written");

const storage = async (line) => (await first(`  ${line}\n`)).body.at(-1);
assert.equal((await storage('input storage bs.x:shared args: int')).id, 'bs.x:shared');
assert.equal((await storage('input storage bs.x:shared args: int')).path, 'args');
assert.equal((await storage('output storage bs.example:data some/path: int > where the value goes')).path, 'some/path');
assert.equal((await storage('input storage in/deep: int')).path, 'in/deep');
assert.equal((await storage('input storage function/int/since: int')).path, 'function/int/since', 'language words in a path');
assert.equal((await storage('input storage: int')).path, undefined);
assert.equal((await storage('output storage levels: int')).id, undefined, 'a name and a colon are not a resource location');
assert.equal((await check(`${header}feature function bs.x:fill > doc\n`)).features[0].id, 'bs.x:fill', 'a namespaced feature id');
assert.equal((await check(`${header}feature function int > doc\n`)).features[0].id, 'int', 'a language word as a feature id');
assert.equal((await check(`${header}feature predicate get_entity/living > doc\n`)).features[0].id, 'get_entity/living', 'a path as a feature id');
assert.equal((await check(`${header}feature predicate flag/1 > doc\n`)).features[0].id, 'flag/1', 'a number as a path segment');
assert.equal((await check(`${header}feature context_float_provider $point/$axis > doc\n`)).features[0].id, '$point/$axis', 'lists as path segments');
assert.equal((await check(`${header}feature function fill\n  > doc as the first line of the block\n  since 2024/12/30 1.21.4\n`)).features[0].description, 'doc as the first line of the block');
assert.equal((await check(`${header}feature function fill\n> doc on the next line\n  since 2024/12/30 1.21.4\n`)).features[0].body.length, 1);
assert.equal((await check(`${header}feature function fill\n  > a doc and nothing else\n`)).features[0].description, 'a doc and nothing else');
assert.deepEqual((await check(`${header}feature function a\nfeature function b\nfeature predicate a\n`)).features.map(f => f.id), ['a', 'b', 'a']);
assert.ok(!await parses(`${header}feature function a @state > doc\n`), 'a line needs its own line');
assert.ok(await parses(`${header}feature function a > doc @state\n`), 'a doc swallows its line');
assert.ok(!await parses(`${header}feature function_tag a\n`), 'a function tag is not a registry');

// --- a language word is a name wherever a colon follows it

const words = await check(`${header}$words: struct
  since: int
  since?: int
  input: int
  output: struct
    storage: int
  name: string
  authors: string
  deprecated: boolean
  feature: int
  struct: struct
  1: int
$lines:
  since 2022/04/14 1.18.2
  input storage: int
  deprecated
`);
assert.deepEqual(types(definition(words, 'words').body), new Array(10).fill('Field'));
assert.deepEqual(definition(words, 'words').body.map(field => field.name), ['since', 'since', 'input', 'output', 'name', 'authors', 'deprecated', 'feature', 'struct', '1']);
assert.deepEqual(types(definition(words, 'lines').body), ['Metadata', 'Slot', 'Metadata']);
// a field under a bare '$name:' parses: validation asks for '$name: struct'
assert.deepEqual(types(definition(await check(`${header}$mixed:\n  since: int\n  since 2022/04/14 1.18.2\n`), 'mixed').body), ['Field', 'Metadata']);

// --- structs: fields indented under a line, 'struct' when something else is on the line

const structs = (await first(`  input arguments
    run: string > command to run at each point
    limits: struct
      batch?: int @ 1.. > blocks placed each tick
    region: struct > region to fill
      from: $position
      to: $position
    points: [struct] @ 2.. > points of the path, in order
      at: $position
      wait?: int @ 0..
    speed: struct | number > blocks per tick
      min: number
      max: number
    empty: struct
    $position
`)).body.at(-1).body;
assert.deepEqual(types(structs), ['Field', 'Field', 'Field', 'Field', 'Field', 'Field', 'Paste']);
assert.equal(structs[1].type.$type, 'StructType');
assert.equal(structs[1].body[0].optional, true);
assert.equal(structs[2].type.$type, 'StructType');
assert.equal(structs[2].description, 'region to fill');
assert.equal(structs[2].body[0].type.$type, 'ReferenceType');
assert.equal(structs[3].type.$type, 'ListType');
assert.equal(structs[3].type.range.min, 2);
assert.equal(structs[3].body.length, 2);
assert.equal(structs[4].type.$type, 'UnionType');
assert.equal(structs[5].body.length, 0, "'struct' with no field under it is an empty struct");

// --- indentation: two spaces per level, no tabs

assert.deepEqual(await indentationErrors(feature(`  input arguments\n      a: int\n`)), ['10: a block is indented by 2 spaces, not 4']);
assert.deepEqual(await indentationErrors(feature(`  input arguments\n   a: int\n`)), ['10: a block is indented by 2 spaces, not 1']);
assert.deepEqual(await indentationErrors(feature(`  input arguments\n\ta: int\n`)), ['10: a line is indented with spaces, not tabs']);
assert.deepEqual(await indentationErrors(feature(`  input arguments\n    a: int\n   b: int\n`)), ['11: a line is indented like the block it belongs to, this one like none']);
assert.deepEqual(await indentationErrors(feature(`  input arguments\n    a: struct\n      b: int\n  output success\n`)), [], 'a line may close several blocks');

// --- types

const typed = async (type) => (await check(`${header}$t: ${type}\n`)).head.at(-1).type;
assert.equal((await typed('int @ 0..15')).range.min, 0);
assert.equal((await typed('int @ 0..15')).range.max, 15);
assert.equal((await typed('int @ 3')).range.value, 3);
assert.equal((await typed('int @ ..3')).range.min, undefined);
assert.equal((await typed('int @ -3..')).range.min, -3);
assert.equal((await typed('double @ 0.5..1.')).range.max, 1, "'1.' is a float");
assert.equal((await typed('double @ .5..')).range.min, 0.5);
// a '<' on a side excludes that bound
assert.deepEqual(await typed('number @ 0<..1').then(t => [t.range.min, t.range.operator, t.range.max]), [0, '<..', 1]);
assert.deepEqual(await typed('number @ 0..<1').then(t => [t.range.min, t.range.operator, t.range.max]), [0, '..<', 1]);
assert.deepEqual(await typed('number @ 0<..<1').then(t => [t.range.min, t.range.operator, t.range.max]), [0, '<..<', 1]);
assert.deepEqual(await typed('number @ 0<..').then(t => [t.range.min, t.range.operator, t.range.max]), [0, '<..', undefined]);
assert.deepEqual(await typed('number @ ..<1').then(t => [t.range.min, t.range.operator, t.range.max]), [undefined, '..<', 1]);
assert.ok(!await parses(`${header}$t: number @ 0..<\n`), "'..<' needs a maximum");
assert.ok(!await parses(`${header}$t: number @ <..1\n`), "'<..' needs a minimum");
assert.equal((await typed('[string]')).tuple, false);
assert.equal((await typed('[string] @ 2..')).range.min, 2);
assert.equal((await typed('[[number] @ 1..3] @ 2..')).elements[0].range.max, 3, 'a list of lists');
assert.equal((await typed('[int, string]')).tuple, true);
assert.equal((await typed('[int,]')).elements.length, 1, 'a one element tuple');
assert.equal((await typed('int[]')).$type, 'ArrayType');
assert.equal((await typed('int[] @ 3')).range.value, 3);
assert.equal((await typed('int @ 0..1 [] @ 3')).element.range.max, 1, 'a value range then a size');
assert.deepEqual((await typed('#[x] int[] @ 3')).attributes, ['#[x]'], 'an attribute applies to the array as a whole');
assert.equal((await typed('player[] | entity')).$type, 'UnionType', 'an executor array in a union');
assert.ok(!await parses(`${header}$t: string[]\n`), "only int, byte, long, entity and player take '[]'");
assert.ok(!await parses(`${header}$t: xyz[]\n`), "'xyz' takes no '[]'");
assert.ok(!await parses(`${header}$t: int[][]\n`), 'arrays do not nest');
assert.ok(!await parses(`${header}$t: entity @ 1 []\n`), 'an entity element takes no range');
assert.equal((await typed('int | string | boolean')).members.length, 3, 'a flat union');
assert.equal((await typed('$other')).$type, 'ReferenceType');
assert.equal((await typed('#[x] $other')).attributes[0], '#[x]');
assert.equal((await typed('struct')).$type, 'StructType');
assert.deepEqual((await typed('#[x] struct')).attributes, ['#[x]']);
assert.equal((await typed('#[match_regex="^(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[dst])?$"] string | int')).members.length, 2, 'an attribute holding brackets');
assert.ok(!await parses(`${header}$t: {\n  a: int\n}\n`), 'the old syntax, with braces');

console.log('ok');
