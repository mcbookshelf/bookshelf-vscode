import { AstUtils, type AstNode } from 'langium';
import {
    isArrayType, isListType, isPrimitiveType, isProperty, isReferenceType, isStructType, isUnionType, isVariable,
    type Declaration, type Feature, type Kind, type Module, type Property, type Registry, type Role, type Slot, type Type, type Variable,
} from './generated/ast.js';

// --- the tables of the language

export const ROLES: readonly Role[] = ['input', 'context', 'output'];

/** The kinds a context may hold, in any registry that takes a context. */
export const CONTEXT_KINDS: readonly Kind[] = ['executor', 'position', 'rotation', 'dimension', 'state'];

/** The primitives a data type (storage, arguments, macro, and everything inside) is made of. */
export const DATA_PRIMITIVES: ReadonlySet<string> = new Set(['byte', 'short', 'int', 'long', 'float', 'double', 'number', 'string', 'boolean', 'any']);

/** The primitives a context kind may be typed with, whether it takes arrays, and its default type. */
export const CONTEXT_KIND_TYPES: Partial<Record<Kind, { primitives: readonly string[], arrays: boolean, fallback: string }>> = {
    executor: { primitives: ['player', 'entity'], arrays: true, fallback: 'entity[]' },
    position: { primitives: ['xyz', 'player', 'entity'], arrays: false, fallback: 'xyz' },
    rotation: { primitives: ['xy', 'player', 'entity'], arrays: false, fallback: 'xy' },
    dimension: { primitives: ['overworld', 'nether', 'end', 'any'], arrays: false, fallback: 'any' },
};

/** The kinds which carry no type at all, with the reason. */
export const KINDS_WITHOUT_TYPE: Partial<Record<Kind, string>> = {
    state: 'a state carries no type',
    success: 'a success carries no type, it is always 0 or 1',
};

/** The kinds which need a type, and what it must be. */
export const KINDS_WITH_DATA: Partial<Record<Kind, 'struct' | 'data'>> = {
    macro: 'struct',
    arguments: 'struct',
    storage: 'data',
};

/** The type of a result, by registry. */
export const resultType = (registry: Registry | undefined): 'int' | 'float' => registry === 'context_float_provider' ? 'float' : 'int';

/** What each registry may declare, by role. */
const FUNCTION_KINDS: Record<Role, readonly Kind[]> = { context: CONTEXT_KINDS, input: ['storage', 'arguments', 'macro', 'state'], output: ['storage', 'state', 'result', 'success'] };
const TAG_KINDS: Record<Role, readonly Kind[]> = { context: [], input: [], output: [] };
export const REGISTRY_KINDS: Record<Registry, Record<Role, readonly Kind[]>> = {
    function: FUNCTION_KINDS,
    function_tag: FUNCTION_KINDS,
    predicate: { context: CONTEXT_KINDS, input: ['storage', 'state'], output: ['success'] },
    loot_table: { context: CONTEXT_KINDS, input: ['storage', 'state'], output: ['state'] },
    context_int_provider: { context: CONTEXT_KINDS, input: ['storage', 'state'], output: ['result'] },
    context_float_provider: { context: CONTEXT_KINDS, input: ['storage', 'state'], output: ['result'] },
    block_tag: TAG_KINDS,
    entity_type_tag: TAG_KINDS,
};

// --- the file

/** The id of the module: the name of the directory holding the file. */
export function moduleIdOf(node: AstNode): string {
    return AstUtils.getDocument(node).uri.path.split('/').at(-2) ?? '';
}

/** The name of a feature, its namespace dropped. */
export function featureName(feature: Feature): string {
    const colon = feature.id.indexOf(':');
    return colon === -1 ? feature.id : feature.id.slice(colon + 1);
}

const isFeatureNode = (node: Module | Feature): node is Feature => node.$type === 'Feature';
export const propertiesOf = (node: Module | Feature): Property[] => (isFeatureNode(node) ? node.items : node.head).filter(isProperty);
export const propertyOf = (node: Module | Feature, key: string): Property | undefined => propertiesOf(node).find(p => p.key === key);
export const variablesOf = (module: Module): Variable[] => module.head.filter(isVariable);

// --- slots and definitions

/** A '$' definition with a kind, as opposed to a type alias. */
export const isSlotDefinition = (variable: Variable | undefined): boolean => variable?.declaration !== undefined;

/** The declaration of a slot, through its '$' reference when it has one. */
export function declarationOf(slot: Slot): Declaration | undefined {
    return slot.declaration ?? slot.reference?.ref?.declaration;
}

/** The doc of a slot: its own, or the one of the definition it refers to. */
export function docOf(slot: Slot): string | undefined {
    return slot.description ?? slot.reference?.ref?.description;
}

/** The type a declaration is used with, its default when it declares none. */
export function typeOf(declaration: Declaration, registry?: Registry): string | undefined {
    if (declaration.type) {
        return typeToString(declaration.type);
    }
    if (declaration.kind === 'result') {
        return resultType(registry);
    }
    return CONTEXT_KIND_TYPES[declaration.kind]?.fallback;
}

// --- types

/**
 * The type behind the aliases: a reference to a type alias is replaced by the aliased type,
 * recursively. A reference to a slot definition, to nothing, or through a cycle resolves to
 * nothing: these are reported by validation.
 */
export function resolveType(type: Type | undefined, seen: Set<Variable> = new Set()): Type | undefined {
    if (!isReferenceType(type)) {
        return type;
    }
    const variable = type.reference.ref;
    if (!variable || !variable.type || seen.has(variable)) {
        return undefined;
    }
    return resolveType(variable.type, new Set(seen).add(variable));
}

/** The text of a type, as written, aliases kept by name. */
export function typeToString(type: Type | undefined): string {
    if (!type) {
        return '';
    }
    const attributes = 'attributes' in type && type.attributes.length > 0 ? type.attributes.join(' ') + ' ' : '';
    if (isPrimitiveType(type)) {
        return attributes + type.name + rangeToString(type.range);
    }
    if (isListType(type)) {
        return attributes + (type.tuple
            ? `[${type.elements.map(typeToString).join(', ')}${type.elements.length === 1 ? ',' : ''}]`
            : `[${typeToString(type.elements[0])}]${rangeToString(type.range)}`);
    }
    if (isStructType(type)) {
        return attributes + (type.entries.length === 0 ? '{}'
            : `{ ${type.entries.map(e => `${e.name}${e.optional ? '?' : ''}: ${typeToString(e.type)}`).join(', ')} }`);
    }
    if (isReferenceType(type)) {
        return attributes + '$' + type.reference.$refText;
    }
    if (isArrayType(type)) {
        return `${attributes}${typeToString(type.element)}[]${rangeToString(type.range)}`;
    }
    if (isUnionType(type)) {
        return type.members.map(typeToString).join(' | ');
    }
    return '';
}

function rangeToString(range: { value?: number, min?: number, max?: number } | undefined): string {
    if (!range) {
        return '';
    }
    if (range.value !== undefined) {
        return ` @ ${range.value}`;
    }
    return ` @ ${range.min ?? ''}..${range.max ?? ''}`;
}

/** 'a' or 'an', for a message. */
export const article = (word: string): string => /^[aeiou]/.test(word) ? 'an' : 'a';
