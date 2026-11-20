import './model'
import './terminals'

// A union is flat: 'a | b | c' is one node with three members.
Type returns Type:
    Base ({UnionType.members+=current} ('|' members+=Base)+)?;

Base returns Type:
    ArrayType | PrimitiveType | ListType | StructType | ReferenceType;

// 'int[]', 'byte @ 0..1 [] @ 3', and 'entity[]' or 'player[]', which take no element range
ArrayType returns ArrayType:
    attributes+=ATTRIBUTE* element=ArrayElement '[' ']' ('@' range=Range)?;

ArrayElement returns PrimitiveType:
      name=('int' | 'byte' | 'long') ('@' range=Range)?
    | name=('entity' | 'player');

PrimitiveType returns PrimitiveType:
    attributes+=ATTRIBUTE* name=PrimitiveName ('@' range=Range)?;

// '[a]' is a list, '[a, b]' and '[a,]' are tuples
ListType returns ListType:
    attributes+=ATTRIBUTE* '[' elements+=Type
    ( ']' ('@' range=Range)?
    | tuple?=',' (elements+=Type (',' elements+=Type)*)? ']' );

// Its fields are the block under the line it is written on.
StructType returns StructType:
    {StructType} attributes+=ATTRIBUTE* 'struct';

ReferenceType returns ReferenceType:
    attributes+=ATTRIBUTE* reference=[Definition:VARIABLE];

// 'name: type > doc', 'name?: type'. A missing type parses, for validation to ask for it.
Field returns Field:
    name=Name (optional?='?')? ':' type=Type? MemberBlock;

Member returns Member:
    Field | Paste;

// '$x' alone on a line
Paste returns Paste:
    reference=[Definition:VARIABLE] NL;

// 'min..max', 'min..', '..max' or an exact value; a '<' on a side excludes that bound
Range returns Range:
      min=NumberValue operator=('..' | '<..') max=NumberValue?
    | min=NumberValue operator=('..<' | '<..<') max=NumberValue
    | operator=('..' | '..<') max=NumberValue
    | value=NumberValue;

NumberValue returns number: INT | FLOAT;

PrimitiveName returns string:
    'int' | 'byte' | 'long' | 'short' | 'string' | 'float' | 'double' | 'number' | 'boolean' | 'any' | 'player' | 'entity' | 'xyz' | 'xy' | 'overworld' | 'nether' | 'end';

// A language word is a valid name. The '...Word' rules repeat the words rather than call the
// rules which hold them, so that completion can tell a name from a type, a kind or a registry.
Name returns string:
    ID | INT | TypeWord | HeadWord | LineWord | KindWord | RegistryWord;

TypeWord returns string:
    'struct' | 'int' | 'byte' | 'long' | 'short' | 'string' | 'float' | 'double' | 'number' | 'boolean' | 'any' | 'player' | 'entity' | 'xyz' | 'xy' | 'overworld' | 'nether' | 'end';

HeadWord returns string:
    'name' | 'slug' | 'version' | 'documentation' | 'tags' | 'weak_dependencies';

LineWord returns string:
    'feature' | 'input' | 'output' | 'authors' | 'contributors' | 'since' | 'deprecated' | 'experimental';

KindWord returns string:
    'state' | 'result' | 'success' | 'macro' | 'storage' | 'arguments';

RegistryWord returns string:
    'function' | 'predicate' | 'loot_table' | 'context_int_provider' | 'context_float_provider' | 'block_tag' | 'entity_type_tag' | 'structure';

// The doc of a line without a block: on the line, or on the next one. The line end comes first
// in the second case, as in MemberBlock, for completion to see what follows it.
fragment End:
    description=DOC NL | NL (description=DOC NL)?;

// The doc of a line which may hold fields (on the line, on the next one or as the first line
// of the block), then the fields.
fragment MemberBlock:
      description=DOC NL (INDENT body+=Member+ DEDENT)?
    | NL ( description=DOC NL (INDENT body+=Member+ DEDENT)?
         | INDENT (description=DOC NL)? body+=Member+ DEDENT )?;
