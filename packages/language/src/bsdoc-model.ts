import { AstUtils, GrammarUtils, type AstNode } from 'langium';
import type { Range as TextRange } from 'vscode-languageserver';
import {
    isArrayType,
    isContext,
    isDefinition,
    isFeature,
    isField,
    isListType,
    isMetadata,
    isPaste,
    isPrimitiveType,
    isProperty,
    isReferenceType,
    isSlot,
    isStructType,
    isUnionType,
    type Context,
    type ContextKind,
    type Definition,
    type Feature,
    type Field,
    type Kind,
    type ListProperty,
    type Metadata,
    type MetadataKey,
    type Module,
    type Paste,
    type Property,
    type Range,
    type Registry,
    type Slot,
    type Type,
} from './generated/ast.js';

// --- the tables of the language

/** The primitives a data type (storage, arguments, macro, and everything inside) is made of. */
export const DATA_PRIMITIVES: readonly string[] = ['byte', 'short', 'int', 'long', 'float', 'double', 'number', 'string', 'boolean', 'any'];

/** The primitives a context may be typed with, whether it takes arrays, and its default type. */
export const CONTEXT_KIND_TYPES: Partial<Record<ContextKind, { primitives: readonly string[], arrays: boolean, fallback: string }>> = {
    '@executor': { primitives: ['player', 'entity'], arrays: true, fallback: 'entity[]' },
    '@position': { primitives: ['xyz', 'player', 'entity'], arrays: false, fallback: 'xyz' },
    '@rotation': { primitives: ['xy', 'player', 'entity'], arrays: false, fallback: 'xy' },
    '@dimension': { primitives: ['overworld', 'nether', 'end', 'any'], arrays: false, fallback: 'any' },
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

export const resultType = (registry: Registry | undefined): 'int' | 'float' => registry === 'context_float_provider' ? 'float' : 'int';

/** What a registry accepts: a context or not, the kinds of its inputs and outputs, and the output it cannot go without. */
export interface RegistryRules {
    context: boolean;
    input: readonly Kind[];
    output: readonly Kind[];
    required?: Kind;
}

const NO_LINES: RegistryRules = { context: false, input: [], output: [] };
export const REGISTRIES: Record<Registry, RegistryRules> = {
    function: { context: true, input: ['arguments', 'macro', 'storage', 'state'], output: ['result', 'success', 'storage', 'state'] },
    predicate: { context: true, input: ['storage', 'state'], output: ['success'], required: 'success' },
    loot_table: { context: true, input: ['storage', 'state'], output: ['state'] },
    context_int_provider: { context: true, input: ['storage', 'state'], output: ['result'], required: 'result' },
    context_float_provider: { context: true, input: ['storage', 'state'], output: ['result'], required: 'result' },
    block_tag: NO_LINES,
    entity_type_tag: NO_LINES,
    structure: NO_LINES,
};

// --- the file

/** The id of the module: the name of the directory holding the file. */
export function moduleIdOf(node: AstNode): string {
    return AstUtils.getDocument(node).uri.path.split('/').at(-2) ?? '';
}

export const moduleOf = (node: AstNode): Module => AstUtils.findRootNode(node) as Module;

/** The name of a feature, its namespace dropped. */
export function featureName(feature: Feature): string {
    return feature.id.slice(feature.id.indexOf(':') + 1);
}

export const propertiesOf = (module: Module): Property[] => module.head.filter(isProperty);
export const definitionsOf = (module: Module): Definition[] => module.head.filter(isDefinition);

// --- definitions

export type Shape = 'type' | 'struct' | 'lines' | 'list';

/** What a definition is: a block is what its first field or line makes it, a block of pastes what it pastes. */
export function shapeOf(definition: Definition | undefined, seen: Set<Definition> = new Set()): Shape | undefined {
    if (!definition || seen.has(definition)) {
        return undefined;
    }
    if (definition.list) {
        return 'list';
    }
    if (definition.type) {
        return 'type';
    }
    const first = definition.body.find(item => !isPaste(item));
    if (first) {
        return isField(first) ? 'struct' : 'lines';
    }
    seen.add(definition);
    for (const item of definition.body) {
        const target = isPaste(item) ? item.reference.ref : undefined;
        const shape = shapeOf(target, seen);
        if (shape === 'struct' || shape === 'lines') {
            return shape;
        }
        if (shape === 'type' && structOf(target)) {
            return 'struct';
        }
    }
    return undefined;
}

/** The definition holding the fields `definition` stands for: a block of fields, '$x: struct', or another name for either. */
export function structOf(definition: Definition | undefined, seen: Set<Definition> = new Set()): Definition | undefined {
    if (!definition || seen.has(definition) || definition.list) {
        return undefined;
    }
    if (!definition.type) {
        return shapeOf(definition) === 'struct' ? definition : undefined;
    }
    if (isStructType(definition.type)) {
        return definition;
    }
    return isReferenceType(definition.type) ? structOf(definition.type.reference.ref, seen.add(definition)) : undefined;
}

// --- lists and repetition

export interface ListItem {
    name: string;
    definition: Definition;
    properties: Map<string, ListProperty>;
}

/** The items of a list in the order they are written, over all its '$name[...]' definitions, and the keys any of them gives. */
export interface List {
    name: string;
    items: Map<string, ListItem>;
    keys: Set<string>;
}

const listCache = new WeakMap<Module, Map<string, List>>();

export function listsOf(module: Module): Map<string, List> {
    let lists = listCache.get(module);
    if (!lists) {
        lists = new Map();
        for (const definition of definitionsOf(module).filter(d => d.list)) {
            const list: List = lists.get(definition.name) ?? { name: definition.name, items: new Map(), keys: new Set() };
            lists.set(definition.name, list);
            const properties = new Map(definition.properties.map(property => [property.key, property]));
            for (const name of definition.items) {
                // an item defined twice is reported by validation: the first one stands
                if (!list.items.has(name)) {
                    list.items.set(name, { name, definition, properties });
                }
            }
            properties.forEach((_, key) => list.keys.add(key));
        }
        listCache.set(module, lists);
    }
    return lists;
}

/** A '$name' or '$name.key' at `offset` in a text; `list` is set when the name is one. */
export interface TextReference {
    offset: number;
    length: number;
    name: string;
    key?: string;
    list?: List;
}

const TEXT_REFERENCE = /\$([A-Za-z_][A-Za-z0-9_]*)(?:\.([A-Za-z_][A-Za-z0-9_]*))?/g;

/** The '$' names of a text. '.key' is read only when it is a property of the list: any other dot is text. */
export function referencesIn(text: string, lists: Map<string, List>): TextReference[] {
    return [...text.matchAll(TEXT_REFERENCE)].map((match) => {
        const [, name, key] = match;
        const list = lists.get(name);
        const keyed = key !== undefined && list?.keys.has(key);
        return { offset: match.index, length: 1 + name.length + (keyed ? 1 + key.length : 0), name, key: keyed ? key : undefined, list };
    });
}

/** A text in which lists are replaced, as written in the file: a doc keeps its '>'. */
export interface TextPart {
    node: AstNode;
    property: 'id' | 'description' | 'value';
    text: string;
    offset: number;
}

/** The id and the doc of a feature, the doc of a line, a field or a definition, the value of a metadata line. */
export function textPartsOf(node: AstNode): TextPart[] {
    const properties: ReadonlyArray<TextPart['property']> = isFeature(node) ? ['id', 'description']
        : isMetadata(node) ? ['value']
        : isContext(node) || isSlot(node) || isField(node) || isDefinition(node) ? ['description']
        : [];
    return properties.flatMap((property) => {
        const cst = GrammarUtils.findNodeForProperty(node.$cstNode, property);
        return cst ? [{ node, property, text: cst.text, offset: cst.offset }] : [];
    });
}

/** The range of `length` characters at `offset` in a text part. */
export function rangeIn(part: TextPart, offset: number, length: number): TextRange {
    const document = AstUtils.getDocument(part.node).textDocument;
    return { start: document.positionAt(part.offset + offset), end: document.positionAt(part.offset + offset + length) };
}

/** The lists the id of a feature holds, in the order they are first written. */
export function listsInId(feature: Feature, lists: Map<string, List> = listsOf(moduleOf(feature))): List[] {
    return [...new Set(referencesIn(feature.id, lists).flatMap(reference => reference.list ?? []))];
}

/** A text with the lists replaced by the given item of each. */
export function substitute(text: string, lists: Map<string, List>, items: ReadonlyMap<List, ListItem>): string {
    let result = '';
    let end = 0;
    for (const reference of referencesIn(text, lists)) {
        const item = reference.list && items.get(reference.list);
        const value = !item ? undefined : reference.key === undefined ? item.name : item.properties.get(reference.key)?.value;
        if (value !== undefined) {
            result += text.slice(end, reference.offset) + value;
            end = reference.offset + reference.length;
        }
    }
    return result + text.slice(end);
}

/** Every combination of the items of the lists a feature is repeated over, the leftmost list changing last. */
export function repetitionsOf(feature: Feature, lists: Map<string, List> = listsOf(moduleOf(feature))): Array<Map<List, ListItem>> {
    let combinations: Array<Map<List, ListItem>> = [new Map()];
    for (const list of listsInId(feature, lists)) {
        combinations = combinations.flatMap(combination => [...list.items.values()].map(item => new Map(combination).set(list, item)));
    }
    return combinations;
}

/** The names a feature exists under, its namespace dropped: one per item when its id holds a list. */
export function expandedNames(feature: Feature, lists: Map<string, List> = listsOf(moduleOf(feature))): string[] {
    return repetitionsOf(feature, lists).map(items => substitute(featureName(feature), lists, items));
}

// --- the lines of a feature

/** A line of a feature: when pasted, `via` is the paste of the feature it comes through. */
export interface FeatureLine {
    line: Metadata | Context | Slot;
    via?: Paste;
}

/** The lines of a feature in the order they apply: the pasted ones, where they are pasted, and its own. */
export function linesOf(feature: Feature): FeatureLine[] {
    const lines: FeatureLine[] = [];
    const collect = (body: readonly AstNode[], via: Paste | undefined, seen: Set<Definition>) => {
        for (const item of body) {
            if (isPaste(item)) {
                const target = item.reference.ref;
                if (target && !seen.has(target) && shapeOf(target) === 'lines') {
                    collect(target.body, via ?? item, new Set(seen).add(target));
                }
            } else if (isMetadata(item) || isContext(item) || isSlot(item)) {
                lines.push({ line: item, via });
            }
        }
    };
    collect(feature.body, undefined, new Set());
    return lines;
}

/** The metadata of a feature: the head of the module, then the lines it pastes, then its own, the later one winning. */
export function metadataOf(feature: Feature): Map<MetadataKey, Metadata> {
    const lines = [...moduleOf(feature).head, ...linesOf(feature).map(({ line }) => line)];
    return new Map(lines.filter(isMetadata).map(line => [line.key, line]));
}

// --- docs and types

/** The doc of a line or a field: its own, or the one of the type it uses when it has none. */
export function docOf(node: Context | Slot | Field | Definition): string | undefined {
    return node.description ?? (isReferenceType(node.type) ? node.type.reference.ref?.description : undefined);
}

/** The type of a line or a field: 'struct' for the fields under it, its default when it declares none. */
export function typeOf(node: Context | Slot | Field | Definition, registry?: Registry): string | undefined {
    if (node.type) {
        return typeToString(node.type);
    }
    if (isContext(node)) {
        return CONTEXT_KIND_TYPES[node.kind]?.fallback;
    }
    if (node.body.length > 0) {
        return 'struct';
    }
    return isSlot(node) && node.kind === 'result' ? resultType(registry) : undefined;
}

/** What a type resolves to: a type, or the definition of a block of fields, which stands for a struct. */
export type Resolved = Type | Definition;

/** The type behind the '$' names; lines, a list, nothing or a cycle resolve to nothing, and are reported by validation. */
export function resolveType(type: Type | undefined, seen: Set<Definition> = new Set()): Resolved | undefined {
    if (!isReferenceType(type)) {
        return type;
    }
    const target = type.reference.ref;
    if (!target || seen.has(target) || target.list) {
        return undefined;
    }
    if (target.type) {
        return resolveType(target.type, new Set(seen).add(target));
    }
    return shapeOf(target) === 'struct' ? target : undefined;
}

/** The text of a type, as written, '$' names kept. */
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
        return attributes + 'struct';
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

function rangeToString(range: Range | undefined): string {
    if (!range) {
        return '';
    }
    return ` @ ${range.value ?? `${range.min ?? ''}${range.operator}${range.max ?? ''}`}`;
}

/** 'a' or 'an', for a message. */
export const article = (word: string): string => /^[aeiou]/.test(word) ? 'an' : 'a';
