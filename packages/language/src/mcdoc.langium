import './model'
import './terminals'

// a union is a binary tree, so 'int | string | bool' nests; a single type stays what it is
infix Type on SingleType returns UnionType: '|';

// '[]' is a postfix, so 'player[]' and 'int @ 0..9 []' nest without left recursion
SingleType returns Type:
    ElementType ({ArrayType.elements+=current} '[' ']' sizeRange=RangeType?)*;

ElementType returns Type: PrimitiveType | CompositeType;

PrimitiveType returns PrimitiveType:
      RangeablePrimitiveType
    | {BoolType} 'boolean'
    | {AnyType} 'any'
    | {PlayerType} 'player'
    | {EntityType} 'entity'
    | {XyType} 'xy'
    | {XyzType} 'xyz'
    | {OverworldType} 'overworld'
    | {NetherType} 'nether'
    | {EndType} 'end';

RangeablePrimitiveType returns RangeablePrimitiveType:
    (
          {ShortType} 'short'
        | {FloatType} 'float'
        | {DoubleType} 'double'
        | {StringType} 'string'
        | {NumberType} 'number'
    ) valueRange=RangeType?
    | MinecraftArrayType;

MinecraftArrayType returns MinecraftArrayType:
    ( {IntType} 'int'
    | {ByteType} 'byte'
    | {LongType} 'long'
    ) valueRange=RangeType?;

CompositeType returns CompositeType:
    ListType | TupleType | StructType;

ListType returns ListType:
    '[' element=Type ']' sizeRange=RangeType?;

TupleType returns TupleType:
    '[' elements+=Type ',' (elements+=Type (',' elements+=Type)* )? ']';

StructType returns StructType: '{'
    NL? entries+=StructTypeEntry+
     '}';

RangeType returns NumberRangeType:
    '@' NumberRange;

StructTypeEntry returns StructTypeEntry: property=ID (optional?='?')? ':' type=Type description+=DOC? NL?;

NumberRange returns NumberRangeType:
    ExactNumberRange | MinNumberRange | MaxNumberRange | FullNumberRange;

ExactNumberRange returns NumberRangeType:
    value=NumberValue;

MinNumberRange returns NumberRangeType:
    min=NumberValue '..';

MaxNumberRange returns NumberRangeType:
    '..' max=NumberValue;

FullNumberRange returns NumberRangeType:
    min=NumberValue '..' max=NumberValue;

NumberValue returns number: NUMBER ('.' NUMBER?)? | '.' NUMBER;
