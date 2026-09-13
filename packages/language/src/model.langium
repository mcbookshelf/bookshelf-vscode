import './type.model';

interface Module {
    description: string[];
    slots: ModuleSlot[];
}

type ModuleSlot = Feature | Variable | Property;

interface Feature {
    description: string[];
    registry: string;
    id: string;
    slots: FeatureSlot[];
}

type FeatureSlot = Input | Context | Output | Variable | Property;

interface AbstractFeatureSlotExpression {
    description: string[];
}

interface FeatureSlotExpression extends AbstractFeatureSlotExpression {
    kind: Kind;
    definition?: Type;
}

interface Input {
    expression: AbstractFeatureSlotExpression;
}

interface Context {
    expression: AbstractFeatureSlotExpression;
}

interface Output {
    expression: AbstractFeatureSlotExpression;
}

interface Storage {
    id?: string;
    path?: string;
}

type Kind = Storage | Executor | Position | Rotation | Dimension | State | Success | Result | Macro;

interface Executor {}
interface Position {}
interface Rotation {}
interface Dimension {}
interface State {}
interface Success {}
interface Result {}
interface Macro {}

interface Variable {
    name: string;
    expression: FeatureSlotExpression;
}

interface VariableReference extends AbstractFeatureSlotExpression {
    reference: @Variable;
}

interface Property {
    key: string;
    value: string;
}
