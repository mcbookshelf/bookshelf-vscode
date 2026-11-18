// Syntax highlighting. Run with: npm test --workspace packages/language
// Applies the TextMate grammar to the samples the way a TextMate engine would -- repeatedly
// take the leftmost match, preferring the pattern listed first on a tie, entering and leaving
// begin/end blocks, and applying the patterns of a capture inside it -- and checks that every
// character ends up scoped, and scoped as expected. Semantic tokens
// (bsdoc-semantic-tokens.ts) refine this in the editor.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const grammar = JSON.parse(readFileSync(new URL('../../extension/syntaxes/bsdoc.tmLanguage.json', import.meta.url), 'utf-8'));

/** The rules a pattern list stands for, includes and pattern groups flattened. */
function resolve(patterns) {
    return patterns.flatMap((pattern) => {
        if (!pattern.include) {
            return [pattern];
        }
        const rule = grammar.repository[pattern.include.slice(1)];
        assert.ok(rule, `${pattern.include} is not in the repository`);
        return rule.match || rule.begin ? [rule] : resolve(rule.patterns);
    });
}

const topLevel = resolve(grammar.patterns);

/**
 * The leftmost match of `rules` in `line` from `offset`, the rule listed first winning a tie.
 * '\G' matches at `anchor`, where the open block began on this line, and nowhere without one.
 */
function leftmost(rules, line, offset, anchor = -1) {
    let best;
    for (const rule of rules) {
        const source = (rule.match ?? rule.begin).replaceAll('\\G', anchor < 0 ? '(?!)' : `(?<=^.{${anchor}})`);
        const regex = new RegExp(source, 'dg');
        regex.lastIndex = offset;
        const match = regex.exec(line);
        if (match && (best === undefined || match.index < best.index)) {
            best = match;
            best.rule = rule;
            if (match.index === offset) break; // nothing can start earlier
        }
    }
    return best;
}

/**
 * The scope of every character of `line`, or undefined where no pattern matched. `blocks` is
 * the stack of begin/end rules open at the start of the line, and is updated in place.
 */
function scopeLine(line, blocks = []) {
    const scopes = new Array(line.length).fill(undefined);
    let offset = 0;
    let anchor = -1;
    while (offset <= line.length) {
        const block = blocks.at(-1);
        // the end of the open block competes with its own patterns, and wins a tie
        const rules = block ? [{ match: block.end, captures: block.endCaptures, isEnd: true }, ...resolve(block.patterns)] : topLevel;
        const best = leftmost(rules, line, offset, anchor);
        if (best === undefined) {
            break;
        }
        paint(scopes, line, best, best.rule);
        anchor = -1;
        if (best.rule.isEnd) {
            blocks.pop();
            if (best[0].length === 0 && best.index < line.length) {
                continue; // a lookahead: the line is then scanned with the rules outside the block
            }
        } else if (best.rule.begin) {
            blocks.push(best.rule);
            anchor = best.index + best[0].length;
        }
        offset = Math.max(best.index + best[0].length, offset + 1);
    }
    return scopes;
}

function paint(scopes, line, match, rule) {
    const fill = (start, end, scope) => {
        for (let i = start; i < end && scope; i++) {
            scopes[i] = scope;
        }
    };
    fill(match.index, match.index + match[0].length, rule.name);
    for (const [group, { name, patterns }] of Object.entries(rule.captures ?? rule.beginCaptures ?? {})) {
        const range = match.indices?.[Number(group)];
        if (!range) {
            continue;
        }
        fill(range[0], range[1], name);
        // the patterns of a capture apply inside it only
        const rules = patterns ? resolve(patterns) : [];
        for (let offset = range[0]; offset < range[1];) {
            const inner = leftmost(rules, line.slice(0, range[1]), offset);
            if (inner === undefined) {
                break;
            }
            paint(scopes, line, inner, inner.rule);
            offset = Math.max(inner.index + inner[0].length, offset + 1);
        }
    }
}

// every character of the samples carries a scope, whitespace aside
const samples = new URL('./samples/', import.meta.url);
for (const file of readdirSync(samples).filter(name => name.endsWith('.bs'))) {
    const blocks = [];
    for (const [index, line] of readFileSync(new URL(file, samples), 'utf-8').split(/\r?\n/).entries()) {
        const scopes = scopeLine(line, blocks);
        const unscoped = [...line].map((char, i) => (scopes[i] === undefined && char.trim() ? `${i}:${char}` : ''))
            .filter(Boolean);
        assert.deepEqual(unscoped, [], `line ${index + 1} of ${file}: ${line}`);
    }
}

