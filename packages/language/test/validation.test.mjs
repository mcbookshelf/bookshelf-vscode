// The checks worth running while typing: the '$' definitions and their uses, lists and the
// features repeated over them, what a registry takes, what a feature inherits, the kinds and
// their types (Typir), structs and ranges. What the builder decides on its own (the values of
// the head, the stamps, the namespaces, the storages, the folders) is not checked here.
// Run with: npm test --workspace packages/language (after `npm run build`)
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createBsdocServices, expandedNames, listsOf, referencesIn, repetitionsOf, substitute } from '../out/index.js';

const parse = parseHelper(createBsdocServices(EmptyFileSystem).Bsdoc);

// the head gives every feature its authors and its date
const header = `> Read and modify player XP levels.

name XP
slug bookshelf-xp
version 5.0.0
authors Aksiome
since 2022/04/14 1.18.2
`;

// every document needs its own URI
let count = 0;

/** Parses `text` and returns its diagnostics of the given severity, 'line: message'. */
const diagnosticsOf = async (text, severity, path = 'modules/bs.xp/module.bs') => {
    const doc = await parse(text, { validation: true, documentUri: `file:///${count++}/${path}` });
    assert.deepEqual(doc.parseResult.lexerErrors.map(e => e.message), [], text);
    assert.deepEqual(doc.parseResult.parserErrors.map(e => e.message), [], text);
    return (doc.diagnostics ?? []).filter(d => d.severity === severity).map(d => `${d.range.start.line + 1}: ${d.message}`);
};
const errorsOf = (text, path) => diagnosticsOf(text, 1, path);
const warningsOf = (text) => diagnosticsOf(text, 2);

const ok = async (body) => assert.deepEqual(await errorsOf(header + body), [], body);
/** Asserts the one error of `body`, its message and, given, its line in the whole text (the header takes 7 lines). */
const fails = async (body, expected, line) => {
    const errors = await errorsOf(header + body);
    assert.equal(errors.length, 1, `${body}\nexpected 1 error, got: ${JSON.stringify(errors)}`);
    const [, at, message] = /^(\d+): (.*)$/s.exec(errors[0]);
    assert.equal(message, expected, body);
    if (line !== undefined) {
        assert.equal(Number(at), line, `line of: ${expected}`);
    }
};

/** A feature with the given body, one line per line, already indented. */
const feature = (body, registry = 'function', name = 'add_levels') => `feature ${registry} ${name} > Add levels to the player.\n${body}`;

// --- the samples: every file is valid, with no warning either

const samples = new URL('./samples/', import.meta.url);
for (const file of readdirSync(samples).filter(name => name.endsWith('.bs'))) {
    const text = readFileSync(new URL(file, samples), 'utf-8');
    const path = `modules/${file.replace(/\.bs$/, '')}/module.bs`;
    assert.deepEqual([...await diagnosticsOf(text, 1, path), ...await diagnosticsOf(text, 2, path)], [], file);
}

// --- the head: what the builder owns is not checked, but a word needs its value and its place

await ok(`tags Not A Tag\nversion whenever\n` + feature(``, 'function', 'other:x') + feature(``, 'function', '__private'));
assert.deepEqual(await errorsOf(`name XP\n`), [], 'a head may miss properties');
assert.deepEqual(await errorsOf(`name\nauthors\ndeprecated\n`), ["1: 'name' needs a value", "2: 'authors' needs a value"]);
await fails(`$t: int\ntags runtime\n` + feature(`  input storage: $t\n`), "'tags' is written after '$t': the head of the module comes before its '$' definitions", 9);
// contributors are written on features or in pasted lines: in the head, nothing would clear them
await fails(`contributors Leirof\n` + feature(``), "'contributors' is written on features, not in the head", 8);
await ok(`$helped: contributors Leirof\n` + feature(`  $helped\n`) + feature(`  contributors RacoonJohn\n`, 'function', 'other'));
assert.deepEqual(await errorsOf(`> A bundle.\nname All\nslug bookshelf\nversion 5.0.0\ntags runtime\ndocumentation https://docs.mcbookshelf.dev\n`, 'bundle.bs'), []);
assert.equal((await errorsOf(`name All\nweak_dependencies bs.log\nauthors Aksiome\nsince 2022/04/14 1.18.2\n$t[a]\nfeature block_tag a/$t\n`, 'bundle.bs')).length, 5, 'a bundle holds properties and nothing else');

