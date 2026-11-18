import {
    definitionsOf,
    docOf,
    featureName,
    isContext,
    isSlot,
    linesOf,
    listsOf,
    metadataOf,
    moduleIdOf,
    propertiesOf,
    repetitionsOf,
    substitute,
    typeOf,
    type Module,
} from 'bsdoc-language';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from './util.js';

export function generateJson(model: Module, filePath: string, destination: string | undefined): string {
    const data = extractDestinationAndName(filePath, destination);
    const generatedFilePath = `${path.join(data.destination, data.name)}.json`;

    const lists = listsOf(model);
    const json = {
        id: moduleIdOf(model),
        description: model.description ?? '',
        ...Object.fromEntries(propertiesOf(model).map(p => [p.key, p.value ?? ''])),
        definitions: [...new Set(definitionsOf(model).map(d => d.name))],
        // a feature with a list in its id exists once per item, the lists replaced in its texts
        features: model.features.flatMap(feature => repetitionsOf(feature, lists).map(items => {
            const replaced = (text: string | undefined) => text === undefined ? undefined : substitute(text, lists, items);
            const lines = linesOf(feature).map(({ line }) => line);
            return {
                registry: feature.registry,
                name: substitute(featureName(feature), lists, items),
                description: replaced(feature.description) ?? '',
                ...Object.fromEntries([...metadataOf(feature)].map(([key, metadata]) => [key, replaced(metadata.value) ?? true])),
                context: lines.filter(isContext).map(line => ({ kind: line.kind, type: typeOf(line), doc: replaced(docOf(line)) })),
                slots: lines.filter(isSlot).map(line => ({ role: line.role, kind: line.kind, type: typeOf(line, feature.registry), doc: replaced(docOf(line)) })),
            };
        })),
    };

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, JSON.stringify(json, undefined, 2));
    return generatedFilePath;
}
