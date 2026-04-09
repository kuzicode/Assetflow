import { ethers } from 'ethers';
export declare const EVM_RPCS: Record<string, string>;
/**
 * Create a provider for the given chain.
 * If a fallback RPC is configured, returns a FallbackProvider (primary → fallback).
 */
export declare function createProvider(chain: string): ethers.JsonRpcProvider | ethers.FallbackProvider | null;
export declare const NATIVE_SYMBOLS: Record<string, string>;
export declare const STABLECOIN_SYMBOLS: string[];
export declare function getBaseTokenGroup(symbol: string): string;
export interface TokenDef {
    symbol: string;
    address: string;
    decimals: number;
}
export declare const TOKENS: Record<string, TokenDef[]>;
