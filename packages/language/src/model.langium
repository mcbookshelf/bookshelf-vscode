import './type.model';

type HeadItem = Property | Metadata | Definition;

type Line = Metadata | Context | Slot | Paste;

type BlockItem = Line | Field;

type Registry = 'function' | 'predicate' | 'loot_table' | 'context_int_provider' | 'context_float_provider' | 'block_tag' | 'entity_type_tag' | 'structure';

type HeadKey = 'name' | 'slug' | 'version' | 'documentation' | 'tags' | 'weak_dependencies';

type MetadataKey = 'authors' | 'contributors' | 'since' | 'deprecated' | 'experimental';

type ContextKind = '@executor' | '@position' | '@rotation' | '@dimension' | '@state';

type Role = 'input' | 'output';

type Kind = 'state' | 'result' | 'success' | 'macro' | 'storage' | 'arguments';

interface Module {
    description?: string;
    head: HeadItem[];
    features: Feature[];
}

interface Property {
    key: HeadKey;
    value?: string;
}

interface Metadata {
    key: MetadataKey;
    value?: string;
}

/** A type, lines when it has none or, when `list` is set, some items of a list. */
interface Definition {
    name: string;
    type?: Type;
    description?: string;
    body: BlockItem[];
    list: boolean;
    items: string[];
    properties: ListProperty[];
}

interface ListProperty {
    key: string;
    value?: string;
}

interface Feature {
    registry: Registry;
    id: string;
    description?: string;
    body: Line[];
}

interface Context {
    kind: ContextKind;
    type?: Type;
    description?: string;
}

interface Slot {
    role: Role;
    kind: Kind;
    id?: string;
    path?: string;
    colon: boolean;
    type?: Type;
    description?: string;
    body: Member[];
}

interface Paste {
    reference: @Definition;
}
