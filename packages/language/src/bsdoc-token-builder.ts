import type { CustomPatternMatcherFunc, IMultiModeLexerDefinition, TokenType, TokenVocabulary } from 'chevrotain';
import { DefaultTokenBuilder, type GrammarAST, type TokenBuilderOptions } from 'langium';

/** Free text: anything up to the end of the line, leading whitespace left to WS. */
const restOfLine = /[^ \t\r\n][^\r\n]*/y;

/**
 * Matches TEXT only as the value of a property, that is after an ID and its ':' which open a
 * line outside of any struct. A context-free "rest of the line" terminal would match everywhere
 * and swallow the whole document, so the decision is taken here, where the tokens scanned so
 * far are available. Skipped whitespace and hidden comments are absent from that list, which is
 * why 'name:   X' still sees ':' as the previous token.
 *
 * A struct entry has the same 'ID :' shape and opens a line too, hence the brace count. A
 * storage path ('storage in: int') never opens a line, so it is never mistaken for a key.
 */
const matchText: CustomPatternMatcherFunc = (text, offset, tokens) => {
    const name = (index: number) => tokens[index]?.tokenType.name;
    const last = tokens.length - 1;
    if (name(last) !== ':' || name(last - 1) !== 'ID' || (last >= 2 && name(last - 2) !== 'NL')) {
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

/**
 * Matches a comment only when '#' is the first non-blank character of its line: after code, '#'
 * opens an attribute, and inside a doc or a property value it is text. NL swallows the comment
 * lines that follow a line end, so this is only reached at the start and the end of the file.
 */
const matchComment: CustomPatternMatcherFunc = (text, offset) => {
    if (text.charCodeAt(offset) !== 0x23 /* # */) {
        return null;
    }
    for (let index = offset - 1; index >= 0; index--) {
        const char = text[index];
        if (char === '\n' || char === '\r') {
            break;
        }
        if (char !== ' ' && char !== '\t') {
            return null;
        }
    }
    const end = text.indexOf('\n', offset);
    const comment = text.slice(offset, end === -1 ? text.length : end).replace(/\r$/, '');
    return [comment];
};

const textTokenType: TokenType = { name: 'TEXT', PATTERN: matchText, LINE_BREAKS: false };
const commentTokenType: TokenType = { name: 'SL_COMMENT', PATTERN: matchComment, LINE_BREAKS: false, GROUP: 'hidden', START_CHARS_HINT: ['#'] };

/**
 * Gives the TEXT and SL_COMMENT terminals declared in 'terminals.langium' their real,
 * context-sensitive patterns.
 */
export class BsdocTokenBuilder extends DefaultTokenBuilder {

    override buildTokens(grammar: GrammarAST.Grammar, options?: TokenBuilderOptions): TokenVocabulary {
        const vocabulary = super.buildTokens(grammar, options);
        const modes = Array.isArray(vocabulary) ? [vocabulary] : Object.values((vocabulary as IMultiModeLexerDefinition).modes);
        for (const mode of modes) {
            // TEXT may start with a keyword, so it must be tried before every keyword
            mode.unshift(...mode.splice(mode.indexOf(textTokenType), 1));
        }
        return vocabulary;
    }

    override buildTerminalToken(terminal: GrammarAST.TerminalRule): TokenType {
        switch (terminal.name) {
            case 'TEXT': return textTokenType;
            case 'SL_COMMENT': return commentTokenType;
            default: return super.buildTerminalToken(terminal);
        }
    }
}
