import type * as vscode from 'vscode';
import * as path from 'node:path';
import { LanguageClient, TransportKind, type LanguageClientOptions, type ServerOptions } from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const serverModule = context.asAbsolutePath(path.join('out', 'language', 'main.cjs'));
    // In debug mode the server listens for a debugger, and waits for it when DEBUG_BREAK is set.
    const debugOptions = { execArgv: ['--nolazy', `--inspect${process.env.DEBUG_BREAK ? '-brk' : ''}=${process.env.DEBUG_SOCKET || '6009'}`] };
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    };
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: '*', language: 'bsdoc' }]
    };
    client = new LanguageClient('bsdoc', 'Bookshelf', serverOptions, clientOptions);
    await client.start();
}

export function deactivate(): Thenable<void> | undefined {
    return client?.stop();
}
