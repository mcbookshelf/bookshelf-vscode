import { AstUtils, type AstNode, type ValidationAcceptor, type ValidationChecks } from 'langium';
import type { BsdocServices } from './bsdoc-module.js';
import { REGISTRY_KINDS, article, declarationOf, variablesOf } from './bsdoc-model.js';
import {
    isFeature, isPrimitiveType, isReferenceType, isSlot,
    type BsdocAstType, type Feature, type Module, type Range, type Slot, type StructType, type Variable,
} from './generated/ast.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: BsdocServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.BsdocValidator;
    const checks: ValidationChecks<BsdocAstType> = {
        Module: validator.checkDefinitions,
        Slot: validator.checkSlotAllowed,
        Range: validator.checkRange,
        StructType: validator.checkStructEntries,
    };
    registry.register(checks, validator);
}

/** The types whose value range may have fractional bounds. */
const FRACTIONAL = new Set(['float', 'double', 'number']);

const line = (node: AstNode): number => (node.$cstNode?.range.start.line ?? 0) + 1;
const list = (words: readonly string[]): string => words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} or ${words.at(-1)}`;

/**
 * What helps while typing: the '$' definitions and their uses, what a registry takes, and the
 * shape of a struct and a range. The kinds and their types are checked by the type system, in
 * 'bsdoc-typir.ts'. Everything the builder decides on its own (the head properties, the
 * feature stamps, the namespaces, the storages) is left to it.
 */
export class BsdocValidator {

    /** A '$' definition is declared once, refers to no cycle, and is used by its shape. */
    checkDefinitions(module: Module, accept: ValidationAcceptor): void {
        const referenced = new Set<Variable>();
        for (const node of AstUtils.streamAllContents(module)) {
            if (isSlot(node) && node.reference?.ref) {
                const target = node.reference.ref;
                referenced.add(target);
                if (!target.declaration) {
                    accept('error', `'$${target.name}' is a type, not a slot: it is declared on line ${line(target)}`, { node, property: 'reference' });
                }
            } else if (isReferenceType(node) && node.reference.ref) {
                const target = node.reference.ref;
                referenced.add(target);
                if (target.declaration) {
                    accept('error', `'$${target.name}' is a slot, not a type: it is declared on line ${line(target)}`, { node, property: 'reference' });
                }
            }
        }
        const seen = new Map<string, Variable>();
        for (const variable of variablesOf(module)) {
            const previous = seen.get(variable.name);
            if (previous) {
                accept('error', `'$${variable.name}' is already declared on line ${line(previous)}`, { node: variable, property: 'name' });
            } else {
                seen.set(variable.name, variable);
            }
            const cycle = cycleOf(variable, [variable]);
            if (cycle) {
                accept('error', `'$${variable.name}' refers to itself through ${cycle.map(v => '$' + v.name).join(' > ')}`, { node: variable, property: 'name' });
            }
            if (!referenced.has(variable)) {
                accept('warning', `'$${variable.name}' is never referenced`, { node: variable, property: 'name' });
            }
        }
    }

    /** A registry takes some kinds in each role, and none at all in a tag. */
    checkSlotAllowed(slot: Slot, accept: ValidationAcceptor): void {
        const declaration = declarationOf(slot);
        const feature = AstUtils.getContainerOfType(slot, isFeature) as Feature | undefined;
        if (!declaration || !feature) {
            return;
        }
        const allowed = REGISTRY_KINDS[feature.registry][slot.role];
        if (allowed.includes(declaration.kind)) {
            return;
        }
        const what = `${article(feature.registry)} ${feature.registry}`;
        accept('error', allowed.length === 0
            ? `${what} declares no ${slot.role}`
            : `${what} takes no ${declaration.kind} as ${slot.role}, only ${list(allowed)}`, { node: slot, property: 'role' });
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

    checkStructEntries(struct: StructType, accept: ValidationAcceptor): void {
        const seen = new Map<string, AstNode>();
        for (const entry of struct.entries) {
            const previous = seen.get(entry.name);
            if (previous) {
                accept('error', `'${entry.name}' is already declared on line ${line(previous)}`, { node: entry, property: 'name' });
            } else {
                seen.set(entry.name, entry);
            }
        }
    }
}

/** The aliases leading from a type alias back to itself, if any. */
function cycleOf(variable: Variable, path: Variable[]): Variable[] | undefined {
    if (!variable.type) {
        return undefined;
    }
    for (const reference of AstUtils.streamAst(variable.type).filter(isReferenceType)) {
        const target = reference.reference.ref;
        if (target === path[0]) {
            return path;
        }
        if (target && !path.includes(target)) {
            const cycle = cycleOf(target, [...path, target]);
            if (cycle) {
                return cycle;
            }
        }
    }
    return undefined;
}
