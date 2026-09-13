import type { CustomPatternMatcherFunc, IMultiModeLexerDefinition, TokenType, TokenVocabulary } from 'chevrotain';
import { GrammarAST, IndentationAwareTokenBuilder, type TokenBuilderOptions } from 'langium';

/** Free text: anything up to the end of the line, leading whitespace left to WS. */
const restOfLine = /[^ \t\r\n][^\r\n]*/y;

/**
 * Matches TEXT only as the value of a property, that is after an ID and its ':' which open a
 * line outside of any struct. A context-free "rest of the line" terminal would match everywhere
 * and swallow the whole document, so the decision is taken here, where the tokens scanned so
 * far are available. Skipped whitespace is absent from that list, which is why 'name:   X'
 * still sees ':' as the previous token.
 *
 * A struct entry has the same 'ID :' shape and may open a line too, hence the brace count.
 */
const matchText: CustomPatternMatcherFunc = (text, offset, tokens) => {
    const name = (index: number) => tokens[index]?.tokenType.name;
    if (name(tokens.length - 1) !== ':' || name(tokens.length - 2) !== 'ID') {
        return null;
    }
    let before = tokens.length - 3;
    while (name(before) === 'INDENT' || name(before) === 'DEDENT') {
        before--;
    }
    if (before >= 0 && name(before) !== 'NL') {
        return null;
    }
    let depth = 0;
    for (const token of tokens) {
        depth += token.tokenType.name === '{' ? 1 : token.tokenType.name === '}' ? -1 : 0;
    }
    if (depth > 0) {
        return null;
    }
    restOfLine.lastIndex = offset;
    const match = restOfLine.exec(text);
    // trailing whitespace is dropped by consuming less than was matched
    return match ? [match[0].trimEnd()] : null;
};

const textTokenType: TokenType = { name: 'TEXT', PATTERN: matchText, LINE_BREAKS: false };

/**
 * Gives the TEXT terminal declared in 'terminals.langium' its real, context-sensitive pattern.
 */
export class BookshelfDocTokenBuilder extends IndentationAwareTokenBuilder {

    override buildTokens(grammar: GrammarAST.Grammar, options?: TokenBuilderOptions): TokenVocabulary {
        const vocabulary = super.buildTokens(grammar, options);
        // TEXT is a terminal, so it would otherwise be tried after every keyword it may contain
        for (const mode of Object.values((vocabulary as IMultiModeLexerDefinition).modes)) {
            mode.unshift(...mode.splice(mode.indexOf(textTokenType), 1));
        }
        return vocabulary;
    }

    override buildTerminalToken(terminal: GrammarAST.TerminalRule): TokenType {
        return terminal.name === 'TEXT' ? textTokenType : super.buildTerminalToken(terminal);
    }
}
