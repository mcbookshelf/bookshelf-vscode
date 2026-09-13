import { isProperty, type Module } from 'bookshelf-doc-language';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from './util.js';

export function generateJson(model: Module, filePath: string, destination: string | undefined): string {
    const data = extractDestinationAndName(filePath, destination);
    const generatedFilePath = `${path.join(data.destination, data.name)}.json`;

    const properties = Object.fromEntries(model.slots.filter(isProperty).map(p => [p.key, p.value]));

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, JSON.stringify(properties, undefined, 2));
    return generatedFilePath;
}
