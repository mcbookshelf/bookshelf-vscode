import type { Module } from 'bsdoc-language';
import { createBsdocServices, BsdocLanguageMetaData } from 'bsdoc-language';
import chalk from 'chalk';
import { Command } from 'commander';
import { extractAstNode } from './util.js';
import { generateJson } from './generator.js';
import { NodeFileSystem } from 'langium/node';
import * as url from 'node:url';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const packagePath = path.resolve(__dirname, '..', 'package.json');
const packageContent = await fs.readFile(packagePath, 'utf-8');

export const generateAction = async (fileName: string, opts: GenerateOptions): Promise<void> => {
    const services = createBsdocServices(NodeFileSystem).Bsdoc;
    const model = await extractAstNode<Module>(fileName, services);
    const generatedFilePath = generateJson(model, fileName, opts.destination);
    console.log(chalk.green(`JSON generated successfully: ${generatedFilePath}`));
};

export type GenerateOptions = {
    destination?: string;
}

export default function(): void {
    const program = new Command();

    program.version(JSON.parse(packageContent).version);

    const fileExtensions = BsdocLanguageMetaData.fileExtensions.join(', ');
    program
        .command('generate')
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .option('-d, --destination <dir>', 'destination directory of generating')
        .description('generates a JSON representation of a source file')
        .action(generateAction);

    program.parse(process.argv);
}
