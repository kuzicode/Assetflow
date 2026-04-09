export declare const OKX_CHAIN_INDEXES = "1,42161,10,8453,137,56,43114";
export interface OKXCredentials {
    apiKey: string;
    secretKey: string;
    passphrase: string;
    projectId: string;
}
export interface OKXToken {
    symbol: string;
    chain: string;
    amount: number;
    price: number;
    usdValue: number;
}
export interface OKXDeFiPosition {
    protocol: string;
    chain: string;
    usdValue: number;
}
/**
 * Fetch all token balances for a wallet across all supported EVM chains.
 */
export declare function fetchOKXTokenBalances(address: string, creds: OKXCredentials): Promise<OKXToken[]>;
/**
 * Fetch all DeFi protocol positions for a wallet.
 * Returns protocol-level USD values (platform list endpoint).
 */
export declare function fetchOKXDeFiPositions(address: string, creds: OKXCredentials): Promise<OKXDeFiPosition[]>;