// --- '$' definitions: defined once, used by their shape

await ok(`$block: string > doc\n` + feature(`  input storage: $block\n`));
await ok(`$placed:\n  output state > doc\n` + feature(`  $placed\n`));
await ok(`$position: struct\n  x: int\n` + feature(`  input arguments: $position\n  output storage: [$position]\n  input storage\n    $position\n    y: int\n`));
await fails(`$x: int\n$x: int\n` + feature(`  input storage: $x\n`), "'$x' is already declared on line 8", 9);
await fails(`$x: int\n$x[a, b]\n` + feature(`  input storage: $x\n`), "'$x' is already declared on line 8", 9);
await fails(feature(`  input storage: $nope\n`), "Could not resolve reference to Definition named 'nope'.");
await fails(feature(`  $nope\n`), "Could not resolve reference to Definition named 'nope'.");
// a '$' name in a type is always a type
await fails(`$lines:\n  @position\n` + feature(`  input storage: $lines\n  $lines\n`), "'$lines' is lines, not a type: it is declared on line 8", 11);
await fails(`$list[a, b]\n` + feature(`  input storage: $list\n`, 'function', 'x/$list'), "'$list' is a list, not a type: it is declared on line 8", 10);
// lines are pasted among lines, a struct among fields
await fails(`$t: int\n` + feature(`  $t\n  input storage: $t\n`), "'$t' is a type, not lines: it is declared on line 8", 10);
await fails(`$s: struct\n  x: int\n` + feature(`  $s\n  input storage: $s\n`), "'$s' is a struct, not lines: it is declared on line 8", 11);
await fails(`$lines:\n  @position\n` + feature(`  $lines\n  input storage\n    $lines\n`), "'$lines' is lines, not a struct: it is declared on line 8", 13);
await fails(`$t: int\n` + feature(`  input storage\n    $t\n    x: $t\n`), "'$t' is a type, not a struct: it is declared on line 8", 11);
await ok(`$s: struct > a struct with a doc\n  x: int\n$alias: $s\n` + feature(`  input storage\n    $alias\n`));
await ok(`$a:\n  @position\n$b:\n  $a\n  @rotation\n` + feature(`  $b\n`));
// one line written after a name is lines all the same
await ok(`$updated: output state > doc\n$dated: since 2024/01/01 1.20\n` + feature(`  $dated\n  $updated\n`));
await fails(`$updated: output state > doc\n` + feature(`  input storage: $updated\n  $updated\n`), "'$updated' is lines, not a type: it is declared on line 8", 10);
await fails(`$pos: @position\n` + feature(`  $pos\n`, 'block_tag'), "a block_tag declares no context (pasted from '$pos')", 10);
await fails(`$wrong: @executor: xyz\n` + feature(`  $wrong\n`), "'xyz' is not a type @executor takes", 8);
// the block under a bare '$name:' holds lines: fields go under '$name: struct'
assert.deepEqual(await errorsOf(`${header}$mixed:\n  x: int\n  @position\n  since 2022/04/14 1.18.2\n  y: int\n` + feature(`  $mixed\n`)),
    ["9: a field belongs to a struct: write '$mixed: struct'", "12: a field belongs to a struct: write '$mixed: struct'"]);
// a colon announces a type, and a field always has one
await fails(feature(`  input arguments:\n    a: int\n`), 'a colon announces a type: remove it, the fields under the line need none', 9);
await fails(feature(`  input storage\n    limits:\n      a: int\n`), "'limits' needs a type: write 'struct' for the fields under it", 10);
await ok(feature(`  input storage\n    limits: struct\n      a: int\n  output storage out > a doc\n    b: int\n`));
// cycles, through a type, a field or a paste
assert.deepEqual(await errorsOf(`${header}$a: $b\n$b: $a\n` + feature(`  input storage: $a | $b\n`)),
    ["8: '$a' refers to itself through $a > $b", "9: '$b' refers to itself through $b > $a"]);
