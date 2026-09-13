import { isType, type Type as TypirType, type ValidationProblemAcceptor } from 'typir';
import type { LangiumTypeSystemDefinition, TypirLangiumServices, TypirLangiumSpecifics } from 'typir-langium';
import {
    isArrayType, isFeatureSlotExpression, isListType, isMinecraftArrayType, isTupleType, isUnionType, isVariableReference,
    type AbstractFeatureSlotExpression, type ArrayType, type BookshelfDocAstType, type Kind, type Type,
} from './generated/ast.js';

export interface BookshelfDocSpecifics extends TypirLangiumSpecifics {
    AstTypes: BookshelfDocAstType;
}

type AstTypeName = keyof BookshelfDocAstType;
type Accept = ValidationProblemAcceptor<BookshelfDocSpecifics>;

/** Leaf types of the language: each is inferred from the AST node with the same $type. */
const LEAVES: AstTypeName[] = [
    'IntType', 'BoolType', 'ByteType', 'ShortType', 'LongType', 'FloatType', 'DoubleType',
    'StringType', 'NumberType', 'AnyType', 'PlayerType', 'EntityType', 'XyType', 'XyzType',
    'OverworldType', 'NetherType', 'EndType', 'StructType',
];

/**
 * The type categories of the language, as the set of their direct sub-types.
 * They mirror the union types of 'type.model.langium', plus 'programmatic' (rule 4), which
 * has no grammar counterpart.
 */
const CATEGORIES = {
    abstractEntity: ['EntityType', 'PlayerType'],
    position: ['XyzType', 'abstractEntity'],
    rotation: ['XyType', 'abstractEntity'],
    dimension: ['OverworldType', 'NetherType', 'EndType', 'AnyType'],
    programmatic: ['IntType', 'BoolType', 'ByteType', 'ShortType', 'LongType', 'FloatType',
        'DoubleType', 'StringType', 'NumberType', 'AnyType', 'StructType'],
} as const satisfies Record<string, readonly string[]>;

type Category = keyof typeof CATEGORIES;

/** Which type a kind must be defined with. A kind absent from both tables is unconstrained. */
export const KIND_TYPE: Partial<Record<Kind['$type'], AstTypeName | Category>> = {
    Position: 'position',
    Rotation: 'rotation',
    Executor: 'abstractEntity',
    Dimension: 'dimension',
    Result: 'NumberType',
    Success: 'NumberType',
    Storage: 'programmatic',
    Macro: 'StructType',
};

/** Kinds which carry no type at all. */
const KINDS_WITHOUT_TYPE: ReadonlyArray<Kind['$type']> = ['State'];

/** Which kinds a port may hold (rules 1-3). */
export type Port = 'Input' | 'Context' | 'Output';
export const PORT_KINDS: Record<Port, ReadonlyArray<Kind['$type']>> = {
    Input: ['Storage', 'Macro'],
    Context: ['Executor', 'Position', 'Rotation', 'Dimension', 'State'],
    Output: ['Success', 'Result', 'State', 'Storage'],
};

/** Whether a leaf type belongs to the expected type or category, mirroring the Typir sub-type graph. */
export function acceptsLeaf(expected: string, leaf: string): boolean {
    return expected === leaf
        || (expected in CATEGORIES && CATEGORIES[expected as Category].some(member => acceptsLeaf(member, leaf)));
}

/** The kind of a port, following a 'ref' to the variable it points to.
 * Every step is optional: validation also runs on the partial AST of a document being typed. */
function kindOf(expression: AbstractFeatureSlotExpression | undefined): Kind | undefined {
    if (isVariableReference(expression)) {
        return expression.reference?.ref?.expression?.kind;
    }
    return isFeatureSlotExpression(expression) ? expression.kind : undefined;
}

/**
 * The types a kind is really defined with: a union or an array of X is checked as X. A
 * programmatic type is also looked through lists and tuples (rule 4); elsewhere they stand
 * for themselves and fail. A struct is a leaf: its own entries are validated separately.
 */
function* leafTypes(type: Type, programmatic: boolean): Generator<Type> {
    if (isUnionType(type)) {
        yield* leafTypes(type.left, programmatic);
        yield* leafTypes(type.right, programmatic);
    } else if (isArrayType(type) || (programmatic && isTupleType(type))) {
        for (const element of type.elements) {
            yield* leafTypes(element, programmatic);
        }
    } else if (programmatic && isListType(type)) {
        yield* leafTypes(type.element, programmatic);
    } else {
        yield type;
    }
}

/** Every array contained in a programmatic type, structs excepted. */
function* arrays(type: Type): Generator<ArrayType> {
    if (isArrayType(type)) {
        yield type;
    }
    if (isUnionType(type)) {
        yield* arrays(type.left);
        yield* arrays(type.right);
    } else if (isArrayType(type) || isTupleType(type)) {
        for (const element of type.elements) {
            yield* arrays(element);
        }
    } else if (isListType(type)) {
        yield* arrays(type.element);
    }
}

