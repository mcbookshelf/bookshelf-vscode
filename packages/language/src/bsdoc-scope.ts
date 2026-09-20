import { DefaultScopeComputation, type AstNodeDescription } from 'langium';

/**
 * Prevent '$' definitions from being exported to other files.
 */
export class BsdocScopeComputation extends DefaultScopeComputation {

    override async collectExportedSymbols(): Promise<AstNodeDescription[]> {
        return [];
    }
}