await fails(`$a: [$a]\n` + feature(`  input storage: $a\n`), "'$a' refers to itself through $a");
await fails(`$a: struct\n  next?: $a\n` + feature(`  input storage: $a\n`), "'$a' refers to itself through $a");
await fails(`$a:\n  $a\n  @position\n` + feature(`  $a\n`), "'$a' refers to itself through $a");
assert.deepEqual(await warningsOf(`${header}$unused: int\n$used: int\n$idle[a]\n$busy[a]\n` + feature(`  input storage: $used\n`, 'function', 'x/$busy')),
    ["8: '$unused' is never referenced", "10: '$idle' is never referenced"]);

// --- lists: an item and a property are defined once

await ok(`$axis[x]:\n  nth: first\n$axis[y, z]:\n  nth: other\n` + feature(``, 'block_tag', '$axis'));
await fails(`$axis[x, y]\n$axis[y]\n` + feature(``, 'block_tag', '$axis'), "'y' is already an item of '$axis', on line 8", 9);
await fails(`$axis[x, x]\n` + feature(``, 'block_tag', '$axis'), "'x' is already an item of '$axis', on line 8", 8);
await fails(`$axis[x]:\n  nth: first\n  nth: second\n` + feature(``, 'block_tag', '$axis'), "'nth' is already given on line 9", 10);
await fails(`$axis[x]:\n  nth:\n` + feature(``, 'block_tag', '$axis'), "'nth' needs a value", 9);

// --- repetition: a feature with a list in its id exists once per item

const lists = `$axis[x]:\n  side: west\n  only: here\n$axis[y]:\n  side: bottom\n$point[entry, exit]\n$t: int > the type $axis is not replaced here\n`;
await ok(lists + feature(`  since $axis.side\n  @position > the $axis side, $axis.side.\n  input storage: $t > $axis.mcfunction and $axis-aligned\n  input arguments\n    a: int > $axis and $point\n`, 'function', '$point/$axis'));
// a '$word' which is not a list is left as written, in a doc
await ok(lists + feature(`  input storage: $t > costs $5, see $t and $nothing\n`));
await fails(lists + feature(`  input storage: $t\n`, 'function', 'get/$nope'), "'$nope' is not a list", 15);
await fails(lists + feature(`  input storage: $t\n`, 'function', 'get/$t'), "'$t' is not a list", 15);
await fails(lists + feature(`  input storage: $t > the $axis coordinate\n`), "the list '$axis' is not in the id of this feature", 16);
await fails(lists + feature(`  since $axis.side\n  input storage: $t\n`), "the list '$axis' is not in the id of this feature", 16);
await fails(lists + `feature function a/$point > Get the $axis.side side.\n  input storage: $t\n`, "the list '$axis' is not in the id of this feature", 15);
await fails(lists + feature(`  input storage: $t > only $axis.only\n`, 'function', 'get/$axis'), "'$axis.only' is not defined for the item 'y'", 16);
// pasted lines are replaced in the feature which pastes them
const pasted = lists + `$lines:\n  @position > the $axis side\n`;
await ok(pasted + feature(`  $lines\n  input storage: $t\n`, 'function', 'get/$axis'));
await fails(pasted + feature(`  $lines\n  input storage: $t\n`), "'$lines' uses the list '$axis', which is not in the id of this feature", 18);
// two features with the same registry and name are an error, repeated or not
await ok(lists + feature(`  input storage: $t\n`, 'function', 'get/$axis') + feature(`  output success\n`, 'predicate', 'get/$axis') + feature(``, 'function', 'get/z'));
await fails(feature(``) + feature(``), "'function add_levels' is already declared on line 8", 9);
await fails(feature(``) + feature(``, 'function', 'bs.xp:add_levels'), "'function add_levels' is already declared on line 8", 9);
await fails(lists + feature(`  input storage: $t\n`, 'function', 'get/$axis') + feature(``, 'function', 'get/y'), "'function get/y' is already declared on line 15", 17);
await fails(lists + feature(`  input storage: $t\n`, 'function', '$axis/$point') + feature(``, 'function', '$axis/exit'), "'function x/exit' is already declared on line 15", 17);

