# Bookshelf for VS Code

Language support for `.bs`, the language describing what a [Bookshelf](https://github.com/mcbookshelf) module offers
(`module.bs`, `bundle.bs`). It is a [Langium](https://langium.org) workspace:

- [packages/language](./packages/language/README.md): the grammar and the language services.
- [packages/extension](./packages/extension/README.md): the VS Code extension, its TextMate grammar and its language server.
- [packages/cli](./packages/cli/README.md): a command line which writes a module as JSON.

## Develop

```bash
npm ci
npm run langium:generate
npm run build
npm test --workspace packages/language
```

- `npm run langium:generate` writes the parser from the grammar: run it again after a change to a `.langium` file.
- The tests run against the built output, so build before testing.
- Press `F5` in VS Code to open a window with the extension loaded.
- `npm run package --workspace packages/extension` builds the `.vsix`.

## Release

A push to `master` which changes the version of `packages/extension/package.json` publishes the extension to the
Visual Studio Marketplace and to Open VSX, then creates the GitHub release.
