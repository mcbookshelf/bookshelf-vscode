// The checks worth running while typing: the '$' definitions and their uses, what a registry
// takes, the kinds and their types (Typir), structs and ranges. What the builder decides on its
// own (the head properties, the stamps, the namespaces, the storages) is not checked here.
// Run with: npm test --workspace packages/language (after `npm run build`)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createBsdocServices } from '../out/index.js';

const parse = parseHelper(createBsdocServices(EmptyFileSystem).Bsdoc);

const header = `> Read and modify player XP levels.

name: XP
slug: bookshelf-xp
version: 5.0.0
`;

// every document needs its own URI
let count = 0;

/** Parses `text` and returns its diagnostics of the given severity, 'line: message'. */
const diagnosticsOf = async (text, severity) => {
    const doc = await parse(text, { validation: true, documentUri: `file:///${count++}/modules/bs.xp/module.bs` });
    assert.deepEqual(doc.parseResult.lexerErrors.map(e => e.message), [], text);
    assert.deepEqual(doc.parseResult.parserErrors.map(e => e.message), [], text);
    return (doc.diagnostics ?? []).filter(d => d.severity === severity).map(d => `${d.range.start.line + 1}: ${d.message}`);
};
const errorsOf = (text) => diagnosticsOf(text, 1);
const warningsOf = (text) => diagnosticsOf(text, 2);

const ok = async (body) => assert.deepEqual(await errorsOf(header + body), [], body);
/** Asserts the one error of `body`, its message and, given, its line in the whole text (the header takes 5 lines). */
const fails = async (body, expected, line) => {
    const errors = await errorsOf(header + body);
    assert.equal(errors.length, 1, `${body}\nexpected 1 error, got: ${JSON.stringify(errors)}`);
    const [, at, message] = /^(\d+): (.*)$/s.exec(errors[0]);
    assert.equal(message, expected, body);
    if (line !== undefined) {
        assert.equal(Number(at), line, `line of: ${expected}`);
    }
};

/** A feature with the given body, one construct per line, already indented. */
const feature = (body, registry = 'function', name = 'add_levels') => `feature ${registry} ${name} > Add levels to the player.
  authors: Aksiome
  created: 2022/11/14 1.18.2
  updated: 2026/11/19 26.3
${body}`;

// --- what the builder owns is not checked: any head, any property, any id, any stamp

await ok(`licence: MIT\ndescription: free\ntags: Not A Tag\n` + feature(``, 'function', 'other:x') + feature(``, 'function', '__private') + feature(``));
await ok(feature(`  created: whenever\n  updated: 1\n  deprecated: maybe\n`, 'predicate'));
assert.deepEqual(await errorsOf(`name: XP\n`), []);

// --- '$' definitions

await ok(`$placed = state > doc\n` + feature(`  output $placed\n`));
await ok(`$block = string > doc\n` + feature(`  input storage: $block\n`));
await fails(`$x = state > doc\n$x = state > doc\n` + feature(`  output $x\n`), "'$x' is already declared on line 6", 7);
// a reference resolves to the first declaration, so a redefinition of another shape is reported twice
assert.deepEqual(await errorsOf(`${header}$x = state > doc\n$x = string > doc\n` + feature(`  output $x\n  input storage: $x\n`)),
    ["13: '$x' is a slot, not a type: it is declared on line 6", "7: '$x' is already declared on line 6"]);
await fails(`$x = string\n` + feature(`  output $x\n`), "'$x' is a type, not a slot: it is declared on line 6", 11);
await fails(`$x = state\n` + feature(`  input storage: $x\n  output $x\n`), "'$x' is a slot, not a type: it is declared on line 6", 11);
await fails(feature(`  output $nope\n`), "Could not resolve reference to Variable named 'nope'.");
await fails(feature(`  input storage: $nope\n`), "Could not resolve reference to Variable named 'nope'.");
assert.deepEqual(await errorsOf(`${header}$a = $b\n$b = $a\n` + feature(`  input storage: $a | $b\n`)),
    ["6: '$a' refers to itself through $a > $b", "7: '$b' refers to itself through $b > $a"]);
await fails(`$a = [$a]\n` + feature(`  input storage: $a\n`), "'$a' refers to itself through $a");
await ok(`$block = #[id="block"] string\n$state = #[id="state"] $block\n` + feature(`  input storage: $state\n`));
assert.deepEqual(await warningsOf(`${header}$unused = state\n$used = state\n` + feature(`  output $used\n`)), ["6: '$unused' is never referenced"]);

// --- slots: what a registry takes, by role

await ok(feature(`  context executor: entity\n  context position\n  context rotation\n  context dimension\n  context state\n  input storage: int\n  input state\n  output storage: int\n  output state\n  output result\n  output success\n`));
await ok(feature(`  input macro: {\n    a: int\n  }\n  input arguments: {\n    a: int\n  }\n`));
await fails(feature(`  input executor: entity\n`), 'a function takes no executor as input, only storage, arguments, macro or state');
await fails(feature(`  context storage: int\n`), 'a function takes no storage as context, only executor, position, rotation, dimension or state');
await fails(feature(`  output macro: {\n    a: int\n  }\n`), 'a function takes no macro as output, only storage, state, result or success');
await fails(feature(`  input macro: {\n  }\n`, 'predicate'), 'a predicate takes no macro as input, only storage or state');
await fails(feature(`  output result\n`, 'predicate'), 'a predicate takes no result as output, only success', 10);
await fails(feature(`  output success\n`, 'loot_table'), 'a loot_table takes no success as output, only state');
await fails(feature(`  output state\n`, 'context_int_provider'), 'a context_int_provider takes no state as output, only result');
assert.deepEqual(await errorsOf(header + feature(`  context state\n  input state\n  output state\n`, 'block_tag')),
    ['10: a block_tag declares no context', '11: a block_tag declares no input', '12: a block_tag declares no output']);
