grammar Bsdoc

import './model'
import './terminals'
import './mcdoc'

// the first line is the description doc, then properties and '$' definitions, then features
entry Module returns Module:
    NL? (description=DOC NL)? head+=HeadItem* features+=Feature*;

HeadItem returns HeadItem:
    Variable | Property;

// 'key: value', the value being the rest of the line; missing values are reported by validation
Property returns Property:
    key=ID ':' value=TEXT? NL;

// '$x = state' is a slot definition, '$x = string' a type alias: the first token after '=' tells
Variable returns Variable:
    name=VARIABLE '=' (declaration=Declaration | type=Type) End;

// a feature has no closing token: it runs until the next 'feature' line or the end of the file
Feature returns Feature:
    'feature' registry=Registry id=FeatureId End items+=FeatureItem*;

FeatureItem returns FeatureItem:
    Slot | Property;

Slot returns Slot:
    role=('input' | 'context' | 'output') (reference=[Variable:VARIABLE] | declaration=Declaration) End;

Declaration returns Declaration:
    ( kind=('storage' | 'arguments') id=RESOURCE_LOCATION? (path+=PathName ('.' path+=PathName)*)?
    | kind=KindName )
    (':' type=Type)?;

KindName returns Kind:
    'executor' | 'rotation' | 'position' | 'dimension' | 'state' | 'result' | 'success' | 'macro';

Registry returns Registry:
    'function' | 'function_tag' | 'predicate' | 'loot_table' | 'context_int_provider' | 'context_float_provider' | 'block_tag' | 'entity_type_tag';

// a segment of a storage path: '/' is part of the name, '.' separates the segments
PathName returns string:
    Name ('/' Name)*;

// a resource location, or a bare name in the namespace of the module
FeatureId returns string:
    RESOURCE_LOCATION | Name;
