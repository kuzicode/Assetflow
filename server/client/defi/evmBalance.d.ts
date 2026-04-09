export interface BalanceResult {
    chain: string;
    symbol: string;
    amount: number;
    type: 'Native' | 'ERC20';
    address?: string;
}
/**
 * Fetch native + ERC20 balances for one address on multiple EVM chains.
 */
export declare function fetchEvmBalances(address: string, chains: string[]): Promise<BalanceResult[]>;
