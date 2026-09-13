// Syntax highlighting. Run with: npm test --workspace packages/language
// Applies the TextMate grammar to the exhaustive model the way a TextMate engine would --
// repeatedly take the leftmost match, preferring the pattern listed first on a tie, entering
// and leaving begin/end blocks -- and checks that every character ends up scoped, and scoped
// as expected. Semantic tokens (bookshelf-doc-semantic-tokens.ts) refine this in the editor.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const grammar = JSON.parse(readFileSync(new URL('../../extension/syntaxes/bookshelf-doc.tmLanguage.json', import.meta.url), 'utf-8'));

/** The rules a pattern list stands for, includes and pattern groups flattened. */
function resolve(patterns) {
    return patterns.flatMap(({ include }) => {
        const rule = grammar.repository[include.slice(1)];
        assert.ok(rule, `${include} is not in the repository`);
        return rule.match || rule.begin ? [rule] : resolve(rule.patterns);
    });
}

const topLevel = resolve(grammar.patterns);

/**
 * The scope of every character of `line`, or undefined where no pattern matched. `blocks` is
 * the stack of begin/end rules open at the start of the line, and is updated in place.
 */
function scopeLine(line, blocks = []) {
    const scopes = new Array(line.length).fill(undefined);
    let offset = 0;
    while (offset < line.length) {
        const block = blocks.at(-1);
        // the end of the open block competes with its own patterns, and wins a tie
        const candidates = block ? [{ match: block.end, captures: block.endCaptures, isEnd: true }, ...resolve(block.patterns)] : topLevel;
        let best;
        for (const rule of candidates) {
            const match = execFrom(rule, line, offset);
            if (match && (best === undefined || match.index < best.index)) {
                best = match;
                if (match.index === offset) break; // nothing can start earlier
            }
        }
        if (best === undefined) {
            break;
        }
        paint(scopes, best, best.rule);
        if (best.rule.isEnd) {
            blocks.pop();
        } else if (best.rule.begin) {
            blocks.push(best.rule);
        }
        offset = Math.max(best.index + best[0].length, offset + 1);
    }
    return scopes;
}

/** Runs `rule` against `line` anchored at or after `offset`, the way a scanner would. */
function execFrom(rule, line, offset) {
    const regex = new RegExp(rule.match ?? rule.begin, 'dg');
    regex.lastIndex = offset;
    const match = regex.exec(line);
    if (match) {
        match.rule = rule;
    }
    return match;
}

function paint(scopes, match, rule) {
    const fill = (start, end, scope) => {
        for (let i = start; i < end; i++) {
            scopes[i] = scope;
        }
    };
    fill(match.index, match.index + match[0].length, rule.name);
    for (const [group, { name }] of Object.entries(rule.captures ?? rule.beginCaptures ?? {})) {
        const range = match.indices?.[Number(group)];
        if (range) {
            fill(range[0], range[1], name);
        }
    }
}

const model = readFileSync(new URL('./exhaustive.bs', import.meta.url), 'utf-8');

// every character of the model carries a scope, whitespace aside
const blocks = [];
for (const [index, line] of model.split('\n').entries()) {
    const scopes = scopeLine(line, blocks);
    const unscoped = [...line].map((char, i) => (scopes[i] === undefined && char.trim() ? `${i}:${char}` : ''))
        .filter(Boolean);
    assert.deepEqual(unscoped, [], `line ${index + 1} of exhaustive.bs: ${line}`);
}
assert.deepEqual(blocks, [], 'a struct is left open at the end of the model');

/** The scope covering the first occurrence of `text` in `line`, `inStruct` or at the top level. */
const scopeOf = (line, text, inStruct = false) =>
    scopeLine(line, inStruct ? [grammar.repository.struct] : [])[line.indexOf(text)];

// a property line: any key, free text as value
assert.match(scopeOf('description: Read & modify XP.', 'Read'), /^string\.unquoted/);
assert.match(scopeOf('name: Player XP', 'name'), /^keyword\.other\.field/);
assert.match(scopeOf('licence: MIT', 'licence'), /^keyword\.other\.field/);
assert.match(scopeOf('    created: 2022/04/14 1.18.2', '2022/04/14'), /^string\.unquoted/);
assert.match(scopeOf('# a comment', 'a comment'), /^comment\.line\.number-sign/);
// the same line inside a struct is an entry and its type, not a property
assert.match(scopeOf('        levels: int', 'levels', true), /^variable\.other\.property/);
assert.match(scopeOf('        levels: int', 'int', true), /^support\.type\.primitive/);
assert.match(scopeOf('        maybe?: boolean', '?', true), /^keyword\.operator\.optional/);
assert.match(scopeOf('        exact_size: int @ 0..100 [ ] @ 4', '@', true), /^keyword\.operator\.range/);
assert.match(scopeOf('        exact_size: int @ 0..100 [ ] @ 4', '..', true), /^keyword\.operator\.range/);
assert.match(scopeOf('        exact_size: int @ 0..100 [ ] @ 4', '100', true), /^constant\.numeric/);
assert.match(scopeOf('        ratio: float @ 0.5..1.', '0.5', true), /^constant\.numeric/);
assert.match(scopeOf('        ratio: float @ 0.5..1.', '1.', true), /^constant\.numeric/);
// a struct opened on a port line is entered, and left on its closing brace
const open = [];
scopeLine('    input storage in : {', open);
assert.equal(open.length, 1, 'a struct is not entered');
scopeLine('    } > doc', open);
assert.equal(open.length, 0, 'a struct is not left');

assert.match(scopeOf('    context state > a state carries no type', '> a state'), /^punctuation\.definition\.comment/);
assert.match(scopeOf('    context state > a state carries no type', 'a state carries'), /^comment\.line\.documentation/);
assert.match(scopeOf('    context state > doc', 'context'), /^keyword\.control\.port/);
assert.match(scopeOf('    context state > doc', 'state'), /^storage\.type\.kind/);
assert.match(scopeOf('feature function add_levels:', 'function'), /^support\.class\.registry/);
assert.match(scopeOf('feature function add_levels:', 'add_levels'), /^entity\.name\.function/);
assert.match(scopeOf('feature function bs.xp:add_levels:', 'bs.xp:add_levels'), /^entity\.name\.function/);
assert.match(scopeOf('feature function_tag ^input:', 'function_tag'), /^support\.class\.registry/);
assert.match(scopeOf('var shared_payload = storage', 'shared_payload'), /^entity\.name\.variable/);
assert.match(scopeOf('    input ref shared_payload', 'shared_payload'), /^variable\.other\.readwrite/);
assert.match(scopeOf('    input storage bs.exhaustive:shared payload/levels : {', 'bs.exhaustive'), /^entity\.name\.namespace/);
assert.match(scopeOf('    input storage bs.exhaustive:shared payload/levels : {', 'shared'), /^entity\.name\.label/);
assert.match(scopeOf('    input storage bs.exhaustive:shared payload/levels : {', 'payload/levels'), /^entity\.name\.label/);
assert.match(scopeOf('    input storage in : {', 'in :'), /^entity\.name\.label/);
assert.match(scopeOf('var v = storage : int | string > doc', '|'), /^keyword\.operator\.range/);

// a description is free text, so the words inside it stay a comment
const described = '    input macro : { p: int } > a macro holds a struct of int';
assert.match(scopeOf(described, 'a macro holds'), /^comment\.line\.documentation/);
assert.match(scopeOf(described, 'macro :'), /^storage\.type\.kind/);

console.log('ok');
