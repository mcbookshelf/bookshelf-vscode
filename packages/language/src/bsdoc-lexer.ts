import { createTokenInstance } from 'chevrotain';
import { DefaultLexer, type IndentationLexingReport, type LangiumCoreServices, type LexerResult, type TokenizeOptions } from 'langium';
import type { BsdocTokenBuilder } from './bsdoc-token-builder.js';

const LAYOUT = new Set(['NL', 'INDENT', 'DEDENT']);

/**
 * Ends the last line when it has no line end, closes the blocks left open at the end of the
 * file, and drops the blocks a comment or a blank line opened. A text cut at the cursor, for
 * completion, keeps its blocks open unless the cursor starts a line.
 */
export class BsdocLexer extends DefaultLexer {

    private readonly builder: BsdocTokenBuilder;

    constructor(services: LangiumCoreServices) {
        super(services);
        this.builder = services.parser.TokenBuilder as BsdocTokenBuilder;
    }

    override tokenize(text: string, options?: TokenizeOptions): LexerResult {
        const partial = options?.mode === 'partial';
        this.builder.partial = partial;
        const result = super.tokenize(text, options);
        const report = result.report as IndentationLexingReport;
        const tokens = result.tokens;
        const last = tokens.at(-1);
        if (!partial && last && !LAYOUT.has(last.tokenType.name)) {
            const line = last.endLine ?? 1;
            const column = last.endColumn ?? 0;
            tokens.push(createTokenInstance(this.definition['NL'], '', text.length, text.length, line, line, column + 1, column));
        }
        if (!partial || /[\r\n]$/.test(text)) {
            tokens.push(...report.remainingDedents);
        }
        report.remainingDedents = [];
        result.tokens = [];
        for (const token of tokens) {
            if (token.tokenType.name === 'DEDENT' && result.tokens.at(-1)?.tokenType.name === 'INDENT') {
                result.tokens.pop();
            } else {
                result.tokens.push(token);
            }
        }
        return result;
    }
}
