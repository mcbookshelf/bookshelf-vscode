// Code completion. Run with: npm test --workspace packages/language
// Langium only completes keywords and cross-references, so anything worth proposing has to be
// one of the two rather than a terminal.
import assert from 'node:assert/strict';
import { EmptyFileSystem } from 'langium';
import { expectCompletion } from 'langium/test';
import { createBookshelfDocServices } from '../out/index.js';

const completion = expectCompletion(createBookshelfDocServices(EmptyFileSystem).BookshelfDoc);

const header = `name: Player XP
slug: x
version: 1
tags: a
description: d
`;

/** The labels proposed at the '<|>' marker of `text`. */
const proposalsAt = async (text) => {
    let labels;
    await completion({ text, index: 0, assert: (completions) => { labels = completions.items.map(item => item.label); } });
    return labels;
};

const REGISTRIES = ['context_float_provider', 'context_int_provider', 'function', 'function_tag', 'loot_table', 'predicate'];

// a registry follows 'feature'
assert.deepEqual((await proposalsAt(`${header}feature <|>`)).sort(), REGISTRIES);

/** A feature body holding `slots`, with the cursor inside. */
const inFeature = (slots) => `${header}feature function f:
    description: d
    authors: A
    created: 2022/11/14 1.18.2
    updated: 2026/11/19 26.3
${slots}`;

// a kind follows a port: only the ones the port may hold (rules 1-3), and always 'ref'
assert.deepEqual((await proposalsAt(inFeature('    input <|>'))).sort(), ['macro', 'ref', 'storage']);
assert.deepEqual((await proposalsAt(inFeature('    context <|>'))).sort(), ['dimension', 'executor', 'position', 'ref', 'rotation', 'state']);
assert.deepEqual((await proposalsAt(inFeature('    output <|>'))).sort(), ['ref', 'result', 'state', 'storage', 'success']);
// a variable is not a port, so it takes any kind
const KINDS = ['dimension', 'executor', 'macro', 'position', 'result', 'rotation', 'state', 'storage', 'success'];
assert.deepEqual((await proposalsAt(`${header}var v = <|>`)).sort(), KINDS);

// a type follows a kind and its colon: only the ones the kind accepts (rules 5-9). Only the
// primitives are proposed: '{' and '[' open a composite type, which Langium does not reach
// through the Type -> CompositeType -> ... chain.
const PROGRAMMATIC = ['any', 'boolean', 'byte', 'double', 'float', 'int', 'long', 'number', 'short', 'string'];
assert.deepEqual((await proposalsAt(`${header}var v = storage : <|>`)).sort(), PROGRAMMATIC);
assert.deepEqual((await proposalsAt(`${header}var v = position : <|>`)).sort(), ['entity', 'player', 'xyz']);
assert.deepEqual((await proposalsAt(`${header}var v = rotation : <|>`)).sort(), ['entity', 'player', 'xy']);
assert.deepEqual((await proposalsAt(`${header}var v = executor : <|>`)).sort(), ['entity', 'player']);
assert.deepEqual((await proposalsAt(`${header}var v = dimension : <|>`)).sort(), ['any', 'end', 'nether', 'overworld']);
assert.deepEqual((await proposalsAt(`${header}var v = result : <|>`)).sort(), ['number']);
// a struct entry is programmatic whatever the kind (rule 4), a macro included
assert.deepEqual((await proposalsAt(`${header}var v = macro : { p: <|>`)).sort(), PROGRAMMATIC);

// a 'ref' proposes the variables in scope, which are cross-references, but only the ones whose
// kind the port may hold. Document level variables are exported, so the ones of the documents
// parsed above are in scope too.
const refs = await proposalsAt(`${header}var my_storage = storage : { p: int } > doc
var my_position = position : xyz > doc
` + inFeature('    input ref <|>'));
assert.ok(refs.includes('my_storage'), 'a variable in scope is not proposed');
assert.ok(!refs.includes('my_position'), 'a variable the port cannot hold is proposed');

console.log('ok');
