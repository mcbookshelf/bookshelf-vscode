import './type.model';

type HeadItem = Variable | Property;

type FeatureItem = Slot | Property;

type Registry = 'function' | 'function_tag' | 'predicate' | 'loot_table' | 'context_int_provider' | 'context_float_provider' | 'block_tag' | 'entity_type_tag';

type Role = 'input' | 'context' | 'output';

type Kind = 'storage' | 'arguments' | 'executor' | 'rotation' | 'position' | 'dimension' | 'state' | 'result' | 'success' | 'macro';

interface Module {
    description?: string;
    head: HeadItem[];
    features: Feature[];
}

interface Property {
    key: string;
    value?: string;
}

interface Variable {
    name: string;
    declaration?: Declaration;
    type?: Type;
    description?: string;
}

interface Feature {
    registry: Registry;
    id: string;
    description?: string;
    items: FeatureItem[];
}

interface Slot {
    role: Role;
    reference?: @Variable;
    declaration?: Declaration;
    description?: string;
}

interface Declaration {
    kind: Kind;
    id?: string;
    path: string[];
    type?: Type;
}
