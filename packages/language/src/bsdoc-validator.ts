import { AstUtils, type AstNode, type DiagnosticInfo, type ValidationAcceptor, type ValidationChecks } from 'langium';
import type { BsdocServices } from './bsdoc-module.js';
import {
    REGISTRIES,
    article,
    definitionsOf,
    expandedNames,
    linesOf,
    listsInId,
    listsOf,
    metadataOf,
    moduleOf,
    rangeIn,
    referencesIn,
    resolveType,
    resultType,
    shapeOf,
    structOf,
    textPartsOf,
    typeToString,
    type List,
    type Shape,
} from './bsdoc-model.js';
import {
    isContext,
    isDefinition,
    isFeature,
    isField,
    isMetadata,
    isPaste,
    isPrimitiveType,
    isProperty,
    isReferenceType,
    isSlot,
    isStructType,
    type BsdocAstType,
    type BlockItem,
    type Definition,
    type Feature,
    type Field,
    type ListProperty,
    type Metadata,
    type Module,
    type Paste,
    type Property,
    type Range,
    type ReferenceType,
    type Slot,
} from './generated/ast.js';

export function registerValidationChecks(services: BsdocServices) {
    const validator = services.validation.BsdocValidator;
    const checks: ValidationChecks<BsdocAstType> = {
        Module: [validator.checkHead, validator.checkDefinitions, validator.checkListKeys, validator.checkFeatureNames],
        Property: validator.checkValue,
        Metadata: validator.checkValue,
        ListProperty: validator.checkValue,
        Definition: validator.checkFields,
        Slot: validator.checkFields,
        Field: validator.checkFields,
        ReferenceType: validator.checkReferenceType,
        Paste: validator.checkPaste,
        Feature: validator.checkFeature,
        Range: validator.checkRange,
    };
    services.validation.ValidationRegistry.register(checks, validator);
}

/** The types whose value range may have fractional bounds. */
const FRACTIONAL = new Set(['float', 'double', 'number']);

const SHAPES: Record<Shape, string> = { type: 'a type', struct: 'a struct', lines: 'lines', list: 'a list' };

const BUNDLE = "a bundle holds a doc, 'name', 'slug', 'version', 'tags' and 'documentation', nothing else";

