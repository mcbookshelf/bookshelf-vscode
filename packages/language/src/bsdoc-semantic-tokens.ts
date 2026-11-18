import { GrammarUtils, type AstNode } from 'langium';
import { AbstractSemanticTokenProvider, type SemanticTokenAcceptor } from 'langium/lsp';
import { SemanticTokenModifiers, SemanticTokenTypes } from 'vscode-languageserver';
import { listsOf, moduleOf, rangeIn, referencesIn, textPartsOf } from './bsdoc-model.js';
import { isDefinition, isListProperty, isListType, isPaste, isPrimitiveType, isReferenceType, isStructType } from './generated/ast.js';

/**
 * Refines the TextMate grammar where it cannot tell: a 'key: text' line is a property under a
 * list and a field elsewhere, and a '$name' in a text is replaced only when it is a list. The
 * '$' of a name is left out of its token, to keep the keyword colour TextMate gives it.
 */
export class BsdocSemanticTokenProvider extends AbstractSemanticTokenProvider {

    protected override highlightElement(node: AstNode, acceptor: SemanticTokenAcceptor): void {
        if (isListProperty(node)) {
            acceptor({ node, property: 'key', type: SemanticTokenTypes.property });
            acceptor({ node, property: 'value', type: SemanticTokenTypes.string });
        } else if (isDefinition(node)) {
            this.highlightName(node, 'name', acceptor, SemanticTokenModifiers.declaration);
            node.items.forEach((_, index) => acceptor({ node, property: 'items', index, type: SemanticTokenTypes.enumMember }));
        } else if (isPaste(node) || isReferenceType(node)) {
            this.highlightName(node, 'reference', acceptor);
        }
        if (isPrimitiveType(node) || isListType(node) || isStructType(node) || isReferenceType(node)) {
            acceptor({ node, property: 'attributes', type: SemanticTokenTypes.decorator });
        }
        // '$list' and '$list.key' in an id, a doc or a metadata value: the name a parameter, the key a property
        for (const part of textPartsOf(node)) {
            for (const reference of referencesIn(part.text, listsOf(moduleOf(node)))) {
                if (!reference.list) {
                    continue;
                }
                acceptor({ range: rangeIn(part, reference.offset + 1, reference.name.length), type: SemanticTokenTypes.parameter });
                if (reference.key !== undefined) {
                    acceptor({ range: rangeIn(part, reference.offset + reference.name.length + 2, reference.key.length), type: SemanticTokenTypes.property });
                }
            }
        }
    }

    private highlightName(node: AstNode, property: string, acceptor: SemanticTokenAcceptor, modifier?: string): void {
        const cst = GrammarUtils.findNodeForProperty(node.$cstNode, property);
        if (cst && cst.length > 1) {
            const { start, end } = cst.range;
            acceptor({ range: { start: { line: start.line, character: start.character + 1 }, end }, type: SemanticTokenTypes.parameter, modifier });
        }
    }
}