/** The scope covering the first occurrence of `text` in the last line of `lines`, the lines before it scanned first. */
const scopeOf = (lines, text) => {
    const blocks = [];
    const all = lines.split('\n');
    all.slice(0, -1).forEach(line => scopeLine(line, blocks));
    const index = all.at(-1).indexOf(text);
    assert.ok(index >= 0, `'${text}' is not in: ${all.at(-1)}`);
    return scopeLine(all.at(-1), blocks)[index] ?? '';
};

// the description and every doc
assert.match(scopeOf('> Read & modify XP.', '>'), /^punctuation\.definition\.comment/);
assert.match(scopeOf('> Read & modify XP.', 'Read'), /^comment\.block\.documentation/);
assert.match(scopeOf('  > a continuation line', 'a continuation'), /^comment\.block\.documentation/);
assert.match(scopeOf('  @state > a state carries no type', 'a state carries'), /^comment\.block\.documentation/);
// a comment is a whole line; after code, '#' is not one
assert.match(scopeOf('# a comment', 'a comment'), /^comment\.line\.number-sign/);
assert.match(scopeOf('   # indented', 'indented'), /^comment\.line\.number-sign/);
assert.match(scopeOf('name see #bs.xp:foo', '#bs'), /^string\.unquoted/);

// the head: a word of the language, free text as value
assert.match(scopeOf('name Player XP', 'name'), /^support\.type\.property-name/);
assert.match(scopeOf('name Player XP', 'Player'), /^string\.unquoted/);
assert.match(scopeOf('weak_dependencies bs.log, bs.block', 'weak_dependencies'), /^support\.type\.property-name/);
assert.match(scopeOf('weak_dependencies bs.log, bs.block', 'bs.log'), /^string\.unquoted/);
assert.match(scopeOf('licence MIT', 'licence'), /^meta\.identifier/, 'not a word of the head');
// metadata, in the head or in a feature
assert.match(scopeOf('authors Aksiome, Leirof', 'authors'), /^support\.type\.property-name/);
assert.match(scopeOf('  since 2022/04/14 1.18.2', 'since'), /^support\.type\.property-name/);
assert.match(scopeOf('  since 2022/04/14 1.18.2', '2022/04/14'), /^string\.unquoted/);
assert.match(scopeOf('  deprecated', 'deprecated'), /^support\.type\.property-name/);
// a colon makes the same word a field, and what follows a type
assert.match(scopeOf('  since: int', 'since'), /^meta\.field\.name/);
assert.match(scopeOf('  since: int', 'int'), /^support\.type\.primitive/);
assert.match(scopeOf('  since?: int', 'since'), /^meta\.field\.name/);
assert.match(scopeOf('  input: int', 'input'), /^meta\.field\.name/);
assert.match(scopeOf('  deprecated: boolean', 'deprecated'), /^meta\.field\.name/);
assert.match(scopeOf('  name: string', 'name'), /^meta\.field\.name/);
assert.match(scopeOf('  feature: int', 'feature'), /^meta\.field\.name/);

// fields and types
assert.match(scopeOf('    levels: int', 'levels'), /^meta\.field\.name/);
assert.match(scopeOf('    levels: int', 'int'), /^support\.type\.primitive/);
assert.match(scopeOf('    levels: interval', 'interval'), /^meta\.identifier/, 'a word which starts like a type');
assert.match(scopeOf('    maybe?: boolean', '?'), /^keyword\.operator\.optional/);
assert.match(scopeOf('    function: string', 'function'), /^meta\.field\.name/);
assert.match(scopeOf('    1: int', '1'), /^meta\.field\.name/);
assert.match(scopeOf('    limits:', ':'), /^punctuation\.separator/);
assert.match(scopeOf('    region: struct > region to fill', 'struct'), /^support\.type\.primitive/);
assert.match(scopeOf('    region: struct > a struct', 'a struct'), /^comment\.block\.documentation/);
assert.match(scopeOf('    points: [struct] @ 2.. > doc', '['), /^punctuation\.separator/);
assert.match(scopeOf('    bytes: byte @ 0..1 [] @ 1..', '@'), /^punctuation\.separator/);
assert.match(scopeOf('    bytes: byte @ 0..1 [] @ 1..', '..'), /^keyword\.operator\.range/);
assert.match(scopeOf('    open: number @ 0<..<1', '<..<'), /^keyword\.operator\.range/);
assert.match(scopeOf('    open: number @ 0<..<1', '1'), /^constant\.numeric/);
assert.match(scopeOf('    loose: number @ -1..1', '-1'), /^constant\.numeric/);
assert.match(scopeOf('    single: float @ 0.5..1.', '0.5'), /^constant\.numeric/);
assert.match(scopeOf('    single: float @ 0.5..1.', '1.'), /^constant\.numeric/);
assert.match(scopeOf('    either: int | string', '|'), /^keyword\.operator\.range/);
assert.match(scopeOf('    pair: [int, string]', ','), /^punctuation\.separator/);
assert.match(scopeOf('    aliased: $block', '$'), /^keyword\.control\.bsdoc/);
assert.match(scopeOf('    aliased: $block', 'block'), /^variable\.parameter/);
assert.match(scopeOf('    attributed: #[id="item"] string', '#[id="item"]'), /^entity\.other\.attribute-name/);
assert.match(scopeOf('    properties?: #[as=mcdoc:block_states[[id]]] struct', '#[as'), /^entity\.other\.attribute-name/);
assert.match(scopeOf('    properties?: #[as=mcdoc:block_states[[id]]] struct', 'struct'), /^support\.type\.primitive/);

