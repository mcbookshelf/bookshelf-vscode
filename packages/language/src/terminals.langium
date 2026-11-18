// Declared by name only: their patterns depend on what precedes them, see 'bsdoc-token-builder.ts'.
terminal TEXT: 'synthetic:text';
terminal FEATURE_ID: 'synthetic:feature-id';
terminal RESOURCE_LOCATION: 'synthetic:resource-location';
terminal INDENT: 'synthetic:indent';
terminal DEDENT: 'synthetic:dedent';
hidden terminal SL_COMMENT: 'synthetic:comment';

// '>' to the end of the line, continued by the next lines starting with '>', blank and comment lines in between skipped.
terminal DOC: />[^\r\n]*(?:(?:\r?\n[ \t]*(?:#[^\r\n]*)?)*\r?\n[ \t]*>[^\r\n]*)*/;

// An mcdoc attribute, kept verbatim, with brackets nesting up to 3 deep.
terminal ATTRIBUTE: /#\[(?:[^\[\]]|\[(?:[^\[\]]|\[(?:[^\[\]]|\[[^\[\]]*\])*\])*\])*\]/;

// The '$' is stripped by the value converter. No '-': '$axis-aligned' is '$axis' then '-aligned'.
terminal VARIABLE: /\$[_A-Za-z][_A-Za-z0-9]*/;

terminal ID: /[_A-Za-z][_A-Za-z0-9-]*/;
terminal FLOAT returns number: /-?(?:(?:0|[1-9][0-9]*)\.(?!\.)[0-9]*|\.[0-9]+)/;
terminal INT returns number: /-?(?:0|[1-9][0-9]*)/;

// Swallows the blank and comment lines that follow, so that they never produce a second NL.
terminal NL: /\r?\n(?:[ \t]*(?:#[^\r\n]*)?\r?\n)*/;
hidden terminal WS: /[ \t]+/;
