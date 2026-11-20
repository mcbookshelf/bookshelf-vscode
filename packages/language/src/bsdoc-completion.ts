import { AstUtils, GrammarAST, type AstNode, type AstNodeDescription, type ReferenceInfo, type Stream } from 'langium';
import { DefaultCompletionProvider, type CompletionAcceptor, type CompletionContext, type CompletionValueItem, type NextFeature } from 'langium/lsp';
import { CompletionItemKind, type CompletionOptions, type InsertReplaceEdit, type TextEdit } from 'vscode-languageserver';
import { CONTEXT_KIND_TYPES, DATA_PRIMITIVES, KINDS_WITH_DATA, REGISTRIES, shapeOf, structOf, typeToString } from './bsdoc-model.js';
import {
    isContext,
    isDefinition,
    isFeature,
    isField,
    isListType,
    isPaste,
    isReferenceType,
    isSlot,
    type Definition,
    type Feature,
    type Field,
    type Kind,
    type Role,
    type Slot,
} from './generated/ast.js';

/** The rules whose keywords name a type. */
const TYPE_RULES = new Set(['PrimitiveName', 'ArrayElement', 'StructType']);

const DATA_TYPES: readonly string[] = [...DATA_PRIMITIVES, 'struct'];

/** What holds lines or fields under it. */
const isBlock = (node: AstNode): node is Feature | Definition | Slot | Field => isFeature(node) || isDefinition(node) || isSlot(node) || isField(node);

/** Only proposes what validation would then accept: the lines and kinds of a registry, the types of a line, the '$' names which fit. */
export class BsdocCompletionProvider extends DefaultCompletionProvider {

    override readonly completionOptions: CompletionOptions = { triggerCharacters: [' ', '$', ':', '|', '@'] };

    protected override completionFor(context: CompletionContext, next: NextFeature, acceptor: CompletionAcceptor): void | Promise<void> {
        if (GrammarAST.isKeyword(next.feature) && !this.keywordFits(context, next.feature)) {
            return;
        }
        return super.completionFor(context, next, acceptor);
    }

    private keywordFits(context: CompletionContext, keyword: GrammarAST.Keyword): boolean {
        const rule = AstUtils.getContainerOfType(keyword, GrammarAST.isParserRule)?.name ?? '';
        const text = context.textDocument.getText();
        // a name is free, even though every language word is one, and a '$' opens a '$' name
        if (rule.endsWith('Word') || text.charAt(context.tokenOffset - 1) === '$' || text.charAt(context.tokenOffset) === '$') {
            return false;
        }
        const feature = this.ownerAt(context, isFeature);
        const rules = feature ? REGISTRIES[feature.registry] : undefined;
        if (rule === 'ContextKind') {
            return !rules || rules.context;
        }
        if (keyword.value === 'input' || keyword.value === 'output') {
            return !rules || rules[keyword.value].length > 0;
        }
        if (rule === 'Kind') {
            const before = text.slice(0, context.tokenOffset);
            const role = /(\S+)\s*$/.exec(before.slice(before.lastIndexOf('\n') + 1))?.[1] as Role;
            return !rules || (rules[role] ?? []).includes(keyword.value as Kind);
        }
        if (TYPE_RULES.has(rule)) {
            const expected = this.expectedTypes(context.node);
            return !expected || expected.includes(keyword.value);
        }
        return true;
    }

    /** The types the line being written takes, or undefined when any does: in a definition. */
    private expectedTypes(node: AstNode | undefined): readonly string[] | undefined {
        for (let current = node; current; current = current.$container) {
            if (isField(current) || isListType(current)) {
                return DATA_TYPES;
            }
            if (isContext(current)) {
                return CONTEXT_KIND_TYPES[current.kind]?.primitives ?? [];
            }
            if (isSlot(current)) {
                return current.kind === 'result' ? ['int', 'float'] : KINDS_WITH_DATA[current.kind] ? DATA_TYPES : [];
            }
            if (isDefinition(current) || isFeature(current)) {
                return undefined;
            }
        }
        return undefined;
    }

    /** The nearest node of a kind which is less indented than the cursor: the node at the cursor may be the line before. */
    private ownerAt<T extends AstNode>(context: CompletionContext, guard: (node: AstNode) => node is T): T | undefined {
        const text = context.textDocument.getText({ start: { line: context.position.line, character: 0 }, end: context.position });
        const indentation = /^[ \t]*/.exec(text)![0].length;
        for (let current = context.node; current; current = current.$container) {
            if (guard(current) && (current.$cstNode?.range.start.character ?? 0) < indentation) {
                return current;
            }
        }
        return undefined;
    }

    protected override getReferenceCandidates(refInfo: ReferenceInfo, context: CompletionContext): Stream<AstNodeDescription> {
        const candidates = super.getReferenceCandidates(refInfo, context);
        const container = refInfo.container;
        // a definition does not refer to itself, and a list has one description per '$name[...]'
        const self = this.ownerAt(context, isDefinition);
        const fits = (test: (definition: Definition) => boolean) => candidates
            .filter(description => isDefinition(description.node) && description.node !== self && test(description.node))
            .distinct(description => description.name);
        if (isReferenceType(container)) {
            return fits(definition => shapeOf(definition) === 'type' || shapeOf(definition) === 'struct');
        }
        if (isPaste(container)) {
            // lines in a feature or under a '$name:', a struct among fields
            const owner = this.ownerAt(context, isBlock);
            const lines = isFeature(owner) || (isDefinition(owner) && !owner.type);
            return fits(definition => lines ? shapeOf(definition) === 'lines' : structOf(definition) !== undefined);
        }
        return candidates;
    }

    protected override createReferenceCompletionItem(description: AstNodeDescription, refInfo: ReferenceInfo, context: CompletionContext): CompletionValueItem {
        const definition = description.node as Definition | undefined;
        const shape = shapeOf(definition);
        return {
            ...super.createReferenceCompletionItem(description, refInfo, context),
            label: '$' + description.name,
            kind: CompletionItemKind.Variable,
            detail: shape === 'type' ? typeToString(definition?.type) : shape,
            documentation: definition?.description,
        };
    }

    /** The proposal replaces the '$' already typed. */
    protected override buildCompletionTextEdit(context: CompletionContext, label: string, newText: string): TextEdit | InsertReplaceEdit | undefined {
        if (label.startsWith('$') && context.textDocument.getText().charAt(context.tokenOffset - 1) === '$') {
            context = { ...context, tokenOffset: context.tokenOffset - 1 };
        }
        return super.buildCompletionTextEdit(context, label, newText);
    }
}