await fails(feature(`  context position\n`, 'entity_type_tag'), 'an entity_type_tag declares no context');
// a slot through a '$' definition is checked all the same
await fails(`$pos = position\n` + feature(`  input $pos\n`), 'a function takes no position as input, only storage, arguments, macro or state', 11);

// --- kinds and their types

await fails(`$x = state: int\n`, 'a state carries no type');
await fails(feature(`  output success: int\n`), 'a success carries no type, it is always 0 or 1');
await fails(feature(`  input storage\n`), "'storage' needs a type");
await fails(feature(`  input macro\n`), "'macro' needs a type");
await fails(feature(`  input arguments\n`), "'arguments' needs a type");
await ok(feature(`  context executor: player\n  context executor: entity[]\n  context executor: player | entity\n  context executor: player[] | entity\n`));
await fails(feature(`  context executor: xyz\n`), "'xyz' is not a type an executor takes");
await fails(feature(`  context executor: [player]\n`), "'[player]' is not a type an executor takes");
await ok(feature(`  context position: xyz | entity\n  context position: player\n`));
await fails(feature(`  context position: xy\n`), "'xy' is not a type a position takes");
await fails(feature(`  context position: int\n`), "'int' is not a type a position takes");
await ok(feature(`  context rotation: xy | player\n`));
await fails(feature(`  context rotation: xyz\n`), "'xyz' is not a type a rotation takes");
await ok(feature(`  context dimension: overworld | nether | end | any\n`));
await fails(feature(`  context dimension: entity\n`), "'entity' is not a type a dimension takes");
await fails(`$e = executor: player\n$pos = position: $e\n` + feature(`  context $pos\n`), "'$e' is a slot, not a type: it is declared on line 6", 7);
await ok(`$pos = xyz | entity\n` + feature(`  context position: $pos\n`));
await ok(feature(`  output result: int @ 0..15\n`));
await fails(feature(`  output result: float\n`), "'float' is not a type this result takes, it is an int");
await ok(feature(`  output result: float @ 0..1\n`, 'context_float_provider'));
await fails(feature(`  output result: int\n`, 'context_float_provider'), "'int' is not a type this result takes, it is a float");
// a definition alone takes either, the registry is only known at the slot
await ok(`$r = result: float\n` + feature(`  output $r\n`));
await fails(`$r = result: string\n` + feature(`  output $r\n`), "'string' is not a type this result takes, it is an int or float", 6);
await fails(feature(`  input macro: int\n`), "'int' is not a type a macro takes");
await fails(feature(`  input arguments: [int]\n`), "'[int]' is not a type arguments take, they need a struct");
await ok(`$s = {\n  a: int\n}\n` + feature(`  input macro: $s\n`));

// --- data types

await ok(feature(`  input storage: {\n    a: int @ 0..1\n    b: [string] @ 2..\n    c: [int, string]\n    d: byte[] @ 3\n    e: {}\n    f: int | string\n    g: number\n    h: any\n  }\n`));
await fails(feature(`  input storage: player\n`), "'player' is not a data type");
await fails(feature(`  input storage: {\n    a: {\n      b: [xyz]\n    }\n  }\n`), "'xyz' is not a data type", 12);
await fails(feature(`  input storage: player[]\n`), "'player' is not a data type");
await fails(feature(`  input storage: {\n    a: entity[]\n  }\n`), "'entity' is not a data type");
await fails(feature(`  input macro: {\n    a: entity\n  }\n`), "'entity' is not a data type");
await fails(feature(`  input arguments: {\n    a: nether\n  }\n`), "'nether' is not a data type");
// an error through an alias is reported where the alias is misused, the alias may be fine elsewhere
await fails(`$pos = xyz\n` + feature(`  context position: $pos\n  input storage: $pos\n`), "'xyz' is not a data type", 12);

// --- ranges and struct entries

await fails(`$t = int @ 3..2\n`, 'the minimum 3 is greater than the maximum 2');
await fails(`$t = float @ 5.2..1.5\n`, 'the minimum 5.2 is greater than the maximum 1.5');
await fails(`$t = int @ 1.5\n`, 'a bound must be a whole number, not 1.5');
await fails(`$t = int[] @ 1.5\n`, 'a bound must be a whole number, not 1.5');
await fails(`$t = [int] @ 0.5..\n`, 'a bound must be a whole number, not 0.5');
await fails(`$t = string @ 1.5\n`, 'a bound must be a whole number, not 1.5');
await ok(`$t = float @ .5..1.\n` + feature(`  input storage: $t\n`));
await ok(`$t = double @ 1.5..5.2\n` + feature(`  input storage: $t\n`));
await ok(`$t = number @ 1..5.2\n` + feature(`  input storage: $t\n`));
await fails(`$t = {\n  p: int\n  q: int\n  p: boolean\n}\n`, "'p' is already declared on line 7", 9);

console.log('ok');
