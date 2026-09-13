// Typir typing rules. Run with: npm test --workspace packages/language (after `npm run build`)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AstUtils, EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createBookshelfDocServices, reflection } from '../out/index.js';

const parse = parseHelper(createBookshelfDocServices(EmptyFileSystem).BookshelfDoc);

const header = `name: Player XP
slug: x
version: 1
tags: a
description: Read and modify player XP levels, and set the bar by percentage.
`;

/** Parses `body` after a minimal document header and returns the typing error messages. */
const errorsOf = async (body) => {
    const doc = await parse(header + body, { validation: true });
    assert.deepEqual(doc.parseResult.lexerErrors.map(e => e.message), [], body);
    assert.deepEqual(doc.parseResult.parserErrors.map(e => e.message), [], body);
    return (doc.diagnostics ?? []).filter(d => d.severity === 1).map(d => d.message);
};

const ok = async (body) => assert.deepEqual(await errorsOf(body), [], body);
const fails = async (body, expected) => {
    const errors = await errorsOf(body);
    assert.equal(errors.length, 1, `${body}\nexpected 1 error, got: ${JSON.stringify(errors)}`);
    assert.match(errors[0], expected, body);
};

/** A variable declaration at document level. */
const variable = (kind, type) => `var v = ${kind}${type ? ` : ${type}` : ''} > doc\n`;

/** A feature with the given slots (one per line, already indented). */
const feature = (slots) => `feature function add_levels:
    description: Add levels to the player.
    authors: Aksiome
    created: 2022/11/14 1.18.2
    updated: 2026/11/19 26.3
${slots}`;

// --- rules 5-9: a kind constrains the type it is defined with
await ok(variable('position', 'xyz'));
await ok(variable('position', 'entity'));
await fails(variable('position', 'int'), /'position' kind requires a position type, but got 'int'/);
await fails(variable('position', '{ p: int }'), /'position' kind requires a position type, but got 'struct'/);
await fails(variable('position', ''), /'position' kind requires a position type\./);

await ok(variable('storage', '{ p: int }'));
await ok(variable('storage', 'int'));
await ok(variable('storage', '[ string ] @ 1..2'));
await fails(variable('storage', 'entity'), /'storage' kind requires a programmatic type, but got 'entity'/);
await fails(variable('storage', '[ xyz ] @ 1..2'), /'storage' kind requires a programmatic type, but got 'xyz'/);

// --- a 'state' carries no type at all
await ok(variable('state', ''));
await fails(variable('state', 'int'), /'state' kind cannot have a type/);

await ok(variable('rotation', 'xy'));
await ok(variable('rotation', 'player'));
await fails(variable('rotation', 'xyz'), /'rotation' kind requires a rotation type, but got 'xyz'/);

await ok(variable('executor', 'player'));
await fails(variable('executor', 'xyz'), /'executor' kind requires an abstract entity type/);

await ok(variable('dimension', 'overworld'));
await ok(variable('dimension', 'any'));
await fails(variable('dimension', 'entity'), /'dimension' kind requires a dimension type/);

await ok(variable('result', 'number'));
await fails(variable('result', 'int'), /'result' kind requires a number type, but got 'int'/);
await fails(variable('success', 'string'), /'success' kind requires a number type, but got 'string'/);

// --- an array or a union of X is checked as X, for every kind
await ok(variable('executor', 'player[]'));
await ok(variable('executor', 'player | entity'));
await ok(variable('position', 'xyz[] @ 2'));
await fails(variable('executor', 'xyz[]'), /'executor' kind requires an abstract entity type, but got 'xyz'/);
await fails(variable('executor', 'player | xyz'), /'executor' kind requires an abstract entity type, but got 'xyz'/);
// a list is not looked through outside a programmatic type
await fails(variable('executor', '[ player ]'), /'executor' kind requires an abstract entity type, but got 'list'/);