// features, contexts, inputs and outputs
assert.match(scopeOf('feature function add_levels > doc', 'feature'), /^keyword\.control\.feature/);
assert.match(scopeOf('feature function add_levels > doc', 'function'), /^storage\.type\.registry/);
assert.match(scopeOf('feature function add_levels > doc', 'add_levels'), /^entity\.name\.function/);
assert.match(scopeOf('feature function add_levels > doc', 'doc'), /^comment\.block\.documentation/);
assert.match(scopeOf('feature function bs.xp:add_levels', 'bs.xp'), /^entity\.name\.function/);
assert.match(scopeOf('feature entity_type_tag is_mob', 'entity_type_tag'), /^storage\.type\.registry/);
assert.match(scopeOf('feature structure oak/1', 'oak/1'), /^entity\.name\.function/);
assert.match(scopeOf('  @executor: player | entity > doc', '@executor'), /^keyword\.control\.context/);
assert.match(scopeOf('  @executor: player | entity > doc', 'player'), /^support\.type\.primitive/);
assert.match(scopeOf('  @state > doc', '@state'), /^keyword\.control\.context/);
assert.match(scopeOf('  input arguments:', 'input'), /^keyword\.control\.slot/);
assert.match(scopeOf('  input arguments:', 'arguments'), /^storage\.type\.kind/);
assert.match(scopeOf('  output state > doc', 'state'), /^storage\.type\.kind/);
assert.match(scopeOf('  output result: float @ 0.. > doc', 'float'), /^support\.type\.primitive/);
const target = '  output storage bs.exhaustive:shared payload/levels: int > doc';
assert.match(scopeOf(target, 'bs.exhaustive'), /^entity\.name\.function/);
assert.match(scopeOf(target, ':shared'), /^entity\.name\.function/);
assert.match(scopeOf(target, 'payload/levels'), /^support\.type\.property-name/);
assert.match(scopeOf(target, '/levels'), /^support\.type\.property-name/);
assert.match(scopeOf(target, 'int'), /^support\.type\.primitive/);
assert.match(scopeOf('  input storage in:', 'in:'), /^support\.type\.property-name/);

