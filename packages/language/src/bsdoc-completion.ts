import { AstUtils, GrammarAST, type AstNode, type AstNodeDescription, type ReferenceInfo, type Stream } from 'langium';
import { DefaultCompletionProvider, type CompletionAcceptor, type CompletionContext, type CompletionValueItem, type LangiumServices, type NextFeature } from 'langium/lsp';
import { CompletionItemKind, type CompletionOptions, type InsertReplaceEdit, type TextEdit } from 'vscode-languageserver';
import { CONTEXT_KIND_TYPES, DATA_PRIMITIVES, KINDS_WITH_DATA, REGISTRY_KINDS, isSlotDefinition, typeOf, typeToString } from './bsdoc-model.js';
import {
    isDeclaration, isFeature, isListType, isReferenceType, isSlot, isStructEntry, isStructType, isVariable,
    type Kind, type Registry, type Role, type Variable,
} from './generated/ast.js';

/** The rules whose keywords name a kind, and the ones whose keywords name a primitive type. */
const KIND_RULES = new Set(['KindName', 'Declaration']);
const TYPE_RULES = new Set(['PrimitiveName', 'ArrayElement']);

const REGISTRIES = new Set(['function', 'function_tag', 'predicate', 'loot_table', 'context_int_provider', 'context_float_provider', 'block_tag', 'entity_type_tag']);
const ROLES = new Set(['input', 'context', 'output']);
const RESOURCE_LOCATION = /^[a-z0-9_.-]+:[a-z0-9_.\/-]+$/;

/**
 * Only proposes what the typing rules would then accept: the kinds a port may hold, the types a
 * kind may be defined with, and the variables a 'ref' may point to.
 */
export class BsdocCompletionProvider extends DefaultCompletionProvider {

    constructor(services: LangiumServices) {
        super(services);
    }

    override readonly completionOptions: CompletionOptions = { triggerCharacters: [' ', '$', ':', '=', '|'] };

    protected override completionFor(context: CompletionContext, next: NextFeature, acceptor: CompletionAcceptor): void | Promise<void> {
        if (GrammarAST.isKeyword(next.feature) && !this.keywordFits(context, next.feature)) {
            return;
        }
        return super.completionFor(context, next, acceptor);
    }

    private keywordFits(context: CompletionContext, keyword: GrammarAST.Keyword): boolean {
        const rule = AstUtils.getContainerOfType(keyword, GrammarAST.isParserRule)?.name ?? '';
        if (rule === 'Name' || rule === 'FeatureId') {
            return false;
        }
        const previous = this.wordBefore(context);
        const inName = REGISTRIES.has(previous) || previous === 'storage' || previous === 'arguments'
            || previous === '/' || RESOURCE_LOCATION.test(previous) || this.atEntryName(context);
        if (inName) {
            return false;
        }
        if (rule === 'Registry') {
            return previous === 'feature';
        }
        if (KIND_RULES.has(rule)) {
            if (previous === '=') {
                return true;
            }
            if (!ROLES.has(previous)) {
                return false;
            }
            const feature = AstUtils.getContainerOfType(context.node, isFeature);
            return !feature || REGISTRY_KINDS[feature.registry][previous as Role].includes(keyword.value as Kind);
        }
        if (TYPE_RULES.has(rule)) {
            if (!/^(:|\||\[|,|=|#\[.*\])$/.test(previous)) {
                return false;
            }
            const expected = this.expectedPrimitives(context.node);
            return !expected || expected.includes(keyword.value);
        }
        return true;
    }

    private expectedPrimitives(node: AstNode | undefined): readonly string[] | undefined {
        let current = node;
        while (current && !isDeclaration(current) && !isVariable(current) && !isSlot(current)) {
            if (isStructEntry(current) || isListType(current)) {
                return [...DATA_PRIMITIVES];
            }
            current = current.$container;
        }
        const declaration = isDeclaration(current) ? current : isSlot(current) || isVariable(current) ? current.declaration : undefined;
        if (!declaration) {
            return undefined;
        }
        const context = CONTEXT_KIND_TYPES[declaration.kind];
        if (context) {
            return context.primitives;
        }
        if (declaration.kind === 'result') {
            return ['int', 'float'];
        }
        return KINDS_WITH_DATA[declaration.kind] ? [...DATA_PRIMITIVES] : undefined;
    }

    private wordBefore(context: CompletionContext): string {
        const before = context.textDocument.getText().slice(0, context.tokenOffset);
        const lastLine = before.slice(before.lastIndexOf('\n') + 1).trimEnd();
        const attribute = /#\[(?:[^\[\]]|\[(?:[^\[\]]|\[(?:[^\[\]]|\[[^\[\]]*\])*\])*\])*\]$/.exec(lastLine);
        if (attribute) {
            return attribute[0];
        }
        if (/[:|[\],=/]$/.test(lastLine)) {
            return lastLine.at(-1)!;
        }
        return /[^\s:|[\],=/]+$/.exec(lastLine)?.[0] ?? '';
    }

    private atEntryName(context: CompletionContext): boolean {
        return this.wordBefore(context) === '' && AstUtils.getContainerOfType(context.node, isStructType) !== undefined;
    }

    protected override getReferenceCandidates(refInfo: ReferenceInfo, context: CompletionContext): Stream<AstNodeDescription> {
        const candidates = super.getReferenceCandidates(refInfo, context);
        const container = refInfo.container;
        if (isSlot(container)) {
            const feature = AstUtils.getContainerOfType(container, isFeature);
            const allowed = feature ? REGISTRY_KINDS[feature.registry][container.role] : undefined;
            return candidates.filter(description => {
                const variable = description.node;
                return isVariable(variable) && isSlotDefinition(variable) && (!allowed || allowed.includes(variable.declaration!.kind));
            });
        }
        if (isReferenceType(container)) {
            return candidates.filter(description => isVariable(description.node) && !isSlotDefinition(description.node));
        }
        return candidates;
    }

    protected override createReferenceCompletionItem(description: AstNodeDescription, refInfo: ReferenceInfo, context: CompletionContext): CompletionValueItem {
        const item = super.createReferenceCompletionItem(description, refInfo, context);
        const variable = description.node as Variable | undefined;
        return {
            ...item,
            label: '$' + description.name,
            kind: CompletionItemKind.Variable,
            detail: variable ? detailOf(variable) : undefined,
            documentation: variable?.description,
        };
    }

    protected override buildCompletionTextEdit(context: CompletionContext, label: string, newText: string): TextEdit | InsertReplaceEdit | undefined {
        if (label.startsWith('$') && context.textDocument.getText().charAt(context.tokenOffset - 1) === '$') {
            context = { ...context, tokenOffset: context.tokenOffset - 1 };
        }
        return super.buildCompletionTextEdit(context, label, newText);
    }
}

export function detailOf(variable: Variable, registry?: Registry): string {
    const declaration = variable.declaration;
    if (declaration) {
        const target = [declaration.id, ...declaration.path].filter(Boolean).join(' ');
        const type = typeOf(declaration, registry);
        return `${declaration.kind}${target ? ' ' + target : ''}${type ? ': ' + type : ''}`;
    }
    return typeToString(variable.type);
}
