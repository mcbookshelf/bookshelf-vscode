import { GrammarUtils, type AstNode } from 'langium';
import { AbstractSemanticTokenProvider, type SemanticTokenAcceptor } from 'langium/lsp';
import { SemanticTokenModifiers, SemanticTokenTypes } from 'vscode-languageserver';
import { isListType, isPrimitiveType, isProperty, isReferenceType, isSlot, isStructType, isVariable } from './generated/ast.js';

/**
 * Refines the TextMate grammar where it cannot tell: a 'key: value' line is a property outside
 * a struct and an entry inside one. A '$' name is a parameter, its '$' left out of the token so
 * that it keeps the keyword colour TextMate gives it. Ids, paths, entries and docs are left to
 * TextMate, whose scopes are finer than one token, or uncoloured on purpose.
 */
export class BsdocSemanticTokenProvider extends AbstractSemanticTokenProvider {

    protected override highlightElement(node: AstNode, acceptor: SemanticTokenAcceptor): void {
        if (isProperty(node)) {
            acceptor({ node, property: 'key', type: SemanticTokenTypes.property });
            acceptor({ node, property: 'value', type: SemanticTokenTypes.string });
        } else if (isVariable(node)) {
            this.highlightName(node, 'name', acceptor, SemanticTokenModifiers.declaration);
        } else if (isSlot(node)) {
            this.highlightName(node, 'reference', acceptor);
        } else if (isReferenceType(node)) {
            this.highlightName(node, 'reference', acceptor);
        }
        if (isPrimitiveType(node) || isListType(node) || isStructType(node) || isReferenceType(node)) {
            acceptor({ node, property: 'attributes', type: SemanticTokenTypes.decorator });
        }
    }

    /** A parameter token over a '$' name, the '$' excluded. */
    private highlightName(node: AstNode, property: string, acceptor: SemanticTokenAcceptor, modifier?: string): void {
        const cst = GrammarUtils.findNodeForProperty(node.$cstNode, property);
        if (!cst || cst.length < 2) {
            return;
        }
        const { start, end } = cst.range;
        acceptor({ range: { start: { line: start.line, character: start.character + 1 }, end }, type: SemanticTokenTypes.parameter, modifier });
    }
}
