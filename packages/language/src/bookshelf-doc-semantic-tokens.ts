import type { AstNode } from 'langium';
import { AbstractSemanticTokenProvider, type SemanticTokenAcceptor } from 'langium/lsp';
import { SemanticTokenModifiers, SemanticTokenTypes } from 'vscode-languageserver';
import {
    isAbstractFeatureSlotExpression, isFeature, isProperty, isStorage, isStructTypeEntry, isVariable, isVariableReference,
} from './generated/ast.js';

/**
 * Tells apart what the TextMate grammar cannot: a 'key: value' line is a document or feature
 * property outside a struct and an entry inside one, and a name is a declaration or a reference.
 */
export class BookshelfDocSemanticTokenProvider extends AbstractSemanticTokenProvider {

    protected override highlightElement(node: AstNode, acceptor: SemanticTokenAcceptor): void {
        if (isProperty(node)) {
            acceptor({ node, property: 'key', type: SemanticTokenTypes.keyword });
            acceptor({ node, property: 'value', type: SemanticTokenTypes.string });
        } else if (isStructTypeEntry(node)) {
            acceptor({ node, property: 'property', type: SemanticTokenTypes.property, modifier: SemanticTokenModifiers.declaration });
            acceptor({ node, property: 'description', type: SemanticTokenTypes.comment });
        } else if (isAbstractFeatureSlotExpression(node)) {
            acceptor({ node, property: 'description', type: SemanticTokenTypes.comment });
            if (isVariableReference(node)) {
                acceptor({ node, property: 'reference', type: SemanticTokenTypes.variable });
            }
        } else if (isVariable(node)) {
            acceptor({ node, property: 'name', type: SemanticTokenTypes.variable, modifier: SemanticTokenModifiers.declaration });
        } else if (isFeature(node)) {
            acceptor({ node, property: 'registry', type: SemanticTokenTypes.class });
            acceptor({ node, property: 'id', type: SemanticTokenTypes.function, modifier: SemanticTokenModifiers.declaration });
        } else if (isStorage(node)) {
            acceptor({ node, property: 'id', type: SemanticTokenTypes.namespace });
            acceptor({ node, property: 'path', type: SemanticTokenTypes.namespace });
        }
    }
}
