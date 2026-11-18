import { AstUtils, type AstNode } from 'langium';
import { isType, type Type as TypirType, type ValidationProblem, type ValidationProblemAcceptor } from 'typir';
import { LangiumProblemPrinter, type LangiumTypeSystemDefinition, type TypirLangiumServices, type TypirLangiumSpecifics } from 'typir-langium';
import { CONTEXT_KIND_TYPES, KINDS_WITHOUT_TYPE, KINDS_WITH_DATA, article, resolveType, resultType, shapeOf, typeToString, type Resolved } from './bsdoc-model.js';
import {
    isArrayType,
    isDefinition,
    isFeature,
    isListType,
    isPrimitiveType,
    isReferenceType,
    isStructType,
    isUnionType,
    type BsdocAstType,
    type Definition,
    type Type,
} from './generated/ast.js';

export interface BsdocSpecifics extends TypirLangiumSpecifics {
    AstTypes: BsdocAstType;
}

type Accept = ValidationProblemAcceptor<BsdocSpecifics>;

/** Each is inferred from a 'PrimitiveType' node of that name. */
const PRIMITIVES = ['byte', 'short', 'int', 'long', 'float', 'double', 'number', 'string', 'boolean', 'any', 'player', 'entity', 'xyz', 'xy', 'overworld', 'nether', 'end'];

/** The direct sub-types of each category: what a context takes, and 'data', what a storage, a macro and arguments are made of. */
const CATEGORIES = {
    abstractEntity: ['entity', 'player'],
    position: ['xyz', 'abstractEntity'],
    rotation: ['xy', 'abstractEntity'],
    dimension: ['overworld', 'nether', 'end', 'any'],
    data: ['byte', 'short', 'int', 'long', 'float', 'double', 'number', 'string', 'boolean', 'any', 'struct'],
} as const satisfies Record<string, readonly string[]>;

type Category = keyof typeof CATEGORIES;

const KIND_CATEGORY: Record<string, Category> = { '@executor': 'abstractEntity', '@position': 'position', '@rotation': 'rotation', '@dimension': 'dimension' };

/** A leaf of a type, with the '$' reference it came through, where an error is then reported. */
interface Leaf {
    type: Resolved;
    at: Type;
}

/** The leaves of a type, '$' names resolved and unions flattened; arrays and lists are looked through on demand, and are leaves otherwise. */
function* leaves(type: Type, options: { arrays: boolean, lists: boolean }, at: Type = type, seen: Set<Definition> = new Set()): Generator<Leaf> {
    if (isReferenceType(type)) {
        // a reference to nothing, to lines, to a list or through a cycle is reported by the validator
        const target = type.reference.ref;
        if (target?.type && !seen.has(target)) {
            yield* leaves(target.type, options, at, new Set(seen).add(target));
        } else if (target && shapeOf(target) === 'struct') {
            yield { type: target, at };
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

const describe = (leaf: Resolved): string => isDefinition(leaf) ? `$${leaf.name}` : typeToString(leaf);


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

        const fits = (leaf: Resolved, expected: string): boolean => {
            const expectedType = types.get(expected)!;
            // a block of fields is a struct
            const actual = isDefinition(leaf) ? types.get('struct')! : typir.Inference.inferType(leaf);
            // Typir's isSubType() needs an edge, so the reflexive case is checked separately
            return isType(actual) && (actual === expectedType || typir.Subtype.isSubType(actual, expectedType));
        };

        const error = (languageNode: AstNode, message: string, accept: Accept, languageProperty?: string) =>
            accept({ languageNode, languageProperty, severity: 'error', message });

        const expectData = (type: Type, accept: Accept) => {
            for (const leaf of leaves(type, { arrays: true, lists: true })) {
                if (!fits(leaf.type, 'data')) {
                    error(leaf.at, `'${describe(leaf.type)}' is not a data type`, accept);
                }
            }
        };

        const rules = {
            Context: (node, accept) => {
                const type = node.type;
                if (!type) {
                    return; // a context has a default type
                }
                const category = KIND_CATEGORY[node.kind];
                if (!category) {
                    error(type, 'a state carries no type', accept);
                    return;
                }
                const all = [...leaves(type, { arrays: CONTEXT_KIND_TYPES[node.kind]?.arrays ?? false, lists: false })];
                if (!all.every(leaf => fits(leaf.type, category))) {
                    error(type, `'${typeToString(type)}' is not a type ${node.kind} takes`, accept);
                }
            },
            Slot: (node, accept) => {
                const kind = node.kind;
                const type = node.type;
                const fields = !type && node.body.length > 0;
                const reason = KINDS_WITHOUT_TYPE[kind];
                if (reason) {
                    if (type) {
                        error(type, reason, accept);
                    } else if (fields) {
                        error(node, reason, accept, 'kind');
                    }
                    return;
                }
                const need = KINDS_WITH_DATA[kind];
                if (need && !type && !fields) {
                    error(node, `'${kind}' needs a type`, accept, 'kind');
                    return;
                }
                if (kind === 'result') {
                    // the registry decides between int and float; lines alone take either
                    const feature = AstUtils.getContainerOfType(node, isFeature);
                    const expected = feature ? [resultType(feature.registry)] : ['int', 'float'];
                    const expectation = `it is ${article(expected[0])} ${expected.join(' or ')}`;
                    if (fields) {
                        error(node, `a struct is not a type this result takes, ${expectation}`, accept, 'kind');
                        return;
                    }
                    const resolved = type && resolveType(type);
                    if (type && resolved && !(isPrimitiveType(resolved) && expected.includes(resolved.name))) {
                        error(type, `'${typeToString(type)}' is not a type this result takes, ${expectation}`, accept);
                    }
                    return;
                }
                if (!type) {
                    return;
                }
                if (need === 'struct') {
                    const resolved = resolveType(type);
                    if (resolved && !isStructType(resolved) && !isDefinition(resolved)) {
                        error(type, kind === 'macro'
                            ? `'${typeToString(type)}' is not a type a macro takes, it needs a struct`
                            : `'${typeToString(type)}' is not a type arguments take, they need a struct`, accept);
                    }
                }
                expectData(type, accept);
            },
            // a struct is only ever data: its fields are, at any depth
            Field: (node, accept) => {
                if (node.type) {
                    expectData(node.type, accept);
                }
            },
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
