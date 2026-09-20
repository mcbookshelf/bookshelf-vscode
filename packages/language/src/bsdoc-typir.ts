import { isType, type Type as TypirType, type ValidationProblem, type ValidationProblemAcceptor } from 'typir';
import { LangiumProblemPrinter, type LangiumTypeSystemDefinition, type TypirLangiumServices, type TypirLangiumSpecifics } from 'typir-langium';
import { AstUtils } from 'langium';
import { CONTEXT_KIND_TYPES, KINDS_WITHOUT_TYPE, KINDS_WITH_DATA, article, resolveType, resultType, typeToString } from './bsdoc-model.js';
import {
    isArrayType, isFeature, isListType, isPrimitiveType, isReferenceType, isSlot, isStructType, isUnionType,
    type BsdocAstType, type Declaration, type Type, type Variable,
} from './generated/ast.js';

export interface BsdocSpecifics extends TypirLangiumSpecifics {
    AstTypes: BsdocAstType;
}

type Accept = ValidationProblemAcceptor<BsdocSpecifics>;

/** The primitives of the language, each inferred from a 'PrimitiveType' node of that name. */
const PRIMITIVES = ['byte', 'short', 'int', 'long', 'float', 'double', 'number', 'string', 'boolean', 'any',
    'player', 'entity', 'xyz', 'xy', 'overworld', 'nether', 'end'];

/**
 * The type categories, as the set of their direct sub-types: what each context kind takes, and
 * 'data', what a storage, a macro and arguments are made of. A struct is a leaf of its own.
 */
const CATEGORIES = {
    abstractEntity: ['entity', 'player'],
    position: ['xyz', 'abstractEntity'],
    rotation: ['xy', 'abstractEntity'],
    dimension: ['overworld', 'nether', 'end', 'any'],
    data: ['byte', 'short', 'int', 'long', 'float', 'double', 'number', 'string', 'boolean', 'any', 'struct'],
} as const satisfies Record<string, readonly string[]>;

type Category = keyof typeof CATEGORIES;

/** The category a context kind takes. */
const KIND_CATEGORY: Record<string, Category> = { executor: 'abstractEntity', position: 'position', rotation: 'rotation', dimension: 'dimension' };

/** A leaf of a type, with the alias reference it came through, where an error is then reported. */
interface Leaf {
    type: Type;
    at: Type;
}

/**
 * The leaves of a type, aliases resolved: a union is checked member by member, an array of X as
 * X where arrays are looked through, and a data type through its lists and tuples too. What is
 * not looked through stands for itself: a list where a context type goes is a leaf, and fails.
 */
function* leaves(type: Type, options: { arrays: boolean, lists: boolean }, at: Type = type, seen: Set<Variable> = new Set()): Generator<Leaf> {
    if (isReferenceType(type)) {
        // a reference to nothing, to a slot or through a cycle is reported by the validator
        const target = type.reference.ref;
        if (target?.type && !seen.has(target)) {
            yield* leaves(target.type, options, at, new Set(seen).add(target));
        }
    } else if (isUnionType(type)) {
        for (const member of type.members) {
            yield* leaves(member, options, at === type ? member : at, seen);
        }
    } else if (isArrayType(type) && options.arrays) {
        yield* leaves(type.element, options, at === type ? type.element : at, seen);
    } else if (isListType(type) && options.lists) {
        for (const element of type.elements) {
            yield* leaves(element, options, at === type ? element : at, seen);
        }
    } else {
        yield { type, at };
    }
}


export class BsdocTypeSystem implements LangiumTypeSystemDefinition<BsdocSpecifics> {