// --- a programmatic type is NBT: its arrays only hold int, byte or long
await ok(variable('storage', 'int[] @ 1..3'));
await ok(variable('storage', '{ p: byte @ 0..1 [] }'));
await fails(variable('storage', 'player[]'), /'storage' kind requires a programmatic type, but got 'player'/);
await fails(variable('storage', 'string[]'), /'storage' kind only allows an array of 'int', 'byte' or 'long', but got an array of 'string'/);
await fails(variable('storage', '{ p: string @ 1..2 [] @ 1..3 }'), /struct entry 'p' only allows an array of 'int', 'byte' or 'long', but got an array of 'string'/);
await fails(variable('storage', '{ p: int[][] }'), /struct entry 'p' only allows an array of 'int', 'byte' or 'long', but got an array of 'array'/);
await fails(variable('storage', '{ p: [ double[] ] }'), /struct entry 'p' only allows an array of 'int', 'byte' or 'long', but got an array of 'double'/);
await fails(variable('macro', '{ p: float[] }'), /struct entry 'p' only allows an array of 'int', 'byte' or 'long', but got an array of 'float'/);

// --- rule 4: a struct only holds classical programmatic types, at any depth
await ok(variable('storage', '{ p: [ string ] @ 1..2 }'));
await fails(variable('storage', '{ p: entity }'), /struct entry 'p' requires a programmatic type, but got 'entity'/);
await fails(variable('storage', '{ p: [ xyz ] @ 1..2 }'), /struct entry 'p' requires a programmatic type, but got 'xyz'/);
await fails(variable('storage', '{ p: { q: nether } }'), /struct entry 'q' requires a programmatic type, but got 'nether'/);

// --- rules 1-3: a port constrains the kind it holds
await ok(feature('    input storage : { p: int } > doc\n'));
await ok(feature('    input macro : { p: int } > doc\n'));
await fails(feature('    input macro > doc\n'), /'macro' kind requires a struct type\./);
await fails(feature('    input position : xyz > doc\n'), /Input cannot hold a 'position' kind/);
await ok(feature('    context executor : entity > doc\n'));
await ok(feature('    context state > doc\n'));
await ok(feature('    context position : xyz > doc\n'));
await fails(feature('    context storage : { p: int } > doc\n'), /Context cannot hold a 'storage' kind/);
await ok(feature('    output success : number > doc\n'));
await fails(feature('    output executor : entity > doc\n'), /Output cannot hold a 'executor' kind/);

// --- a 'ref' is validated like the variable it points to
await ok(variable('storage', '{ p: int }') + feature('    input ref v\n'));
await fails(variable('position', 'xyz') + feature('    input ref v\n'), /Input cannot hold a 'position' kind/);

// --- value ranges and sizes (plain validation, not typing)
await ok(variable('storage', '{ p: int @ 1..2 [ ] @ 1..3 }'));
await fails(variable('storage', '{ p: int @ 3..2 [ ] @ 1..3 }'), /minimum 3 is greater than the maximum 2/);
await fails(variable('storage', '{ p: int [ ] @ 1.5 }'), /bound must be a whole number, but was 1.5/);
await fails(variable('storage', '{ p: int @ 0.5..2 [ ] @ 1 }'), /bound must be a whole number, but was 0.5/);
await fails(variable('storage', '{ p: string @ 1.5 }'), /bound must be a whole number, but was 1.5/);
await fails(variable('storage', '{ p: [ float ] @ 1.5 }'), /bound must be a whole number, but was 1.5/);
// a floating type takes fractional bounds
await ok(variable('storage', '{ p: float @ 1.5..5 }'));
await ok(variable('storage', '{ p: double @ 1.5..5.2 }'));
await ok(variable('storage', '{ p: number @ 1..5.2 }'));
await ok(variable('storage', '{ p: float @ .5.. }'));
await ok(variable('storage', '{ p: float @ ..1. }'));
await fails(variable('storage', '{ p: float @ 5.2..1.5 }'), /minimum 5.2 is greater than the maximum 1.5/);
// --- a struct entry name is unique
await fails(variable('storage', '{ p: int q: int p: boolean }'), /Duplicate struct entry 'p'/);

// --- a date is free text, so its shape and the calendar are checked by validation
const dated = (date) => feature('    context state > doc\n').replace('2022/11/14', date);
await ok(dated('2022/04/14'));
await fails(dated('14/04/2022'), /'14\/04\/2022 1.18.2' is not a date followed by a Minecraft version/);
await fails(dated('2022/02/30'), /'2022\/02\/30' is not an existing date/);
await fails(dated('2022/13/01'), /'2022\/13\/01' is not an existing date/);

// --- a feature is not updated before it is created
await ok(dated('2026/11/19'));
await fails(dated('2026/11/20'), /update date 2026\/11\/19 is before the creation date 2026\/11\/20/);

