type Type = PrimitiveType | CompositeType;

type PrimitiveType =  RangeablePrimitiveType | BoolType | AnyType | AbstractEntityType | PositionType | RotationType | DimensionType;

type RangeablePrimitiveType = NumericType | StringType;

type MinecraftArrayType = IntType | ByteType | LongType;

type NumericType = MinecraftArrayType | ShortType | FloatType | DoubleType | NumberType;

interface IntType {
    valueRange: NumberRangeType;
}

interface ByteType {
    valueRange: NumberRangeType;

}

interface ShortType {
    valueRange: NumberRangeType;
}

interface LongType {
    valueRange: NumberRangeType;
}

interface FloatType {
    valueRange: NumberRangeType;
}

interface DoubleType {
    valueRange: NumberRangeType;
}

interface StringType {
    valueRange: NumberRangeType;
}

interface NumberType {
    valueRange: NumberRangeType;
}

interface BoolType {}
interface AnyType {}
interface PlayerType {}
interface EntityType {}
interface XyType {}
interface XyzType {}
interface OverworldType {}
interface NetherType {}
interface EndType {}

type AbstractEntityType = EntityType | PlayerType;
type PositionType = XyzType | AbstractEntityType;
type RotationType = XyType | AbstractEntityType;
type DimensionType = OverworldType | NetherType | EndType | AnyType;

type CompositeType = ArrayType | ListType | TupleType | StructType | UnionType;

interface NumberRangeType {
    value?: number;
    min?: number;
    max?: number;
}

interface ArrayType {
    elements: Type[];
    sizeRange: NumberRangeType;
}

interface ListType {
    element: Type
    sizeRange: NumberRangeType;
}

interface TupleType {
    elements: Type[]
}

interface StructType {
    entries: StructTypeEntry[];
}

interface StructTypeEntry {
    optional: boolean;
    property: string;
    type: Type;
    description: string[];
}

interface UnionType {
    left: Type;
    operator: '|';
    right: Type;
}