import { CstUtils, type AstNode, type CstNode, type LangiumDocument } from 'langium';
import { DefaultFoldingRangeProvider } from 'langium/lsp';
import { FoldingRange, FoldingRangeKind } from 'vscode-languageserver';
import { isDefinition, isFeature, isField, isSlot } from './generated/ast.js';

const LAYOUT = new Set(['NL', 'INDENT', 'DEDENT']);

/** A block ends with an NL which swallows the blank and comment lines after it: its fold ends at its last line of content instead. */
export class BsdocFoldingRangeProvider extends DefaultFoldingRangeProvider {

    protected override shouldProcess(node: AstNode): boolean {
        return isFeature(node) || isDefinition(node) || isSlot(node) || isField(node);
    }

    protected override toFoldingRange(document: LangiumDocument, node: CstNode, kind?: string): FoldingRange | undefined {
        if (kind === FoldingRangeKind.Comment) {
            return super.toFoldingRange(document, node, kind);
        }
        const last = CstUtils.flattenCst(node).filter(leaf => !LAYOUT.has(leaf.tokenType.name)).toArray().at(-1);
        const start = node.range.start;
        const end = last?.range.end;
        return end && end.line > start.line ? FoldingRange.create(start.line, end.line, start.character, end.character, kind) : undefined;
    }
}