// what a text holds, and what a repeated feature becomes
const repeated = (await parse(`$spline[bezier]:\n  name: Bézier spline\n$spline[linear]:\n  name: linear spline\n$order[a]\n$order3[b]\n$axis[x, y, z]\n$point[entry, exit]\n`
    + `feature context_float_provider $point/$axis/$point > The $axis coordinate where the ray $point.verb a $spline.name.\n`, { documentUri: `file:///${count++}/modules/bs.x/module.bs` })).parseResult.value;
const repeatedLists = listsOf(repeated);
const found = (text) => referencesIn(text, repeatedLists).map(r => text.slice(r.offset, r.offset + r.length) + (r.list ? '' : '?'));
assert.deepEqual(found('a $spline.name. Then $spline.mcfunction'), ['$spline.name', '$spline'], "'.key' is read only when 'key' is a property of the list");
assert.deepEqual(found('$order and $order3'), ['$order', '$order3'], 'a name runs as far as letters, digits and _ go');
assert.deepEqual(found('$axis-aligned, $axis_aligned'), ['$axis', '$axis_aligned?'], "a '$' name holds no '-'");
assert.deepEqual(found('costs $5, see $nothing'), ['$nothing?'], 'not a list: left as written');
assert.deepEqual(expandedNames(repeated.features[0]), ['entry/x/entry', 'entry/y/entry', 'entry/z/entry', 'exit/x/exit', 'exit/y/exit', 'exit/z/exit'],
    'the leftmost list changes last, and a list written twice stands for the same item');
const [first] = repetitionsOf(repeated.features[0]);
assert.equal(substitute('the $axis of a $spline.name, $point.verb', repeatedLists, new Map([...first, [repeatedLists.get('spline'), repeatedLists.get('spline').items.get('bezier')]])),
    'the x of a Bézier spline, entry.verb', 'a dot which opens no property of the list is text');

// --- inheritance: the head, then the pasted lines, then the lines of the feature

const bare = `> doc\n\nname XP\n`;
assert.deepEqual(await errorsOf(bare + feature(``)), [
    "4: 'authors' is missing: write it in the feature, in the lines it pastes or in the head of the module",
    "4: 'since' is missing: write it in the feature, in the lines it pastes or in the head of the module",
]);
assert.deepEqual(await errorsOf(bare + `authors Aksiome\n$lines:\n  since 2022/04/14 1.18.2\n$more:\n  $lines\n` + feature(`  $more\n`)), [], 'through the head and the pasted lines');
assert.deepEqual(await errorsOf(bare + feature(`  authors Aksiome\n  since 2022/04/14 1.18.2\n`)), [], 'in the feature');

// --- lines: what a registry accepts

await ok(feature(`  @executor: entity\n  @position\n  @rotation\n  @dimension\n  @state\n  input storage: int\n  input state\n  output storage: int\n  output state\n  output result\n  output success\n`));
await ok(feature(`  input arguments\n    a: int\n  input storage\n    b: int\n`));
await fails(feature(`  output macro\n    a: int\n`), 'a function takes no macro as output, only result, success, storage or state');
await fails(feature(`  input result\n`), 'a function takes no result as input, only arguments, macro, storage or state', 9);
await fails(feature(`  input macro\n    a: int\n  output success\n`, 'predicate'), 'a predicate takes no macro as input, only storage or state');
await fails(feature(`  output success\n  output result\n`, 'predicate'), 'a predicate takes no result as output, only success', 10);
await fails(feature(`  output success\n`, 'loot_table'), 'a loot_table takes no success as output, only state');
await fails(feature(`  output result\n  output state\n`, 'context_int_provider'), 'a context_int_provider takes no state as output, only result');
assert.deepEqual(await errorsOf(header + feature(`  @state\n  input state\n  output state\n`, 'block_tag')),
    ['9: a block_tag declares no context', '10: a block_tag declares no input', '11: a block_tag declares no output']);
