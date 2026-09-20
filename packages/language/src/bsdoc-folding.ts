import { CstUtils, type AstNode, type CstNode, type LangiumDocument } from 'langium';
import { DefaultFoldingRangeProvider } from 'langium/lsp';
import { FoldingRange, FoldingRangeKind } from 'vscode-languageserver';
import { isFeature, isListType, isStructType } from './generated/ast.js';

/**
 * A construct ends with an NL token which swallows the blank and comment lines up to the next
 * construct, so a fold taken from the node's range would run until the next feature. The fold
 * ends at the last line holding content instead, and before a closing brace as usual.
 */
export class BsdocFoldingRangeProvider extends DefaultFoldingRangeProvider {

    protected override shouldProcess(node: AstNode): boolean {
        return isFeature(node) || isStructType(node) || isListType(node);
    }

    protected override toFoldingRange(document: LangiumDocument, node: CstNode, kind?: string): FoldingRange | undefined {
        if (kind === FoldingRangeKind.Comment) {
            return super.toFoldingRange(document, node, kind);
        }
        const last = CstUtils.flattenCst(node).filter(leaf => leaf.tokenType.name !== 'NL').toArray().at(-1);
        if (!last) {
            return undefined;
        }
        const start = node.range.start;
        let end = last.range.end;
        if (end.line - start.line < 2) {
            return undefined;
        }
        if (last.text === '}' && isStructType(node.astNode)) {
            end = document.textDocument.positionAt(document.textDocument.offsetAt({ line: end.line, character: 0 }) - 1);
        }
        return FoldingRange.create(start.line, end.line, start.character, end.character, kind);
    }
}
