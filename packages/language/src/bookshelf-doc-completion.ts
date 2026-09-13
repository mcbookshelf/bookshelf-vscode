import { AstUtils, GrammarAST, type AstNode, type AstNodeDescription, type AstNodeLocator, type LangiumDocuments, type ReferenceInfo, type Stream } from 'langium';
import { DefaultCompletionProvider, type CompletionContext, type LangiumServices } from 'langium/lsp';
import { isContext, isFeatureSlotExpression, isInput, isOutput, isStructTypeEntry, isVariable, type Kind } from './generated/ast.js';
import { KIND_TYPE, PORT_KINDS, acceptsLeaf, type Port } from './bookshelf-doc-typir.js';

/** The parser rules whose keywords name a kind, and the ones whose keywords name a leaf type. */
const KIND_RULES = new Set(['Kind', 'Storage']);
const TYPE_RULES = new Set(['PrimitiveType', 'RangeablePrimitiveType', 'MinecraftArrayType']);

/** The AST type a keyword builds: the '{XyzType}' action beside it, or the type of its rule. */
function typeNameOf(keyword: GrammarAST.Keyword): string | undefined {
    const action = AstUtils.getContainerOfType(keyword, GrammarAST.isGroup)?.elements.find(GrammarAST.isAction);
    if (action) {
        return action.type?.ref?.name ?? action.inferredType?.name;
    }
    const rule = AstUtils.getContainerOfType(keyword, GrammarAST.isParserRule);
    return rule?.returnType?.ref?.name ?? rule?.name;
}

const portOf = (node: AstNode | undefined): Port | undefined =>
    isInput(node) ? 'Input' : isContext(node) ? 'Context' : isOutput(node) ? 'Output' : node ? portOf(node.$container) : undefined;

/**
 * Only proposes what the typing rules would then accept: the kinds a port may hold, the types a
 * kind may be defined with, and the variables a 'ref' may point to.
 */
export class BookshelfDocCompletionProvider extends DefaultCompletionProvider {

    private readonly documents: LangiumDocuments;
    private readonly astNodeLocator: AstNodeLocator;

    constructor(services: LangiumServices) {
        super(services);
        this.documents = services.shared.workspace.LangiumDocuments;
        this.astNodeLocator = services.workspace.AstNodeLocator;
    }

    protected override filterKeyword(context: CompletionContext, keyword: GrammarAST.Keyword): boolean {
        if (!super.filterKeyword(context, keyword)) {
            return false;
        }
        const rule = AstUtils.getContainerOfType(keyword, GrammarAST.isParserRule)?.name ?? '';
        if (KIND_RULES.has(rule)) {
            const port = portOf(context.node);
            return !port || PORT_KINDS[port].includes(typeNameOf(keyword) as Kind['$type']);
        }
        if (TYPE_RULES.has(rule)) {
            const expected = this.expectedTypeAt(context.node);
            return !expected || acceptsLeaf(expected, typeNameOf(keyword) ?? '');
        }
        return true;
    }

    /** The type a kind expects at the cursor. Inside a struct, every entry is programmatic (rule 4). */
    private expectedTypeAt(node: AstNode | undefined) {
        if (AstUtils.getContainerOfType(node, isStructTypeEntry)) {
            return 'programmatic';
        }
        const kind = AstUtils.getContainerOfType(node, isFeatureSlotExpression)?.kind;
        return kind && KIND_TYPE[kind.$type];
    }

    protected override getReferenceCandidates(refInfo: ReferenceInfo, context: CompletionContext): Stream<AstNodeDescription> {
        const candidates = super.getReferenceCandidates(refInfo, context);
        const port = portOf(context.node);
        if (!port) {
            return candidates;
        }
        return candidates.filter(description => {
            const variable = this.nodeOf(description);
            // a variable which is not loaded yet is kept: it is better proposed than hidden
            return !isVariable(variable) || !variable.expression?.kind
                || PORT_KINDS[port].includes(variable.expression.kind.$type);
        });
    }

    private nodeOf(description: AstNodeDescription): AstNode | undefined {
        if (description.node) {
            return description.node;
        }
        const document = this.documents.getDocument(description.documentUri);
        return document && this.astNodeLocator.getAstNode(document.parseResult.value, description.path);
    }
}