await fails(feature(`  @position\n`, 'entity_type_tag'), 'an entity_type_tag declares no context');
await fails(feature(`  output success\n`, 'structure'), 'a structure declares no output');
await ok(feature(`  authors Leirof\n  deprecated\n`, 'structure'));
// a pasted line is checked all the same, and reported where it is pasted
await fails(`$pos:\n  @position\n` + feature(`  $pos\n`, 'block_tag'), "a block_tag declares no context (pasted from '$pos')", 11);
// an output a registry cannot go without
await fails(feature(``, 'predicate'), "a predicate needs an 'output success'", 8);
await fails(feature(``, 'context_float_provider'), "a context_float_provider needs an 'output result'", 8);
await ok(`$r:\n  output result: float\n` + feature(`  $r\n`, 'context_float_provider'));
// one macro form
await fails(feature(`  input macro\n    a: int\n  input arguments\n    a: int\n`), "a feature takes one macro form: 'input arguments' and 'input macro' cannot both be declared", 11);
await fails(`$args:\n  input arguments\n    a: int\n` + feature(`  input macro\n    a: int\n  $args\n`), "a feature takes one macro form: 'input arguments' and 'input macro' cannot both be declared (pasted from '$args')", 14);

// --- kinds and their types

await fails(feature(`  @state: int\n`), 'a state carries no type');
await fails(feature(`  input state: int\n`), 'a state carries no type');
await fails(feature(`  output success: int\n`), 'a success carries no type, it is always 0 or 1');
await fails(feature(`  output state\n    a: int\n`), 'a state carries no type');
await fails(feature(`  input storage\n`), "'storage' needs a type");
await fails(feature(`  input macro\n`), "'macro' needs a type");
await fails(feature(`  input arguments\n`), "'arguments' needs a type");
await ok(feature(`  @executor: player\n  @executor: entity[]\n  @executor: player | entity\n  @executor: player[] | entity\n`));
await fails(feature(`  @executor: xyz\n`), "'xyz' is not a type @executor takes");
await fails(feature(`  @executor: [player]\n`), "'[player]' is not a type @executor takes");
await ok(feature(`  @position: xyz | entity\n  @position: player\n`));
await fails(feature(`  @position: xy\n`), "'xy' is not a type @position takes");
await fails(feature(`  @position: int\n`), "'int' is not a type @position takes");
await ok(feature(`  @rotation: xy | player\n`));
await fails(feature(`  @rotation: xyz\n`), "'xyz' is not a type @rotation takes");
await ok(feature(`  @dimension: overworld | nether | end | any\n`));
await fails(feature(`  @dimension: entity\n`), "'entity' is not a type @dimension takes");
await ok(`$pos: xyz | entity\n` + feature(`  @position: $pos\n`));
await ok(feature(`  output result: int @ 0..15\n`));
await fails(feature(`  output result: float\n`), "'float' is not a type this result takes, it is an int");
await fails(feature(`  output result\n    a: int\n`), 'a struct is not a type this result takes, it is an int');
await ok(feature(`  output result: float @ 0..1\n`, 'context_float_provider'));
await fails(feature(`  output result: int\n`, 'context_float_provider'), "'int' is not a type this result takes, it is a float");
// lines alone take either, the registry is only known where they are pasted
await fails(`$r:\n  output result: float\n` + feature(`  $r\n`), "'float' is not a type this result takes, it is an int (pasted from '$r')", 11);
await fails(`$r:\n  output result: string\n` + feature(`  $r\n`, 'context_int_provider'), "'string' is not a type this result takes, it is an int or float", 9);
await fails(feature(`  input macro: int\n`), "'int' is not a type a macro takes, it needs a struct");
await fails(feature(`  input arguments: [int]\n`), "'[int]' is not a type arguments take, they need a struct");
await fails(feature(`  input arguments: [struct]\n    a: int\n`), "'[struct]' is not a type arguments take, they need a struct");
await ok(feature(`  input arguments: struct\n    a: int\n`));
await ok(`$s: struct\n  a: int\n$alias: $s\n` + feature(`  input macro: $alias\n`));