// --- slugs keep their shape now that they share the ID terminal with plain identifiers
const slugErrors = async (slug, tag) => {
    const doc = await parse(`name: Player XP
slug: ${slug}
version: 1
tags: ${tag}
description: Read and modify player XP levels.
${variable('state', '')}`, { validation: true });
    assert.deepEqual(doc.parseResult.parserErrors.map(e => e.message), [], slug);
    return (doc.diagnostics ?? []).filter(d => d.severity === 1).map(d => d.message);
};
assert.deepEqual(await slugErrors('bookshelf-xp', 'datapack-only'), []);
assert.match((await slugErrors('Not_A_Slug', 'runtime'))[0], /'Not_A_Slug' must start with a lowercase letter/);
assert.match((await slugErrors('bookshelf-xp', 'Runtime'))[0], /'Runtime' must start with a lowercase letter/);

// --- a line break delimits statements, everywhere but inside a struct
const parses = async (text) => {
    const doc = await parse(text);
    return [...doc.parseResult.lexerErrors, ...doc.parseResult.parserErrors].length === 0;
};
assert.ok(await parses(header + variable('state', '')), 'one statement per line');
assert.ok(!await parses(variable('state', '') + feature('    input ref v context state > doc\n')), 'two slots on one line');
// a description runs to the end of its line, so it cannot be followed by another statement
assert.ok(await parses(feature('    context state > doc input macro\n')), 'a description swallows its line');

// a '#' comment may take a whole line, at any indentation, or end a statement. It cannot follow
// free text or a '> doc' on the same line: those run to the end of the line, '#' included.
assert.ok(await parses('# leading\n' + header + '  # indented\n' + variable('state', '') + '# trailing line'), 'comment lines');
assert.ok(await parses(header + 'var v = state # a comment\n'), 'a comment after a statement');
assert.ok(await parses(header + feature('        # deeper\n    context state > doc\n# shallower\n    output state > doc\n')), 'comment lines inside a feature');
assert.ok(await parses(header + 'var v = storage : {\n    # a comment\n    p: int # trailing\n} > doc\n'), 'comments inside a struct');
// blank lines, blank lines holding spaces, a leading blank line and a missing final line break
assert.ok(await parses('\n' + header + '\n' + variable('state', '')), 'leading and separating blank lines');
assert.ok(await parses(header + '   \n' + variable('state', '')), 'a blank line holding spaces');
// NL terminates a statement, so the last line needs one too
assert.ok(!await parses((header + variable('state', '')).trimEnd()), 'no final line break');
assert.ok(await parses(header + feature('    context state > doc\n') + '\n' + variable('state', '')), 'a blank line before a dedent');

// a struct spreads over as many lines as it likes
assert.ok(await parses(header + `var v = storage : {
    p: int
    q: [ string ] @ 1..2
} > doc
`), 'a multi-line struct');
// --- a storage target, which only lexes because STORAGE_TARGET precedes ID
assert.ok(await parses(header + feature(`    input storage bs.xp:add_levels in: {
        levels: int
    } > amount of levels to add
`)), 'a storage target and a path');
// the same terminal wins on a colon written without a space, so a struct entry needs one
// a resource location wins on a colon written without a space, so a struct entry needs one
assert.ok(!await parses(variable('storage', '{ p:int }')), 'a struct entry needs a space after its colon');
assert.ok(await parses(variable('storage', '{ p: int }')), 'a struct entry with a space after its colon');

assert.ok(await parses(header + feature(`    input storage: {
        levels: int
    } > amount of levels to add
    output state > players' XP is updated
`)), 'a multi-line struct inside a feature body');

// --- a property takes the rest of its line, which only the lexer can decide
const valueOf = async (text) => {
    const doc = await parse(text);
    assert.deepEqual(doc.parseResult.parserErrors.map(e => e.message), [], text);
    return doc.parseResult.value;
};
const propertyOf = (node, key) => node.slots.find(slot => slot.$type === 'Property' && slot.key === key)?.value;
const firstVariable = (doc) => doc.slots.find(slot => slot.$type === 'Variable');
const firstFeature = (doc) => doc.slots.find(slot => slot.$type === 'Feature');

// free text holds anything, keywords and punctuation included
const loose = await valueOf(`name: input storage: {} > 1..2, and "quotes" too!
slug: x
version: 1
tags: a
description: Read & modify player XP levels.
${variable('state', '')}`);
assert.equal(propertyOf(loose, 'name'), 'input storage: {} > 1..2, and "quotes" too!');
assert.equal(propertyOf(loose, 'description'), 'Read & modify player XP levels.');

