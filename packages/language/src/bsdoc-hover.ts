import { AstUtils, CstUtils, type AstNode, type LangiumDocument, type MaybePromise } from 'langium';
import { AstNodeHoverProvider } from 'langium/lsp';
import type { Hover, HoverParams } from 'vscode-languageserver';
import { docOf, propertyOf, typeOf, typeToString } from './bsdoc-model.js';
import { detailOf } from './bsdoc-completion.js';
import { isDeclaration, isFeature, isSlot, isStructEntry, isVariable, type Feature, type Slot, type StructEntry, type Variable } from './generated/ast.js';

/**
 * Shows what a name or a keyword stands for: a slot with its type, the default one when it
 * declares none, a '$' definition with its declaration or type, a feature with its authors, and
 * the doc of each.
 */
export class BsdocHoverProvider extends AstNodeHoverProvider {

    override async getHoverContent(document: LangiumDocument, params: HoverParams): Promise<Hover | undefined> {
        const hover = await super.getHoverContent(document, params);
        if (hover) {
            return hover;
        }
        const root = document.parseResult.value.$cstNode;
        const leaf = root && CstUtils.findLeafNodeAtOffset(root, document.textDocument.offsetAt(params.position));
        if (!leaf) {
            return undefined;
        }
        const node = isDeclaration(leaf.astNode) ? leaf.astNode.$container : leaf.astNode;
        const content = await this.getAstNodeHoverContent(node);
        return content ? { contents: { kind: 'markdown', value: content } } : undefined;
    }

    protected override getAstNodeHoverContent(node: AstNode): MaybePromise<string | undefined> {
        if (isVariable(node)) {
            return this.variableContent(node);
        }
        if (isSlot(node)) {
            return this.slotContent(node);
        }
        if (isFeature(node)) {
            return this.featureContent(node);
        }
        if (isStructEntry(node)) {
            return this.entryContent(node);
        }
        return undefined;
    }

    private variableContent(variable: Variable): string {
        return code(`$${variable.name} = ${detailOf(variable)}`) + doc(variable.description);
    }

    private slotContent(slot: Slot): string | undefined {
        const declaration = slot.declaration ?? slot.reference?.ref?.declaration;
        if (!declaration) {
            return undefined;
        }
        const feature = AstUtils.getContainerOfType(slot, isFeature);
        const target = [declaration.id, ...declaration.path].filter(Boolean).join(' ');
        const type = typeOf(declaration, feature?.registry);
        return code(`${slot.role} ${declaration.kind}${target ? ' ' + target : ''}${type ? ': ' + type : ''}`) + doc(docOf(slot));
    }

    private featureContent(feature: Feature): string {
        const authors = propertyOf(feature, 'authors')?.value;
        return code(`feature ${feature.registry} ${feature.id}`) + doc(feature.description) + (authors ? `\n\nAuthors: ${authors}` : '');
    }

    private entryContent(entry: StructEntry): string {
        return code(`${entry.name}${entry.optional ? '?' : ''}: ${typeToString(entry.type)}`) + doc(entry.description);
    }
}

const code = (text: string) => '```bs\n' + text + '\n```';
const doc = (text: string | undefined) => text ? `\n\n${text}` : '';
