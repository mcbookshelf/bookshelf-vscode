import { createTokenInstance } from 'chevrotain';
import { DefaultLexer, type LexerResult, type TokenizeOptions } from 'langium';

/**
 * Every construct ends at a line end, so a file whose last line has none would end in a parse
 * error: this lexer adds the missing NL. Not when parsing partially for completion, where the
 * text is cut at the cursor and the missing line end is the point.
 */
export class BsdocLexer extends DefaultLexer {

    override tokenize(text: string, options?: TokenizeOptions): LexerResult {
        const result = super.tokenize(text, options);
        const last = result.tokens.at(-1);
        if (last && last.tokenType.name !== 'NL' && options?.mode !== 'partial') {
            result.tokens.push(createTokenInstance(
                this.definition['NL'], '', text.length, text.length, last.endLine ?? 1, last.endLine ?? 1, (last.endColumn ?? 0) + 1, last.endColumn ?? 0,
            ));
        }
        return result;
    }
}
