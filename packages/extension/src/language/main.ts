import { startLanguageServer } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import { createBsdocServices } from 'bsdoc-language';

const connection = createConnection(ProposedFeatures.all);
const { shared } = createBsdocServices({ connection, ...NodeFileSystem });
startLanguageServer(shared);
