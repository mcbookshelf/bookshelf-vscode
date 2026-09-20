import './model'
import './terminals'

// a union is flat: 'a | b | c' is one node with three members; a single member stays what it is
Type returns Type:
    Base ({UnionType.members+=current} ('|' members+=Base)+)?;

// every base takes attributes first
Base returns Type:
    ArrayType | PrimitiveType | ListType | StructType | ReferenceType;

// an array: a Minecraft array of numbers, 'int[]' or 'byte @ 0..1 [] @ 3', or an executor array,
// 'entity[]' or 'player[]', which takes no element range.
ArrayType returns ArrayType:
    attributes+=ATTRIBUTE* element=ArrayElement '[' ']' ('@' range=Range)?;

ArrayElement returns PrimitiveType:
      name=('int' | 'byte' | 'long') ('@' range=Range)?
    | name=('entity' | 'player');

PrimitiveType returns PrimitiveType:
    attributes+=ATTRIBUTE* name=PrimitiveName ('@' range=Range)?;

// '[a]' is a list, bounded in size; '[a, b]' and '[a,]' are tuples
ListType returns ListType:
    attributes+=ATTRIBUTE* '[' elements+=Type
    ( ']' ('@' range=Range)?
    | tuple?=',' (elements+=Type (',' elements+=Type)*)? ']' );

// one entry per line; '{}' is any compound
StructType returns StructType:
    attributes+=ATTRIBUTE* '{' (NL entries+=StructEntry*)? '}';

StructEntry returns StructEntry:
    name=Name (optional?='?')? ':' type=Type ','? End;

ReferenceType returns ReferenceType:
    attributes+=ATTRIBUTE* reference=[Variable:VARIABLE];

// 'min..max', 'min..', '..max' or an exact value
Range returns Range:
      min=NumberValue '..' max=NumberValue
    | min=NumberValue '..'
    | '..' max=NumberValue
    | value=NumberValue;

NumberValue returns number: INT | FLOAT;

PrimitiveName returns string:
    'int' | 'byte' | 'long' | 'short' | 'string' | 'float' | 'double' | 'number'
    | 'boolean' | 'any' | 'player' | 'entity' | 'xyz' | 'xy' | 'overworld' | 'nether' | 'end';

Name returns string:
    ID | 'feature' | 'storage' | 'arguments' | PrimitiveName
    | 'executor' | 'rotation' | 'position' | 'dimension' | 'state' | 'result' | 'success' | 'macro'
    | 'function' | 'function_tag' | 'predicate' | 'loot_table' | 'context_int_provider' | 'context_float_provider' | 'block_tag' | 'entity_type_tag';

// the tail of a line: its doc, on the same line or on the next one, then the line end
fragment End:
    NL description=DOC NL | description=DOC? NL;
