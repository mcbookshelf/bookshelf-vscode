import './model';

type Type = PrimitiveType | ListType | StructType | ReferenceType | ArrayType | UnionType;

type Member = Field | Paste;

interface PrimitiveType {
    attributes: string[];
    name: string;
    range?: Range;
}

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

/** Its fields are the body of the line it is written on. */
interface StructType {
    attributes: string[];
}

/** Its body holds the fields of the `struct` in its type. */
interface Field {
    name: string;
    optional: boolean;
    type?: Type;
    description?: string;
    body: Member[];
}

interface UnionType {
    members: Type[];
}

interface ReferenceType {
    attributes: string[];
    reference: @Definition;
}

/** `operator` is '..', '<..', '..<' or '<..<'. */
interface Range {
    value?: number;
    min?: number;
    max?: number;
    operator?: string;
}