// surrounding whitespace is not part of the value
const padded = header.replace('name: Player XP', 'name:    Player XP   ') + variable('state', '');
assert.equal(propertyOf(await valueOf(padded), 'name'), 'Player XP');

// the value must be on the same line, and must not be empty
assert.ok(!await parses(header.replace('name: Player XP\n', 'name:\n')), 'an empty name');
assert.ok(!await parses(header.replace('name: Player XP\n', 'name:\nPlayer XP\n')), 'a name on the next line');

// a property key is a plain ID, so it is not a keyword: a struct entry may reuse it
assert.ok(await parses(variable('storage', '{ name: string }')), 'a struct entry called name');
// a struct entry which opens a line is not a property, even though it has the same shape
assert.ok(await parses(header + `var v = storage : {
    name: string
    slug: [ int ] @ 2
} > doc
`), 'struct entries called like properties, one per line');
// the '^' escape is dropped from the value, so it does not make a second, distinct entry
await fails(variable('storage', '{ name2: int ^name2: boolean }'), /Duplicate struct entry 'name2'/);

// an escaped variable name and an escaped reference to it meet on the stripped name
await ok(`var ^input = storage : { p: int } > doc
` + feature('    input ref ^input\n'));
await ok(`var input2 = storage : { p: int } > doc
` + feature('    input ref ^input2\n'));
// without the escape the keyword wins, which leaves a 'ref' with nothing to point at
assert.ok(!await parses(`var ^input = storage : { p: int } > doc
` + feature('    input ref input\n')), 'an unescaped keyword as a reference');

// a '#' inside free text is text: prose may cite '#bs.xp:foo' without opening a comment
const cited = await valueOf(header.replace(/description: .*/, 'description: see #bs.xp:foo') + variable('state', '')
    + feature('    context state > refer to #bs.xp:foo\n'));
assert.equal(propertyOf(cited, 'description'), 'see #bs.xp:foo');
assert.deepEqual(firstFeature(cited).slots.find(slot => slot.$type === 'Context').expression.description, ['> refer to #bs.xp:foo']);
// --- documentation follows the element it documents, on the same line
const refSlot = (documentation) => variable('storage', '{ p: int }') + feature(`    input ref v${documentation}\n`);
const refDescription = async (documentation) =>
    firstFeature(await valueOf(header + refSlot(documentation))).slots.find(slot => slot.$type === 'Input').expression.description;

await ok(refSlot(' > a reference may be documented too'));
assert.deepEqual(await refDescription(' > why this input exists'), ['> why this input exists']);
// on a reference it is optional, since the variable it points at carries its own
assert.deepEqual(await refDescription(''), []);
// a documented reference is still typed through to the variable
await fails(variable('position', 'xyz') + feature('    input ref v > documented all the same\n'),
    /Input cannot hold a 'position' kind/);

// --- a property is any 'key: value' line, in any order; nothing is mandatory
const headerFields = ['name: Player XP', 'slug: x', 'version: 1', 'tags: a', 'description: d', 'licence: MIT'];
const docErrors = async (fields) =>
    ((await parse(fields.join('\n') + '\n', { validation: true })).diagnostics ?? []).map(d => d.message);
assert.deepEqual(await docErrors([...headerFields].reverse()), []);
assert.deepEqual(await docErrors([]), []);
await ok(feature(''));

// --- the exhaustive model parses and validates cleanly
const exhaustive = await parse(readFileSync(new URL('./exhaustive.bs', import.meta.url), 'utf-8'), { validation: true });
assert.deepEqual(exhaustive.parseResult.lexerErrors.map(e => e.message), []);
assert.deepEqual(exhaustive.parseResult.parserErrors.map(e => e.message), []);
assert.deepEqual((exhaustive.diagnostics ?? []).map(d => `${d.range.start.line + 1}: ${d.message}`), []);

// ... and covers every node the grammar can build
const types = reflection.getAllTypes();
const isAbstract = (type) => types.some(other => other !== type && reflection.isSubtype(other, type));
const built = new Set(AstUtils.streamAst(exhaustive.parseResult.value).map(node => node.$type));
assert.deepEqual(types.filter(type => !isAbstract(type) && !built.has(type)), []);

console.log('ok');
