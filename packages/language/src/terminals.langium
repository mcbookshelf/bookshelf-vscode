terminal TEXT: 'synthetic:text';

// A comment is a whole line whose first non-blank character is '#'.
hidden terminal SL_COMMENT: 'synthetic:comment';

// A doc: '>' to the end of the line, continued on line whose first non-blank character is '>'.
terminal DOC: />[^\r\n]*(?:\r?\n[ \t]*>[^\r\n]*)*/;

// An mcdoc attribute, kept verbatim, with brackets nesting up to 3 deep.
terminal ATTRIBUTE: /#\[(?:[^\[\]]|\[(?:[^\[\]]|\[(?:[^\[\]]|\[[^\[\]]*\])*\])*\])*\]/;

// A resource location, declared before ID since it starts like one. It also wins on a colon
// written without a space, so 'levels:int' is a resource location: write 'levels: int'.
terminal RESOURCE_LOCATION: /[a-z0-9_.-]+:[a-z0-9_.\/-]+/;

// A '$' name, the '$' is stripped by the value converter.
terminal VARIABLE: /\$[_A-Za-z][_A-Za-z0-9-]*/;

terminal ID: /[_A-Za-z][_A-Za-z0-9-]*/;
terminal FLOAT returns number: /-?(?:(?:0|[1-9][0-9]*)\.(?!\.)[0-9]*|\.[0-9]+)/;
terminal INT returns number: /-?(?:0|[1-9][0-9]*)/;

// A line end, swallowing the blank and comment lines that follow so that they never produce a
// second NL. The lexer adds one at the end of the file when the last line has none.
terminal NL: /\r?\n(?:[ \t]*(?:#[^\r\n]*)?\r?\n)*/;
hidden terminal WS: /[ \t]+/;
