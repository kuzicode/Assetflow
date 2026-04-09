import { ethers } from 'ethers';
// EVM RPC endpoints — env vars take priority, public nodes as last resort
export const EVM_RPCS = {
    ethereum: process.env.ETH_RPC_URL ?? 'https://eth.llamarpc.com',
    bsc: 'https://bsc-dataseed.binance.org',
    polygon: 'https://polygon.llamarpc.com',
    arbitrum: 'https://arb1.arbitrum.io/rpc',
    optimism: 'https://mainnet.optimism.io',
    base: process.env.BASE_RPC_URL ?? 'https://base.llamarpc.com',
    avalanche: 'https://api.avax.network/ext/bc/C/rpc',
};
// Fallback RPC endpoints (secondary, used when primary stalls >2s)
const EVM_RPC_FALLBACKS = {
    ethereum: process.env.ETH_RPC_FALLBACK,
};
// Chain IDs for static network (avoids auto-detect retries)
const CHAIN_IDS = {
    ethereum: 1,
    bsc: 56,
    polygon: 137,
    arbitrum: 42161,
    optimism: 10,
    base: 8453,
    avalanche: 43114,
};
/**
 * Create a provider for the given chain.
 * If a fallback RPC is configured, returns a FallbackProvider (primary → fallback).
 */
export function createProvider(chain) {
    const rpc = EVM_RPCS[chain];
    if (!rpc)
        return null;
    const chainId = CHAIN_IDS[chain];
    const network = chainId ? new ethers.Network(chain, chainId) : undefined;
    const opts = network ? { staticNetwork: network } : {};
    const primary = new ethers.JsonRpcProvider(rpc, network, opts);
    const fallbackUrl = EVM_RPC_FALLBACKS[chain];
    if (!fallbackUrl)
        return primary;
    const fallback = new ethers.JsonRpcProvider(fallbackUrl, network, opts);
    return new ethers.FallbackProvider([
        { provider: primary, priority: 1, stallTimeout: 2000 },
        { provider: fallback, priority: 2, stallTimeout: 2000 },
    ], network);
}
// Native token symbol per chain
export const NATIVE_SYMBOLS = {
    ethereum: 'ETH',
    bsc: 'BNB',
    polygon: 'POL',
    arbitrum: 'ETH',
    optimism: 'ETH',
    base: 'ETH',
    avalanche: 'AVAX',
};
// Base token group mapping: which group does a symbol belong to?
export const STABLECOIN_SYMBOLS = ['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FRAX', 'LUSD', 'crvUSD'];
export function getBaseTokenGroup(symbol) {
    if (STABLECOIN_SYMBOLS.includes(symbol))
        return 'STABLE';
    // USD-backed vault tokens (e.g. STEAKUSDC, GTUSDCP, gtUSDC, bbUSDT)
    const upper = symbol.toUpperCase();
    if (upper.includes('USDC') || upper.includes('USDT') || upper.includes('DAI'))
        return 'STABLE';
    if (['ETH', 'WETH', 'stETH', 'wstETH', 'cbETH', 'rETH'].includes(symbol))
        return 'ETH';
    if (['BTC', 'WBTC', 'tBTC', 'cbBTC'].includes(symbol))
        return 'BTC';
    if (['BNB', 'WBNB'].includes(symbol))
        return 'BNB';
    return symbol; // unknown tokens stay as-is
}
export const TOKENS = {
    ethereum: [
        { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
        { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
        { symbol: 'DAI', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
        { symbol: 'WBTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
        { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
        { symbol: 'LINK', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18 },
        { symbol: 'UNI', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', decimals: 18 },
        { symbol: 'PEPE', address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', decimals: 18 },
    ],
    bsc: [
        { symbol: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
        { symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
        { symbol: 'DAI', address: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3', decimals: 18 },
        { symbol: 'WBNB', address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18 },
    ],
    polygon: [
        { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
        { symbol: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
        { symbol: 'DAI', address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18 },
        { symbol: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
    ],
    arbitrum: [
        { symbol: 'USDT', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
        { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
        { symbol: 'ARB', address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
        { symbol: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
        { symbol: 'WBTC', address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8 },
    ],
    optimism: [
        { symbol: 'USDT', address: '0x94b008aA00579c1307B0EF2c499a98a359659956', decimals: 6 },
        { symbol: 'USDC', address: '0x0b2C639c533813f4Aa9D7837CAf9928370378d61', decimals: 6 },
        { symbol: 'OP', address: '0x4200000000000000000000000000000000000042', decimals: 18 },
        { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    ],
    base: [
        { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
        { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
        { symbol: 'cbBTC', address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8 },
        { symbol: 'cbETH', address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', decimals: 18 },
    ],
    avalanche: [
        { symbol: 'USDC', address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6 },
        { symbol: 'USDT', address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', decimals: 6 },
    ],
};