// '$' definitions, and the lines and fields they paste
assert.match(scopeOf('$max_distance: number @ 0..2047 > doc', '$'), /^keyword\.control\.bsdoc/);
assert.match(scopeOf('$max_distance: number @ 0..2047 > doc', 'max_distance'), /^variable\.parameter/);
assert.match(scopeOf('$max_distance: number @ 0..2047 > doc', 'number'), /^support\.type\.primitive/);
assert.match(scopeOf('$position:', 'position'), /^variable\.parameter/);
assert.match(scopeOf('  $ray', '$'), /^keyword\.control\.bsdoc/);
assert.match(scopeOf('  $ray', 'ray'), /^variable\.parameter/);
// one line after the name of a definition is scoped as in a feature
assert.match(scopeOf('$updated: output state > the bar is updated', 'updated'), /^variable\.parameter/);
assert.match(scopeOf('$updated: output state > the bar is updated', 'output'), /^keyword\.control\.slot/);
assert.match(scopeOf('$updated: output state > the bar is updated', 'state'), /^storage\.type\.kind/);
assert.match(scopeOf('$updated: output state > the bar is updated', 'the bar'), /^comment\.block\.documentation/);
assert.match(scopeOf('$viewer: @executor: player > who looks', '@executor'), /^keyword\.control\.context/);
assert.match(scopeOf('$viewer: @executor: player > who looks', 'player'), /^support\.type\.primitive/);
assert.match(scopeOf('$dated: since 2024/01/01 1.20', 'since'), /^support\.type\.property-name/);
assert.match(scopeOf('$dated: since 2024/01/01 1.20', '2024'), /^string\.unquoted/);
assert.match(scopeOf('$flagged: deprecated', 'deprecated'), /^support\.type\.property-name/);
assert.match(scopeOf('$operands: input storage bs.x:shared in:', 'bs.x:shared'), /^entity\.name\.function/);
assert.match(scopeOf('$operands: input storage:\n  a: int', 'a'), /^meta\.field\.name/, 'the block ends with its line');
assert.match(scopeOf('$input: int', 'int'), /^support\.type\.primitive/, 'a type, not a line');
// a list, and the properties of its items: free text, whatever the key
assert.match(scopeOf('$face[bottom, east]', 'face'), /^variable\.parameter/);
assert.match(scopeOf('$face[bottom, east]', 'bottom'), /^variable\.other\.enummember/);
assert.match(scopeOf('$face[bottom, east]', 'east'), /^variable\.other\.enummember/);
assert.match(scopeOf('$flag[1, 2]', '2'), /^variable\.other\.enummember/);
assert.match(scopeOf('$side[x]:', 'x'), /^variable\.other\.enummember/);
assert.match(scopeOf('$axis[x]:\n  nth: first', 'nth'), /^support\.type\.property-name/);
assert.match(scopeOf('$axis[x]:\n  nth: first', 'first'), /^string\.unquoted/);
assert.match(scopeOf('$axis[x]:\n  since: 2025/01/25 1.21.4', 'since'), /^support\.type\.property-name/);
assert.match(scopeOf('$axis[x]:\n  since: 2025/01/25 1.21.4', '2025'), /^string\.unquoted/);
assert.match(scopeOf('$axis[x]:\n  where: `on_exit`, an int: 1', 'int'), /^string\.unquoted/);
// the block of a list ends with the next line which is not indented
assert.match(scopeOf('$axis[x]:\n  nth: first\n\n  # comment\n  where: far', 'far'), /^string\.unquoted/);
assert.match(scopeOf('$axis[x]:\n  nth: first\n$t: int', 'int'), /^support\.type\.primitive/);
assert.match(scopeOf('$axis[x]:\n  nth: first\n$position:\n  nth: int', 'int'), /^support\.type\.primitive/);
assert.match(scopeOf('$axis[x]:\n  nth: first\nfeature function a\n  since: int', 'since'), /^meta\.field\.name/);

// '$list' and '$list.key' are replaced in an id, a doc and a metadata value
const repeated = 'feature function evaluate/$spline > Get the point of a $spline.name at a time.';
assert.match(scopeOf(repeated, 'evaluate/'), /^entity\.name\.function/);
assert.match(scopeOf(repeated, '$spline'), /^keyword\.control\.bsdoc/);
assert.match(scopeOf(repeated, 'spline >'), /^variable\.parameter/);
assert.match(scopeOf(repeated, 'spline.name'), /^variable\.parameter/);
assert.match(scopeOf(repeated, '.name'), /^punctuation\.accessor/);
assert.match(scopeOf(repeated, 'name at'), /^variable\.other\.property/);
assert.match(scopeOf(repeated, ' at a time'), /^comment\.block\.documentation/);
assert.match(scopeOf('feature predicate $point/$axis', 'axis'), /^variable\.parameter/);
assert.match(scopeOf('  since $spline.since', 'spline'), /^variable\.parameter/);
assert.match(scopeOf('  since $spline.since', 'since', ), /^support\.type\.property-name/);
assert.match(scopeOf('  since $spline.since', '.since'), /^punctuation\.accessor/);
assert.match(scopeOf('  output result: float > the $axis coordinate.', 'axis'), /^variable\.parameter/);
assert.match(scopeOf('  output result: float > the $axis coordinate.', 'coordinate'), /^comment\.block\.documentation/);
assert.match(scopeOf('  > ends with $spline.name.', 'name.'), /^variable\.other\.property/);
assert.match(scopeOf('  > costs $5', '$5'), /^comment\.block\.documentation/, "'$5' is not a name");

// a doc is free text, so the words inside it stay documentation
const described = '  input macro: $s > a macro holds a struct of int';
assert.match(scopeOf(described, 'a macro holds'), /^comment\.block\.documentation/);
assert.match(scopeOf(described, 'struct of'), /^comment\.block\.documentation/);
assert.match(scopeOf(described, 'macro:'), /^storage\.type\.kind/);

console.log('ok');
