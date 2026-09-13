import type { ValidationAcceptor, ValidationChecks } from 'langium';
import { isProperty, type BookshelfDocAstType, type Feature, type Module, type NumberRangeType, type Property, type StructType } from './generated/ast.js';
import type { BookshelfDocServices } from './bookshelf-doc-module.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: BookshelfDocServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.BookshelfDocValidator;
    const checks: ValidationChecks<BookshelfDocAstType> = {
        Feature: validator.checkUpdatedAfterCreated,
        Property: validator.checkPropertyValue,
        NumberRangeType: validator.checkRangeBounds,
        StructType: validator.checkUniqueEntries,
    };
    registry.register(checks, validator);
}

const SLUG = /^[a-z][a-z0-9-]*$/;
/** The types whose value range may have fractional bounds. */
const FRACTIONAL_TYPES = new Set<string>(['FloatType', 'DoubleType', 'NumberType']);
/** A 'created' or 'updated' value: a date, then the Minecraft version. */
const WHEN = /^(\d{4})\/(\d{2})\/(\d{2}) \S+$/;

const properties = (node: Module | Feature) => node.slots.filter(isProperty);
const propertyOf = (node: Module | Feature, key: string) => properties(node).find(p => p.key === key);

/** The date of a 'created' or 'updated' property, if its value has the expected shape. */
function dateOf(property: Property | undefined): string | undefined {
    return property && WHEN.test(property.value) ? property.value.split(' ')[0] : undefined;
}

/**
 * Implementation of custom validations.
 */
export class BookshelfDocValidator {


    /** A property value is free text, so the shape of the ones that have one is checked here. */
    checkPropertyValue(property: Property, accept: ValidationAcceptor): void {
        const complain = (message: string) => accept('error', message, { node: property, property: 'value' });
        switch (property.key) {
            case 'slug':
            case 'tags':
                for (const value of property.value.split(',').map(v => v.trim())) {
                    if (!SLUG.test(value)) {
                        complain(`'${value}' must start with a lowercase letter and only contain lowercase letters, digits and dashes.`);
                    }
                }
                break;
            case 'created':
            case 'updated': {
                const match = WHEN.exec(property.value);
                if (!match) {
                    complain(`'${property.value}' is not a date followed by a Minecraft version, as in '2022/04/14 1.18.2'.`);
                    break;
                }
                const [year, month, day] = match.slice(1).map(Number);
                const date = new Date(year, month - 1, day);
                if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
                    complain(`'${match[0].split(' ')[0]}' is not an existing date.`);
                }
            }
        }
    }

    checkUpdatedAfterCreated(feature: Feature, accept: ValidationAcceptor): void {
        const created = dateOf(propertyOf(feature, 'created'));
        const updated = dateOf(propertyOf(feature, 'updated'));
        // YYYY/MM/DD is fixed width and zero padded, so it sorts as a string
        if (created && updated && updated < created) {
            accept('error', `The update date ${updated} is before the creation date ${created}.`,
                { node: propertyOf(feature, 'updated')!, property: 'value' });
        }
    }

    checkRangeBounds(range: NumberRangeType, accept: ValidationAcceptor): void {
        if (range.min !== undefined && range.max !== undefined && range.min > range.max) {
            accept('error', `The minimum ${range.min} is greater than the maximum ${range.max}.`, { node: range });
        }
        // every other range bounds a whole quantity: a size, a length, or an integer type
        if (FRACTIONAL_TYPES.has(range.$container.$type)) {
            return;
        }
        for (const property of ['value', 'min', 'max'] as const) {
            const bound = range[property];
            if (bound !== undefined && !Number.isInteger(bound)) {
                accept('error', `A bound must be a whole number, but was ${bound}.`, { node: range, property });
            }
        }
    }

    checkUniqueEntries(struct: StructType, accept: ValidationAcceptor): void {
        const seen = new Set<string>();
        for (const entry of struct.entries) {
            if (seen.has(entry.property)) {
                accept('error', `Duplicate struct entry '${entry.property}'.`, { node: entry, property: 'property' });
            }
            seen.add(entry.property);
        }
    }
}
