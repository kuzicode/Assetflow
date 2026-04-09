export interface DebankToken {
    symbol: string;
    chain: string;
    amount: number;
    price: number;
    usdValue: number;
}
export interface DebankProtocolPosition {
    protocol: string;
    chain: string;
    type: 'lp' | 'lp_fees' | 'lending';
    symbol: string;
    amount: number;
    price: number;
    usdValue: number;
}
/**
 * Fetch all wallet token balances across all chains.
 * is_all=false skips tiny dust (< $0.1)
 */
export declare function fetchDebankTokens(address: string, apiKey: string): Promise<DebankToken[]>;
/**
 * Fetch all DeFi protocol positions (LP, lending, farming, etc.)
 */
export declare function fetchDebankProtocols(address: string, apiKey: string): Promise<DebankProtocolPosition[]>;
