# The language package

The grammar of `.bs` and its language services, built with [Langium](https://langium.org).

- [src/bsdoc.langium](src/bsdoc.langium), [src/mcdoc.langium](src/mcdoc.langium), [src/terminals.langium](src/terminals.langium): the grammar, its types and its terminals.
- [src/model.langium](src/model.langium), [src/type.model.langium](src/type.model.langium): the shape of the syntax tree.
- [src/bsdoc-token-builder.ts](src/bsdoc-token-builder.ts), [src/bsdoc-lexer.ts](src/bsdoc-lexer.ts): indentation, and the tokens which depend on what precedes them on the line.
- [src/bsdoc-model.ts](src/bsdoc-model.ts): the tables of the language, and what the tree means: definitions, lists, repetition, inheritance.
- [src/bsdoc-validator.ts](src/bsdoc-validator.ts), [src/bsdoc-typir.ts](src/bsdoc-typir.ts): validation, and the type checks, with [Typir](https://typir.org).
- [src/bsdoc-completion.ts](src/bsdoc-completion.ts), [src/bsdoc-hover.ts](src/bsdoc-hover.ts), [src/bsdoc-folding.ts](src/bsdoc-folding.ts), [src/bsdoc-semantic-tokens.ts](src/bsdoc-semantic-tokens.ts): the editor services.
- [src/generated](src/generated): written by `npm run langium:generate`, not committed.
- [test](test): one script per subject, run with `npm test` after a build; [test/samples](test/samples) holds the modules they all read.
