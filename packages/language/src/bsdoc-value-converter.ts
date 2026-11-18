import { DefaultValueConverter, type CstNode, type GrammarAST, type ValueType } from 'langium';

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

/** The text of a DOC token: one line per '>', stripped; a '>' alone gives an empty line, a new paragraph. */
export function docText(doc: string): string {
    return doc.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('>')).map(line => line.slice(1).trim()).join('\n');
}
