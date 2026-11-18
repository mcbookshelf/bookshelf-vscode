import { AstUtils, CstUtils, type AstNode, type LangiumDocument, type LeafCstNode, type MaybePromise } from 'langium';
import { AstNodeHoverProvider } from 'langium/lsp';
import type { Hover, HoverParams } from 'vscode-languageserver';
import { docOf, expandedNames, listsInId, listsOf, metadataOf, moduleOf, referencesIn, shapeOf, typeOf, typeToString } from './bsdoc-model.js';
import {
    isContext,
    isDefinition,
    isFeature,
    isField,
    isSlot,
    type Context,
    type Definition,
    type Feature,
    type Field,
    type Slot,
} from './generated/ast.js';

/** The tokens in which '$list' and '$list.key' are replaced. */
const TEXT_TOKENS = new Set(['DOC', 'FEATURE_ID', 'TEXT']);

/** How many names of a repeated feature, and how many lines of a block, a hover shows. */
const SHOWN = 12;

const isHoverable = (node: AstNode): node is Definition | Feature | Slot | Context | Field =>
    isDefinition(node) || isFeature(node) || isSlot(node) || isContext(node) || isField(node);

const code = (text: string) => '```bs\n' + text + '\n```';
const doc = (text: string | undefined) => text ? `\n\n${text}` : '';

/** Shows what a word stands for: a line with its type, a '$' definition, a feature with what it inherits, the items of a '$list' in a text. */
export class BsdocHoverProvider extends AstNodeHoverProvider {

    override async getHoverContent(document: LangiumDocument, params: HoverParams): Promise<Hover | undefined> {
        const offset = document.textDocument.offsetAt(params.position);
        const root = document.parseResult.value.$cstNode;
        const leaf = root && CstUtils.findLeafNodeAtOffset(root, offset);
        const list = leaf && this.listContent(leaf, offset);
        if (list) {
            return { contents: { kind: 'markdown', value: list } };
        }
        const hover = await super.getHoverContent(document, params);
        if (hover || !leaf) {
            return hover;
        }
        // a word of a type or of a line: what the line stands for
        const node = AstUtils.getContainerOfType(leaf.astNode, isHoverable);
        const content = node && await this.getAstNodeHoverContent(node);
        return content ? { contents: { kind: 'markdown', value: content } } : undefined;
    }

    protected override getAstNodeHoverContent(node: AstNode): MaybePromise<string | undefined> {
        if (isDefinition(node)) {
            return this.definitionContent(node);
        }
        if (isFeature(node)) {
            return this.featureContent(node);
        }
        if (isSlot(node)) {
            const feature = AstUtils.getContainerOfType(node, isFeature);
            const target = [node.id, node.path].filter(Boolean).join(' ');
            const type = typeOf(node, feature?.registry);
            return code(`${node.role} ${node.kind}${target ? ' ' + target : ''}${type ? ': ' + type : ''}`) + doc(docOf(node));
        }
        if (isContext(node)) {
            const type = typeOf(node);
            return code(`${node.kind}${type ? ': ' + type : ''}`) + doc(docOf(node));
        }
        if (isField(node)) {
            return code(`${node.name}${node.optional ? '?' : ''}: ${typeOf(node) ?? ''}`) + doc(docOf(node));
        }
        return undefined;
    }

    /** A '$list' or '$list.key' inside an id, a doc or a metadata value: its items, with the text each gives for the key. */
    private listContent(leaf: LeafCstNode, offset: number): string | undefined {
        if (!TEXT_TOKENS.has(leaf.tokenType.name)) {
            return undefined;
        }
        const at = offset - leaf.offset;
        const reference = referencesIn(leaf.text, listsOf(moduleOf(leaf.astNode))).find(r => r.list && r.offset <= at && at <= r.offset + r.length);
        const list = reference?.list;
        if (!list) {
            return undefined;
        }
        const key = reference.key;
        const items = [...list.items.values()];
        return code(`$${list.name}${key ? '.' + key : ''}`) + '\n\n' + (key
            ? items.map(item => `- \`${item.name}\`: ${item.properties.get(key)?.value ?? '*not defined*'}`).join('\n')
            : items.map(item => `\`${item.name}\``).join(', '));
    }

    private definitionContent(definition: Definition): string {
        const name = `$${definition.name}`;
        if (definition.list) {
            const list = listsOf(moduleOf(definition)).get(definition.name)!;
            const keys = [...list.keys].map(key => `\`${key}\``);
            return code(`${name}[${[...list.items.keys()].join(', ')}]`) + (keys.length > 0 ? `\n\nProperties: ${keys.join(', ')}` : '');
        }
        if (definition.type && definition.body.length === 0) {
            return code(`${name}: ${typeToString(definition.type)}`) + doc(definition.description);
        }
        // a struct or lines: the block as written, without its docs
        const lines = (definition.$cstNode?.text ?? name).split(/\r?\n/).map(line => line.replace(/\s*>.*$/, '')).filter(line => line.trim());
        const shown = lines.length > SHOWN ? [...lines.slice(0, SHOWN), '  ...'] : lines;
        return code(shown.join('\n')) + doc(definition.description) + (shapeOf(definition) === 'lines' ? '\n\nLines pasted in a feature.' : '');
    }

    private featureContent(feature: Feature): string {
        const metadata = metadataOf(feature);
        const names = listsInId(feature).length > 0 ? expandedNames(feature).map(name => `\`${name}\``) : [];
        const details = [
            names.length > 0 ? `Repeated as: ${names.slice(0, SHOWN).join(', ')}${names.length > SHOWN ? `, and ${names.length - SHOWN} more` : ''}` : '',
            metadata.get('authors')?.value ? `Authors: ${metadata.get('authors')!.value}` : '',
            metadata.get('contributors')?.value ? `Contributors: ${metadata.get('contributors')!.value}` : '',
            metadata.get('since')?.value ? `Since: ${metadata.get('since')!.value}` : '',
            metadata.has('deprecated') ? 'Deprecated.' : '',
            metadata.has('experimental') ? 'Experimental.' : '',
        ];
        return code(`feature ${feature.registry} ${feature.id}`) + doc(feature.description) + details.filter(Boolean).map(doc).join('');
    }
}