// --- data types

await ok(feature(`  input storage\n    a: int @ 0..1\n    b: [string] @ 2..\n    c: [int, string]\n    d: byte[] @ 3\n    e: struct\n    f: int | string\n    g: number\n    h: any\n`));
await fails(feature(`  input storage: player\n`), "'player' is not a data type");
await fails(feature(`  input storage\n    a: struct\n      b: [xyz]\n`), "'xyz' is not a data type", 11);
await fails(feature(`  input storage: player[]\n`), "'player' is not a data type");
await fails(feature(`  input storage\n    a: entity[]\n`), "'entity' is not a data type");
await fails(feature(`  input macro\n    a: entity\n`), "'entity' is not a data type");
await fails(feature(`  input arguments\n    a: nether\n`), "'nether' is not a data type");
await fails(`$s: struct\n  a: xy\n` + feature(`  input storage: $s\n`), "'xy' is not a data type", 9);
// an error through a '$' name is reported where the name is misused, it may be fine elsewhere
await fails(`$pos: xyz\n` + feature(`  @position: $pos\n  input storage: $pos\n`), "'xyz' is not a data type", 11);

// --- structs: one 'struct' on a line, for the fields under it

await ok(feature(`  input storage: [struct] @ 2..\n    a: int\n  output storage: struct | number\n    b: int\n`));
await fails(feature(`  input storage\n    a:\n`), "'a' needs a type", 10);
await fails(feature(`  input storage: [int]\n    a: int\n`), "these fields belong to no struct: '[int]' holds none", 9);
await fails(feature(`  input storage\n    a: int\n      b: int\n`), "these fields belong to no struct: 'int' holds none", 10);
await fails(`$t: int\n  a: int\n` + feature(`  input storage: $t\n`), "these fields belong to no struct: 'int' holds none", 8);
await fails(feature(`  input storage: [struct, struct]\n    a: int\n`), "a line has one 'struct', since one block of fields follows it: name the others with '$'", 9);
await fails(feature(`  input storage\n    p: int\n    q: int\n    p: boolean\n`), "'p' is already declared on line 10", 12);
await fails(`$t: struct\n  p: int\n  q: int\n  p: boolean\n` + feature(`  input storage: $t\n`), "'p' is already declared on line 9", 11);

// --- ranges

await fails(`$t: int @ 3..2\n` + feature(`  input storage: $t\n`), 'the minimum 3 is greater than the maximum 2');
await fails(`$t: float @ 5.2..1.5\n` + feature(`  input storage: $t\n`), 'the minimum 5.2 is greater than the maximum 1.5');
await fails(`$t: int @ 1.5\n` + feature(`  input storage: $t\n`), 'a bound must be a whole number, not 1.5');
await fails(`$t: int[] @ 1.5\n` + feature(`  input storage: $t\n`), 'a bound must be a whole number, not 1.5');
await fails(`$t: [int] @ 0.5..\n` + feature(`  input storage: $t\n`), 'a bound must be a whole number, not 0.5');
await fails(`$t: string @ 1.5\n` + feature(`  input storage: $t\n`), 'a bound must be a whole number, not 1.5');
await ok(`$t: float @ .5..1.\n` + feature(`  input storage: $t\n`));
await ok(`$t: double @ 1.5..5.2\n` + feature(`  input storage: $t\n`));
await ok(`$t: number @ 0<..<5.2\n` + feature(`  input storage: $t\n`));

// --- indentation: two spaces per level, reported with the other errors

const indented = await parse(header + feature(`  input storage\n      a: int\n`), { validation: true, documentUri: `file:///${count++}/modules/bs.xp/module.bs` });
assert.deepEqual(indented.diagnostics.map(d => `${d.range.start.line + 1}: ${d.message}`), ['10: a block is indented by 2 spaces, not 4']);

console.log('ok');
