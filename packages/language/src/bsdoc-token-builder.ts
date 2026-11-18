import type { CustomPatternMatcherFunc, IToken, TokenType, TokenVocabulary } from 'chevrotain';
import { IndentationAwareTokenBuilder, type GrammarAST, type TokenBuilderOptions } from 'langium';

const LINE_STARTS = new Set(['NL', 'INDENT', 'DEDENT']);

/** The words which, opening a line, are followed by free text. */
const VALUE_WORDS = new Set(['name', 'slug', 'version', 'documentation', 'tags', 'weak_dependencies', 'authors', 'contributors', 'since']);

const REGISTRIES = new Set(['function', 'predicate', 'loot_table', 'context_int_provider', 'context_float_provider', 'block_tag', 'entity_type_tag', 'structure']);
const ROLES = new Set(['input', 'output']);
const KINDS = new Set(['state', 'result', 'success', 'macro', 'storage', 'arguments']);

const restOfLine = /[^ \t\r\n][^\r\n]*/y;
/** What makes a word a field name rather than a language word: 'since: int', 'since?: int'. */
const fieldColon = /\??[ \t]*:/y;
const featureId = /[A-Za-z0-9_.$:\/-]+/y;
const resourceLocation = /[a-z0-9_-]+(?:\.[a-z0-9_-]+)+:[a-z0-9_.\/-]+/y;
/** The indentation of a line which holds a tab, and is neither blank nor a comment. */
const leadingTabs = /([ \t]*\t[ \t]*)[^ \t\r\n#]/y;

/** The indentation of one level. */
const LEVEL = 2;

/** A comment is a whole line: after code '#' opens an attribute, and in a doc or a text it is text. */
const matchComment: CustomPatternMatcherFunc = (text, offset) => {
    if (text[offset] !== '#' || text.slice(text.lastIndexOf('\n', offset - 1) + 1, offset).trim() !== '') {
        return null;
    }
    const end = text.indexOf('\n', offset);
    return [text.slice(offset, end === -1 ? text.length : end).replace(/\r$/, '')];
};

/**
 * Builds the indentation tokens, and the tokens whose pattern depends on the ones before them
 * on the line: Chevrotain has no contextual lexer, and free text would otherwise match everywhere.
 */
export class BsdocTokenBuilder extends IndentationAwareTokenBuilder {

    /** Set by the lexer when the text is cut at the cursor, for completion. */
    partial = false;

    /** Whether each open block, innermost last, holds the properties of a list. */
    private listBlocks: boolean[] = [];

    private readonly customTokens: Record<string, TokenType> = {
        TEXT: { name: 'TEXT', PATTERN: (text, offset, tokens) => this.matchText(text, offset, tokens), LINE_BREAKS: false },
        FEATURE_ID: { name: 'FEATURE_ID', PATTERN: (text, offset, tokens) => this.matchFeatureId(text, offset, tokens), LINE_BREAKS: false },
        RESOURCE_LOCATION: { name: 'RESOURCE_LOCATION', PATTERN: (text, offset, tokens) => this.matchResourceLocation(text, offset, tokens), LINE_BREAKS: false },
        SL_COMMENT: { name: 'SL_COMMENT', PATTERN: matchComment, LINE_BREAKS: false, GROUP: 'hidden', START_CHARS_HINT: ['#'] },
    };

    override buildTokens(grammar: GrammarAST.Grammar, options?: TokenBuilderOptions): TokenVocabulary {
        const tokens = super.buildTokens(grammar, options) as TokenType[];
        // the contextual tokens may start like a keyword: they go right after DEDENT, INDENT and WS
        const contextual = ['TEXT', 'FEATURE_ID', 'RESOURCE_LOCATION'].map(name => this.customTokens[name]);
        const others = tokens.filter(token => !contextual.includes(token));
        return [...others.slice(0, 3), ...contextual, ...others.slice(3)];
    }

    override buildTerminalToken(terminal: GrammarAST.TerminalRule): TokenType {
        return this.customTokens[terminal.name] ?? super.buildTerminalToken(terminal);
    }

    /** The value of a line opened by a value word, unless a colon makes that word a field, or of a list property. */
    private matchText(text: string, offset: number, tokens: IToken[]): [string] | null {
        const last = tokens.length - 1;
        if (VALUE_WORDS.has(nameOf(tokens, last)) && startsLine(tokens, last)) {
            fieldColon.lastIndex = offset;
            if (fieldColon.test(text)) {
                return null;
            }
        } else if (!(nameOf(tokens, last) === ':' && last >= 1 && startsLine(tokens, last - 1) && this.listBlocks.at(-1))) {
            return null;
        }
        restOfLine.lastIndex = offset;
        const match = restOfLine.exec(text);
        return match ? [match[0].trimEnd()] : null;
    }

    /** After 'feature' and a registry. */
    private matchFeatureId(text: string, offset: number, tokens: IToken[]): RegExpExecArray | null {
        const last = tokens.length - 1;
        if (!REGISTRIES.has(nameOf(tokens, last)) || nameOf(tokens, last - 1) !== 'feature' || !startsLine(tokens, last - 1)) {
            return null;
        }
        featureId.lastIndex = offset;
        return featureId.exec(text);
    }

    /** After 'input' or 'output' and a kind: anywhere else 'a.b:c' is a name, a colon and a type. */
    private matchResourceLocation(text: string, offset: number, tokens: IToken[]): RegExpExecArray | null {
        const last = tokens.length - 1;
        if (!KINDS.has(nameOf(tokens, last)) || !ROLES.has(nameOf(tokens, last - 1)) || !startsLine(tokens, last - 1)) {
            return null;
        }
        resourceLocation.lastIndex = offset;
        return resourceLocation.exec(text);
    }

    /** A blank, comment or tab-indented line keeps the indentation of the block; a line cut at the cursor is not blank. */
    protected override matchWhitespace(text: string, offset: number, tokens: IToken[], groups: Record<string, IToken[]>) {
        const result = super.matchWhitespace(text, offset, tokens, groups);
        const next = text[offset + result.currIndentLevel];
        const blank = next === '#' || next === '\n' || next === '\r' || (next === undefined && !this.partial);
        return blank || result.match?.[0].includes('\t') ? { ...result, currIndentLevel: result.prevIndentLevel } : result;
    }

    protected override indentMatcher(text: string, offset: number, tokens: IToken[], groups: Record<string, IToken[]>): ReturnType<CustomPatternMatcherFunc> {
        const previous = this.indentationStack.at(-1)!;
        const match = super.indentMatcher(text, offset, tokens, groups);
        if (match) {
            // the line before, which the last token ends, is the head of a list: '$axis[x, y]:'
            let first = tokens.length - 2;
            while (first > 0 && !startsLine(tokens, first)) {
                first--;
            }
            this.listBlocks.push(nameOf(tokens, first) === 'VARIABLE' && nameOf(tokens, first + 1) === '[');
            if (match[0].length - previous !== LEVEL) {
                this.report(text, offset, match[0].length, `a block is indented by ${LEVEL} spaces, not ${match[0].length - previous}`);
            }
        }
        return match;
    }

    protected override dedentMatcher(text: string, offset: number, tokens: IToken[], groups: Record<string, IToken[]>): ReturnType<CustomPatternMatcherFunc> {
        // the first matcher tried at the start of a line: tabs are reported here, once
        if (this.isStartOfLine(text, offset)) {
            leadingTabs.lastIndex = offset;
            const tabs = leadingTabs.exec(text);
            if (tabs) {
                this.report(text, offset, tabs[1].length, 'a line is indented with spaces, not tabs');
            }
        }
        const reported = this.diagnostics.length;
        const match = super.dedentMatcher(text, offset, tokens, groups);
        if (this.diagnostics.length > reported) {
            this.diagnostics.at(-1)!.message = 'a line is indented like the block it belongs to, this one like none';
        }
        this.listBlocks.length = this.indentationStack.length - 1;
        return match;
    }

    override flushRemainingDedents(text: string): IToken[] {
        this.listBlocks = [];
        return super.flushRemainingDedents(text);
    }

    private report(text: string, offset: number, length: number, message: string): void {
        this.diagnostics.push({ severity: 'error', message, offset, length, line: this.getLineNumber(text, offset), column: 1 });
    }
}

const nameOf = (tokens: IToken[], index: number): string => tokens[index]?.tokenType.name ?? '';

/** Whether the token at `index` is the first of its line. */
const startsLine = (tokens: IToken[], index: number): boolean => index === 0 || LINE_STARTS.has(nameOf(tokens, index - 1));
