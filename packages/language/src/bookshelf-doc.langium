grammar BookshelfDoc

import './model'
import './terminals'
import './mcdoc'

entry Module returns Module:
    NL?
    description+=DOC?
    slots+=ModuleSlot*;

ModuleSlot returns ModuleSlot:
    Feature | Variable | Property;

Feature returns Feature:
    'feature' registry=Registry id=McId ':' NL
        description+=DOC?
        INDENT
        slots+=FeatureSlot*
        DEDENT;

FeatureSlot returns FeatureSlot:
      {Input} 'input' expression=AbstractFeatureSlotExpression NL
    | {Context} 'context' expression=AbstractFeatureSlotExpression NL
    | {Output} 'output' expression=AbstractFeatureSlotExpression NL
    | Property
    | Variable;

Property returns Property:
    key=ID ':' value=TEXT NL;

AbstractFeatureSlotExpression returns AbstractFeatureSlotExpression:
    VariableReference | FeatureSlotExpression;

FeatureSlotExpression returns FeatureSlotExpression:
    kind=Kind (':' definition=Type)? description+=DOC?;

Kind returns Kind:
      {Executor} 'executor'
    | Storage
    | {Rotation} 'rotation'
    | {Position} 'position'
    | {Dimension} 'dimension'
    | {State} 'state'
    | {Result} 'result'
    | {Success} 'success'
    | {Macro} 'macro';

Storage returns Storage:
    'storage' id=MC_ID? path=Path?;

Path returns string: ID ('/' ID)*;

// a resource location, or a bare name in the default namespace
McId returns string: MC_ID | ID;

Registry returns string:
    'function' | 'function_tag' | 'predicate' | 'loot_table' | 'context_float_provider' | 'context_int_provider';

Variable returns Variable:
    'var' name=ID '=' expression=FeatureSlotExpression NL;

VariableReference returns VariableReference:
    'ref' reference=[Variable:ID] description+=DOC?;
