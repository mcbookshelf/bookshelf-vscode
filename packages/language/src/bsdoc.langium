grammar Bsdoc

import './model'
import './terminals'
import './mcdoc'

// The head and the definitions share one list: validation checks that the head comes first.
entry Module returns Module:
    NL? (description=DOC NL)? head+=HeadItem* features+=Feature*;

HeadItem returns HeadItem:
    Property | Metadata | Definition;

// 'name Spline'
Property returns Property:
    key=HeadKey value=TEXT? NL;

HeadKey returns HeadKey:
    'name' | 'slug' | 'version' | 'documentation' | 'tags' | 'weak_dependencies';

// 'authors Aksiome, Leirof', 'since 2022/04/14 1.18.2', 'deprecated'
Metadata returns Metadata:
    (key=('authors' | 'contributors' | 'since') value=TEXT? | key=('deprecated' | 'experimental')) NL;

// '$x: type', '$x:' then fields or feature lines (told apart by validation), '$x[item, ...]' then properties.
// One line can follow the name directly, since no line starts like a type: '$x: output state > doc'.
Definition returns Definition:
    name=VARIABLE
    ( ':' ( type=Type MemberBlock
          | body+=DefinitionLine
          | NL INDENT (description=DOC NL)? body+=BlockItem+ DEDENT )
    | list?='[' items+=Name (',' items+=Name)* ']'
      ( ':' NL INDENT properties+=ListProperty+ DEDENT | NL )
    );

BlockItem returns BlockItem:
    Line | Field;

// A paste is left out: '$a: $b' is a type.
DefinitionLine returns Line:
    Metadata | Context | Slot;

// 'key: text'
ListProperty returns ListProperty:
    key=Name ':' value=TEXT? NL;

// 'feature function x > doc': the doc may also be the next line, or the first line of the block
Feature returns Feature:
    'feature' registry=Registry id=FEATURE_ID
    ( description=DOC NL (INDENT body+=Line+ DEDENT)?
    | NL ( description=DOC NL (INDENT body+=Line+ DEDENT)?
         | INDENT (description=DOC NL)? body+=Line* DEDENT )?
    );

Line returns Line:
    Metadata | Context | Slot | Paste;

// '@executor: player[] > doc'
Context returns Context:
    kind=ContextKind (':' type=Type)? End;

ContextKind returns ContextKind:
    '@executor' | '@position' | '@rotation' | '@dimension' | '@state';

// 'input arguments:' then fields, 'output storage bs.example:data some/path: int > doc', 'output success > doc'
Slot returns Slot:
    role=('input' | 'output') kind=Kind id=RESOURCE_LOCATION? path=PathName?
    ( ':' type=Type? MemberBlock | End );

Kind returns Kind:
    'state' | 'result' | 'success' | 'macro' | 'storage' | 'arguments';

Registry returns Registry:
    'function' | 'predicate' | 'loot_table' | 'context_int_provider' | 'context_float_provider' | 'block_tag' | 'entity_type_tag' | 'structure';

PathName returns string:
    Name ('/' Name)*;
