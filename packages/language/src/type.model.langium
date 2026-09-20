import './model';

type Type = PrimitiveType | ListType | StructType | ReferenceType | ArrayType | UnionType;

interface PrimitiveType {
    attributes: string[];
    name: string;
    range?: Range;
}

/** 'int[]': an array of one of five primitives, attributed as a whole. */
interface ArrayType {
    attributes: string[];
    element: PrimitiveType;
    range?: Range;
}

interface ListType {
    attributes: string[];
    elements: Type[];
    tuple: boolean;
    range?: Range;
}

interface StructType {
    attributes: string[];
    entries: StructEntry[];
}

interface StructEntry {
    name: string;
    optional: boolean;
    type: Type;
    description?: string;
}

interface UnionType {
    members: Type[];
}

interface ReferenceType {
    attributes: string[];
    reference: @Variable;
}

interface Range {
    value?: number;
    min?: number;
    max?: number;
}
