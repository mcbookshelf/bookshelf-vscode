import { inject, type Module } from 'langium';
import { createDefaultModule, createDefaultSharedModule, type DefaultSharedModuleContext, type LangiumServices, type LangiumSharedServices, type PartialLangiumServices } from 'langium/lsp';
import { createTypirLangiumServices, initializeLangiumTypirServices, type TypirLangiumServices } from 'typir-langium';
import { BsdocGeneratedModule, BsdocGeneratedSharedModule } from './generated/module.js';
import { reflection } from './generated/ast.js';
import { BsdocCompletionProvider } from './bsdoc-completion.js';
import { BsdocFoldingRangeProvider } from './bsdoc-folding.js';
import { BsdocHoverProvider } from './bsdoc-hover.js';
import { BsdocLexer } from './bsdoc-lexer.js';
import { BsdocScopeComputation } from './bsdoc-scope.js';
import { BsdocSemanticTokenProvider } from './bsdoc-semantic-tokens.js';
import { BsdocTokenBuilder } from './bsdoc-token-builder.js';
import { BsdocProblemPrinter, BsdocTypeSystem, type BsdocSpecifics } from './bsdoc-typir.js';
import { BsdocValidator, registerValidationChecks } from './bsdoc-validator.js';
import { BsdocValueConverter } from './bsdoc-value-converter.js';

export type BsdocAddedServices = {
    validation: {
        BsdocValidator: BsdocValidator
    }
}

export type BsdocServices = LangiumServices & BsdocAddedServices

export const BsdocModule: Module<BsdocServices, PartialLangiumServices & BsdocAddedServices> = {
    validation: {
        BsdocValidator: () => new BsdocValidator()
    },
    parser: {
        TokenBuilder: () => new BsdocTokenBuilder(),
        Lexer: (services) => new BsdocLexer(services),
        ValueConverter: () => new BsdocValueConverter()
    },
    references: {
        ScopeComputation: (services) => new BsdocScopeComputation(services),
    },
    lsp: {
        CompletionProvider: (services) => new BsdocCompletionProvider(services),
        FoldingRangeProvider: (services) => new BsdocFoldingRangeProvider(services),
        HoverProvider: (services) => new BsdocHoverProvider(services),
        SemanticTokenProvider: (services) => new BsdocSemanticTokenProvider(services)
    }
};

/** The shared and the language services, with the type system; a context without a connection runs outside a language server. */
export function createBsdocServices(context: DefaultSharedModuleContext): {
    shared: LangiumSharedServices,
    Bsdoc: BsdocServices,
    typir: TypirLangiumServices<BsdocSpecifics>
} {
    const shared = inject(createDefaultSharedModule(context), BsdocGeneratedSharedModule);
    const Bsdoc = inject(createDefaultModule({ shared }), BsdocGeneratedModule, BsdocModule);
    shared.ServiceRegistry.register(Bsdoc);
    registerValidationChecks(Bsdoc);
    const typir = createTypirLangiumServices<BsdocSpecifics>(shared, reflection, new BsdocTypeSystem(), {
        Printer: () => new BsdocProblemPrinter(),
    });
    initializeLangiumTypirServices(Bsdoc, typir);
    if (!context.connection) {
        // no client will send the configuration: initialize its provider now
        shared.workspace.ConfigurationProvider.initialized({});
    }
    return { shared, Bsdoc, typir };
}