    onInitialize(typir: TypirLangiumServices<BsdocSpecifics>): void {
        const types = new Map<string, TypirType>();
        for (const name of PRIMITIVES) {
            types.set(name, typir.factory.Primitives.create({ primitiveName: name })
                .inferenceRule({ filter: isPrimitiveType, matching: node => node.name === name }).finish());
        }
        types.set('struct', typir.factory.Primitives.create({ primitiveName: 'struct' }).inferenceRule({ languageKey: 'StructType' }).finish());
        for (const category of Object.keys(CATEGORIES) as Category[]) {
            types.set(category, typir.factory.Primitives.create({ primitiveName: category }).finish());
        }
        for (const [category, members] of Object.entries(CATEGORIES)) {
            for (const member of members) {
                typir.Subtype.markAsSubType(types.get(member)!, types.get(category)!);
            }
        }

        /** Whether a leaf belongs to the expected type or category. */
        const fits = (leaf: Type, expected: string): boolean => {
            const expectedType = types.get(expected)!;
            const actual = typir.Inference.inferType(leaf);
            // Typir's isSubType() needs an edge, so the reflexive case is checked separately
            return isType(actual) && (actual === expectedType || typir.Subtype.isSubType(actual, expectedType));
        };

        const error = (languageNode: Type | Declaration, message: string, accept: Accept, languageProperty?: string) =>
            accept({ languageNode, languageProperty, severity: 'error', message });

        /** A data type holds no context primitive, arrays included. */
        const expectData = (type: Type, accept: Accept) => {
            for (const leaf of leaves(type, { arrays: true, lists: true })) {
                if (!fits(leaf.type, 'data')) {
                    error(leaf.at, `'${typeToString(leaf.type)}' is not a data type`, accept);
                }
            }
        };

        const rules = {
            Declaration: (node, accept) => {
                const kind = node.kind;
                const reason = KINDS_WITHOUT_TYPE[kind];
                if (reason) {
                    if (node.type) {
                        error(node.type, reason, accept);
                    }
                    return;
                }
                const need = KINDS_WITH_DATA[kind];
                if (need && !node.type) {
                    error(node, `'${kind}' needs a type`, accept, 'kind');
                    return;
                }
                const type = node.type;
                if (!type) {
                    return; // a context kind and a result have a default type
                }
                const category = KIND_CATEGORY[kind];
                if (category) {
                    const all = [...leaves(type, { arrays: CONTEXT_KIND_TYPES[kind]?.arrays ?? false, lists: false })];
                    if (!all.every(leaf => fits(leaf.type, category))) {
                        error(type, `'${typeToString(type)}' is not a type ${article(kind)} ${kind} takes`, accept);
                    }
                    return;
                }
                if (kind === 'result') {
                    // the registry decides between int and float; a definition alone takes either
                    const slot = isSlot(node.$container) ? node.$container : undefined;
                    const feature = slot && AstUtils.getContainerOfType(slot, isFeature);
                    const expected = feature ? [resultType(feature.registry)] : ['int', 'float'];
                    const resolved = resolveType(type);
                    if (resolved && !(isPrimitiveType(resolved) && expected.includes(resolved.name))) {
                        error(type, `'${typeToString(type)}' is not a type this result takes, it is ${article(expected[0])} ${expected.join(' or ')}`, accept);
                    }
                    return;
                }
                if (need === 'struct') {
                    const resolved = resolveType(type);
                    if (resolved && !isStructType(resolved)) {
                        error(type, kind === 'macro'
                            ? `'${typeToString(type)}' is not a type a macro takes`
                            : `'${typeToString(type)}' is not a type arguments take, they need a struct`, accept);
                    }
                }
                if (need) {
                    expectData(type, accept);
                }
            },
            // a struct is only ever data: its entries are, at any depth
            StructEntry: (node, accept) => expectData(node.type, accept),
        } satisfies Parameters<typeof typir.validation.Collector.addValidationRulesForAstNodes>[0];

        typir.validation.Collector.addValidationRulesForAstNodes(rules);
    }

    onNewAstNode(): void {
        // all types of this language are built-in, nothing to create per document
    }
}

/** Reports a problem as its message alone, without Typir's "While validating ..." prefix. */
export class BsdocProblemPrinter extends LangiumProblemPrinter<BsdocSpecifics> {

    override printValidationProblem(problem: ValidationProblem<BsdocSpecifics>, level = 0): string {
        return this.printSubProblems(this.printIndentation(problem.message, level), problem.subProblems, level);
    }
}
