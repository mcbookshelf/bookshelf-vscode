terminal INDENT: 'synthetic:indent';
terminal DEDENT: 'synthetic:dedent';
terminal TEXT: 'synthetic:text';

// a resource location. The pattern is a placeholder: BookshelfDocTokenBuilder only matches it
// after 'storage' or a registry, so that 'foo:' stays an ID and a ':' everywhere else.
terminal MC_ID: 'synthetic:mc_id';
terminal ID: '^'? ('_' | LOWER | UPPER) ('_' | LOWER | UPPER | DIGIT | '-')*;
terminal fragment NAMESPACE: ('_' | LOWER | UPPER | DIGIT | '.')+;
terminal NUMBER: '0' | '-' NON_ZERO DIGIT*;

terminal DOC: '>' !('\n' | '\r')*;

terminal fragment LOWER: 'a'..'z';
terminal fragment UPPER: 'A'..'Z';
terminal fragment DIGIT: '0'..'9';
terminal fragment NON_ZERO: '1'..'9';

// a line holding only a comment counts as a blank line: it must not produce a second NL
terminal NL: ('\r' | '\n') ((' ' | '\t')* COMMENT? ('\r' | '\n'))*;
hidden terminal WS: (' ' | '\t')+;

// a comment at the end of a line holding a statement; a comment-only line is swallowed by NL
hidden terminal SL_COMMENT: COMMENT;
terminal fragment COMMENT: '#' !('\n' | '\r')*;
