import { DefaultValueConverter, type CstNode, type GrammarAST, type ValueType } from 'langium';

/**
 * Strips the '$' of a variable name, so that '$x' declares and refers to 'x', and turns a doc
 * into its text: the leading '>' and the surrounding whitespace of every line are dropped, the
 * lines are joined with '\n'.
 */
export class BsdocValueConverter extends DefaultValueConverter {

    protected override runConverter(rule: GrammarAST.AbstractRule, input: string, cstNode: CstNode): ValueType {
        switch (rule.name) {
            case 'VARIABLE': return input.slice(1);
            case 'DOC': return docText(input);
            // the default converter strips a '^' escape, which this language does not have
            case 'ID': return input;
            default: return super.runConverter(rule, input, cstNode);
        }
    }
}

/** The text of a DOC token: one line per '>' marker, stripped and joined with '\n'. */
export function docText(doc: string): string {
    return doc.split(/\r?\n/).map(line => line.trim().replace(/^>/, '').trim()).join('\n');
}
