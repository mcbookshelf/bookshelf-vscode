import { isSlot, isVariable, declarationOf, docOf, typeOf, featureName, moduleIdOf, propertiesOf, type Module } from 'bsdoc-language';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from './util.js';

export function generateJson(model: Module, filePath: string, destination: string | undefined): string {
    const data = extractDestinationAndName(filePath, destination);
    const generatedFilePath = `${path.join(data.destination, data.name)}.json`;

    const properties = (node: Parameters<typeof propertiesOf>[0]) => Object.fromEntries(propertiesOf(node).map(p => [p.key, p.value ?? '']));
    const json = {
        id: moduleIdOf(model),
        description: model.description ?? '',
        ...properties(model),
        definitions: model.head.filter(isVariable).map(v => v.name),
        features: model.features.map(feature => ({
            registry: feature.registry,
            name: featureName(feature),
            description: feature.description ?? '',
            ...properties(feature),
            slots: feature.items.filter(isSlot).map(slot => {
                const declaration = declarationOf(slot);
                return {
                    role: slot.role,
                    kind: declaration?.kind,
                    type: declaration ? typeOf(declaration, feature.registry) : undefined,
                    doc: docOf(slot),
                };
            }),
        })),
    };

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, JSON.stringify(json, undefined, 2));
    return generatedFilePath;
}