const line = (node: AstNode): number => (node.$cstNode?.range.start.line ?? 0) + 1;
const list = (words: readonly string[]): string => words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} or ${words.at(-1)}`;

/** A field or a line is reported on the word which opens it, not on its whole block. */
function opening(item: BlockItem): DiagnosticInfo<AstNode, string> {
    return { node: item, property: isField(item) ? 'name' : isSlot(item) ? 'role' : isPaste(item) ? 'reference' : isMetadata(item) ? 'key' : 'kind' };
}

/**
 * What helps while typing. The kinds and their types are checked by the type system, in
 * 'bsdoc-typir.ts'; the values of the head, the stamps, the namespaces, the storages and the
 * folders are left to the builder.
 */
export class BsdocValidator {

    checkValue(node: Property | Metadata | ListProperty, accept: ValidationAcceptor): void {
        if (node.value === undefined && node.key !== 'deprecated' && node.key !== 'experimental') {
            accept('error', `'${node.key}' needs a value`, { node, property: 'key' });
        }
    }

    /** The head comes before the '$' definitions and holds no contributors, and a bundle holds properties only. */
    checkHead(module: Module, accept: ValidationAcceptor): void {
        const bundle = AstUtils.getDocument(module).uri.path.endsWith('/bundle.bs');
        let definition: Definition | undefined;
        for (const item of module.head) {
            if (isDefinition(item)) {
                definition ??= item;
                if (bundle) {
                    accept('error', BUNDLE, { node: item, property: 'name' });
                }
                continue;
            }
            if (definition) {
                accept('error', `'${item.key}' is written after '$${definition.name}': the head of the module comes before its '$' definitions`, { node: item, property: 'key' });
            }
            if (bundle && (!isProperty(item) || item.key === 'weak_dependencies')) {
                accept('error', BUNDLE, { node: item, property: 'key' });
            } else if (item.key === 'contributors') {
                // every feature would inherit it, and nothing clears it for the ones which have none
                accept('error', "'contributors' is written on features, not in the head", { node: item, property: 'key' });
            }
        }
        for (const feature of bundle ? module.features : []) {
            accept('error', BUNDLE, { node: feature, property: 'id' });
        }
    }

    /** A '$' name is defined once, a list aside, refers to no cycle, holds either fields or lines, and is used. */
    checkDefinitions(module: Module, accept: ValidationAcceptor): void {
        const lists = listsOf(module);
        const referenced = new Set<string>();
        for (const node of AstUtils.streamAllContents(module)) {
            if ((isReferenceType(node) || isPaste(node)) && node.reference.ref) {
                referenced.add(node.reference.ref.name);
            } else if (isFeature(node)) {
                listsInId(node, lists).forEach(found => referenced.add(found.name));
            }
        }
        const seen = new Map<string, Definition>();
        for (const definition of definitionsOf(module)) {
            const previous = seen.get(definition.name);
            if (!previous) {
                seen.set(definition.name, definition);
                if (!referenced.has(definition.name)) {
                    accept('warning', `'$${definition.name}' is never referenced`, { node: definition, property: 'name' });
                }
            } else if (!(previous.list && definition.list)) {
                accept('error', `'$${definition.name}' is already declared on line ${line(previous)}`, { node: definition, property: 'name' });
            }
            if (definition.list) {
                this.checkList(definition, lists.get(definition.name)!, accept);
                continue;
            }
            if (!definition.type) {
                // the block under a bare '$name:' holds lines
                for (const item of definition.body.filter(isField)) {
                    accept('error', `a field belongs to a struct: write '$${definition.name}: struct'`, opening(item));
                }
            }
            const cycle = cycleOf(definition, [definition]);
            if (cycle) {
                accept('error', `'$${definition.name}' refers to itself through ${cycle.map(d => '$' + d.name).join(' > ')}`, { node: definition, property: 'name' });
            }
        }
    }

    /** An item of a list is defined once, and so is a property of an item. */
    private checkList(definition: Definition, items: List, accept: ValidationAcceptor): void {
        definition.items.forEach((name, index) => {
            const first = items.items.get(name)!.definition;
            if (first !== definition || definition.items.indexOf(name) !== index) {
                accept('error', `'${name}' is already an item of '$${definition.name}', on line ${line(first)}`, { node: definition, property: 'items', index });
            }
        });
        const keys = new Map<string, ListProperty>();
        for (const property of definition.properties) {
            const previous = keys.get(property.key);
            if (previous) {
                accept('error', `'${property.key}' is already given on line ${line(previous)}`, { node: property, property: 'key' });
            } else {
                keys.set(property.key, property);
            }
        }
    }

    /** A '$list.key' is defined by every item of the list. */
    checkListKeys(module: Module, accept: ValidationAcceptor): void {
        const lists = listsOf(module);
        for (const part of AstUtils.streamAllContents(module).flatMap(textPartsOf)) {
            for (const reference of referencesIn(part.text, lists)) {
                const key = reference.key;
                if (!reference.list || key === undefined) {
                    continue;
                }
                const missing = [...reference.list.items.values()].filter(item => !item.properties.has(key)).map(item => `'${item.name}'`);
                if (missing.length > 0) {
                    accept('error', `'$${reference.name}.${key}' is not defined for the item${missing.length > 1 ? 's' : ''} ${missing.join(', ')}`,
                        { node: part.node, range: rangeIn(part, reference.offset, reference.length) });
                }
            }
        }
    }

    /** Two features with the same registry and name are an error, repeated or not. */
    checkFeatureNames(module: Module, accept: ValidationAcceptor): void {
        const lists = listsOf(module);
        const seen = new Map<string, Feature>();
        for (const feature of module.features) {
            for (const name of new Set(expandedNames(feature, lists))) {
                const key = `${feature.registry} ${name}`;
                const previous = seen.get(key);
                if (previous) {
                    accept('error', `'${key}' is already declared on line ${line(previous)}`, { node: feature, property: 'id' });
                    break;
                }
                seen.set(key, feature);
            }
        }
    }

    /** A '$' name used as a type is a type or a struct. */
    checkReferenceType(node: ReferenceType, accept: ValidationAcceptor): void {
        const target = node.reference.ref;
        const shape = shapeOf(target);
        if (target && (shape === 'lines' || shape === 'list')) {
            accept('error', `'$${target.name}' is ${SHAPES[shape]}, not a type: it is declared on line ${line(target)}`, { node, property: 'reference' });
        }
    }

    /** Lines are pasted among lines, a struct among fields. */
    checkPaste(paste: Paste, accept: ValidationAcceptor): void {
        const target = paste.reference.ref;
        const shape = shapeOf(target);
        if (!target || !shape) {
            return;
        }
        const container = paste.$container;
        const lines = isFeature(container) || (isDefinition(container) && !container.type);
        if (lines ? shape !== 'lines' : !structOf(target)) {
            accept('error', `'$${target.name}' is ${SHAPES[shape]}, not ${lines ? 'lines' : 'a struct'}: it is declared on line ${line(target)}`, { node: paste, property: 'reference' });
        }
    }

    /** A field is named once and has a type, a colon announces a type, and the fields under a line are the ones of the one 'struct' its type holds. */
    checkFields(owner: Definition | Slot | Field, accept: ValidationAcceptor): void {
        const seen = new Map<string, Field>();
        for (const field of (owner.body as readonly AstNode[]).filter(isField)) {
            const previous = seen.get(field.name);
            if (previous) {
                accept('error', `'${field.name}' is already declared on line ${line(previous)}`, { node: field, property: 'name' });
            } else {
                seen.set(field.name, field);
            }
        }
        if (isField(owner) && !owner.type) {
            const hint = owner.body.length > 0 ? ": write 'struct' for the fields under it" : '';
            accept('error', `'${owner.name}' needs a type${hint}`, { node: owner, property: 'name' });
        }
        if (isSlot(owner) && owner.colon && !owner.type) {
            accept('error', 'a colon announces a type: remove it, the fields under the line need none', { node: owner, property: 'colon' });
        }
        if (!owner.type) {
            return;
        }
        const structs = AstUtils.streamAst(owner.type).filter(isStructType).toArray();
        for (const extra of structs.slice(1)) {
            accept('error', "a line has one 'struct', since one block of fields follows it: name the others with '$'", { node: extra });
        }
        if (owner.body.length > 0 && structs.length === 0) {
            accept('error', `these fields belong to no struct: '${typeToString(owner.type)}' holds none`, { node: owner, property: 'type' });
        }
    }

    /** A feature, with the lines it pastes: its lists, what its registry accepts and needs, its macro form and its metadata. */
    checkFeature(feature: Feature, accept: ValidationAcceptor): void {
        const lists = listsOf(moduleOf(feature));
        const rules = REGISTRIES[feature.registry];
        const what = `${article(feature.registry)} ${feature.registry}`;
        const lines = linesOf(feature);
        /** A pasted line is reported on the paste of the feature it comes through. */
        const report = (message: string, via: Paste | undefined, info: DiagnosticInfo<AstNode, string>) => via
            ? accept('error', `${message} (pasted from '$${via.reference.$refText}')`, { node: via, property: 'reference' })
            : accept('error', message, info);

        const id = textPartsOf(feature).find(part => part.property === 'id');
        for (const reference of id ? referencesIn(id.text, lists) : []) {
            if (!reference.list) {
                accept('error', `'$${reference.name}' is not a list`, { node: feature, range: rangeIn(id!, reference.offset, reference.length) });
            }
        }

        // a list replaced in a text of the feature is one of its id
        const repeated = new Set(listsInId(feature, lists));
        const reported = new Set<string>();
        const checkTexts = (node: AstNode, via?: Paste) => {
            for (const part of textPartsOf(node).filter(part => part.property !== 'id')) {
                for (const reference of referencesIn(part.text, lists)) {
                    if (!reference.list || repeated.has(reference.list)) {
                        continue;
                    }
                    if (!via) {
                        accept('error', `the list '$${reference.name}' is not in the id of this feature`, { node: part.node, range: rangeIn(part, reference.offset, reference.length) });
                    } else if (!reported.has(`${via.$cstNode?.offset} ${reference.name}`)) {
                        reported.add(`${via.$cstNode?.offset} ${reference.name}`);
                        accept('error', `'$${via.reference.$refText}' uses the list '$${reference.name}', which is not in the id of this feature`, { node: via, property: 'reference' });
                    }
                }
            }
        };
        AstUtils.streamAst(feature).forEach(node => checkTexts(node));
        for (const { line, via } of lines) {
            if (via) {
                AstUtils.streamAst(line).forEach(node => checkTexts(node, via));
            }
        }

        for (const { line, via } of lines) {
            if (isContext(line) && !rules.context) {
                report(`${what} declares no context`, via, { node: line, property: 'kind' });
            } else if (isSlot(line) && !rules[line.role].includes(line.kind)) {
                const allowed = rules[line.role];
                report(allowed.length === 0 ? `${what} declares no ${line.role}` : `${what} takes no ${line.kind} as ${line.role}, only ${list(allowed)}`,
                    via, { node: line, property: 'role' });
            } else if (isSlot(line) && via && line.kind === 'result') {
                // lines take an int or a float as a result: which one is only known where they are pasted
                const resolved = resolveType(line.type);
                const expected = resultType(feature.registry);
                if (isPrimitiveType(resolved) && resolved.name === (expected === 'int' ? 'float' : 'int')) {
                    report(`'${typeToString(line.type)}' is not a type this result takes, it is ${article(expected)} ${expected}`, via, { node: line });
                }
            }
        }
        const slots = lines.filter((entry): entry is { line: Slot, via?: Paste } => isSlot(entry.line));
        const macros = slots.filter(({ line }) => line.role === 'input' && (line.kind === 'arguments' || line.kind === 'macro'));
        const other = macros.filter(({ line }) => line.kind !== macros[0].line.kind).at(-1);
        if (other) {
            report("a feature takes one macro form: 'input arguments' and 'input macro' cannot both be declared", other.via, { node: other.line, property: 'kind' });
        }
        if (rules.required && !slots.some(({ line }) => line.role === 'output' && line.kind === rules.required)) {
            accept('error', `${what} needs an 'output ${rules.required}'`, { node: feature, property: 'id' });
        }

        const metadata = metadataOf(feature);
        for (const key of ['authors', 'since'] as const) {
            if (!metadata.has(key)) {
                accept('error', `'${key}' is missing: write it in the feature, in the lines it pastes or in the head of the module`, { node: feature, property: 'id' });
            }
        }
    }

    checkRange(range: Range, accept: ValidationAcceptor): void {
        if (range.min !== undefined && range.max !== undefined && range.min > range.max) {
            accept('error', `the minimum ${range.min} is greater than the maximum ${range.max}`, { node: range });
        }
        // every other range bounds a whole quantity: a size, or an integer type
        const container = range.$container;
        if (isPrimitiveType(container) && FRACTIONAL.has(container.name)) {
            return;
        }
        for (const property of ['value', 'min', 'max'] as const) {
            const bound = range[property];
            if (bound !== undefined && !Number.isInteger(bound)) {
                accept('error', `a bound must be a whole number, not ${bound}`, { node: range, property });
            }
        }
    }
}

/** The '$' names leading from a definition back to itself, if any: through a type, a field or a paste. */
function cycleOf(definition: Definition, path: Definition[]): Definition[] | undefined {
    for (const node of AstUtils.streamAst(definition)) {
        const target = isReferenceType(node) || isPaste(node) ? node.reference.ref : undefined;
        if (target === path[0]) {
            return path;
        }
        const cycle = target && !path.includes(target) ? cycleOf(target, [...path, target]) : undefined;
        if (cycle) {
            return cycle;
        }
    }
    return undefined;
}