const readable = (name: string) => name.replace(/Type$/, '').replace(/([A-Z])/g, ' $1').trim().toLowerCase();
const article = (name: string) => /^[aeiou]/.test(name) ? 'an' : 'a';
const expectation = (expected: string) => `${article(readable(expected))} ${readable(expected)} type`;

export class BookshelfDocTypeSystem implements LangiumTypeSystemDefinition<BookshelfDocSpecifics> {

    onInitialize(typir: TypirLangiumServices<BookshelfDocSpecifics>): void {
        const types = new Map<string, TypirType>();
        for (const leaf of LEAVES) {
            types.set(leaf, typir.factory.Primitives.create({ primitiveName: readable(leaf) })
                .inferenceRule({ languageKey: leaf }).finish());
        }
        for (const category of Object.keys(CATEGORIES) as Category[]) {
            types.set(category, typir.factory.Primitives.create({ primitiveName: category }).finish());
        }
        for (const [category, members] of Object.entries(CATEGORIES)) {
            for (const member of members) {
                typir.Subtype.markAsSubType(types.get(member)!, types.get(category)!);
            }
        }

        /** Whether a type definition belongs to the expected type or category. */
        const fits = (definition: Type, expected: AstTypeName | Category) => {
            const expectedType = types.get(expected)!;
            const actual = typir.Inference.inferType(definition);
            // Typir's isSubType() needs an edge, so the reflexive case is checked separately
            return isType(actual) && (actual === expectedType || typir.Subtype.isSubType(actual, expectedType));
        };

        /** Reports unless the given type definition belongs to the expected category. */
        const expect = (definition: Type, expected: AstTypeName | Category, what: string, accept: Accept) => {
            if (fits(definition, expected)) {
                return;
            }
            const actual = typir.Inference.inferType(definition);
            accept({
                languageNode: definition, severity: 'error',
                message: `${what} requires ${expectation(expected)}, but got '${isType(actual) ? actual.getName() : readable(definition.$type)}'.`,
            });
        };

        /** Checks a definition against the type its kind expects, leaf by leaf. A programmatic
         * type is NBT, so its arrays only hold 'int', 'byte' or 'long' (rule 4). */
        const expectAll = (definition: Type, expected: AstTypeName | Category, what: string, accept: Accept) => {
            const programmatic = expected === 'programmatic';
            for (const leaf of leafTypes(definition, programmatic)) {
                expect(leaf, expected, what, accept);
            }
            if (programmatic) {
                for (const array of arrays(definition)) {
                    // an element which is not programmatic at all is already reported above
                    const [element] = array.elements;
                    if (!isMinecraftArrayType(element) && [...leafTypes(element, true)].every(leaf => fits(leaf, 'programmatic'))) {
                        accept({
                            languageNode: array, severity: 'error',
                            message: `${what} only allows an array of 'int', 'byte' or 'long', but got an array of '${readable(array.elements[0].$type)}'.`,
                        });
                    }
                }
            }
        };

        const portRule = (port: keyof typeof PORT_KINDS) =>
            (node: BookshelfDocAstType[typeof port], accept: Accept) => {
                const kind = kindOf(node.expression);
                if (!kind || PORT_KINDS[port].includes(kind.$type)) {
                    return; // unresolved 'ref's are reported by Langium's linker
                }
                accept({
                    languageNode: node, languageProperty: 'expression', severity: 'error',
                    message: `${port} cannot hold a '${readable(kind.$type)}' kind, only ${PORT_KINDS[port].map(k => `'${readable(k)}'`).join(', ')}.`,
                });
            };

        const rules = {
            Input: portRule('Input'),
            Context: portRule('Context'),
            Output: portRule('Output'),
            FeatureSlotExpression: (node, accept) => {
                const what = `A '${readable(node.kind.$type)}' kind`;
                if (KINDS_WITHOUT_TYPE.includes(node.kind.$type)) {
                    if (node.definition) {
                        accept({ languageNode: node.definition, severity: 'error', message: `${what} cannot have a type.` });
                    }
                    return;
                }
                const expected = KIND_TYPE[node.kind.$type];
                if (!expected) {
                    return;
                }
                if (node.definition) {
                    expectAll(node.definition, expected, what, accept);
                } else {
                    accept({
                        languageNode: node, languageProperty: 'kind', severity: 'error',
                        message: `${what} requires ${expectation(expected)}.`,
                    });
                }
            },
            StructTypeEntry: (node, accept) => {
                expectAll(node.type, 'programmatic', `The struct entry '${node.property}'`, accept);
            },
        } satisfies Parameters<typeof typir.validation.Collector.addValidationRulesForAstNodes>[0];

        typir.validation.Collector.addValidationRulesForAstNodes(rules);
    }

    onNewAstNode(): void {
        // all types of this language are built-in, nothing to create per document
    }
}
