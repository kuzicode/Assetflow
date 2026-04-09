import { ethers } from 'ethers';
import { NATIVE_SYMBOLS, TOKENS, createProvider } from '../config/chains.js';
const ERC20_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
];
/**
 * Fetch native + ERC20 balances for one address on multiple EVM chains.
 */
export async function fetchEvmBalances(address, chains) {
    const balances = [];
    await Promise.all(chains.map(async (chain) => {
        const provider = createProvider(chain);
        if (!provider)
            return;
        try {
            // 1. Native coin
            const balanceWei = await provider.getBalance(address);
            const balanceEth = parseFloat(ethers.formatEther(balanceWei));
            const nativeSymbol = NATIVE_SYMBOLS[chain] || 'ETH';
            if (balanceEth > 0.000001) {
                balances.push({ chain, symbol: nativeSymbol, amount: balanceEth, type: 'Native' });
            }
            // 2. ERC20 tokens
            const tokens = TOKENS[chain] || [];
            await Promise.all(tokens.map(async (token) => {
                try {
                    const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
                    const balance = await contract.balanceOf(address);
                    const formatted = parseFloat(ethers.formatUnits(balance, token.decimals));
                    if (formatted > 0.000001) {
                        balances.push({
                            chain,
                            symbol: token.symbol,
                            amount: formatted,
                            type: 'ERC20',
                            address: token.address,
                        });
                    }
                }
                catch {
                    // skip failed token queries silently
                }
            }));
        }
        catch (e) {
            console.error(`[EVM] Failed to scan ${chain}:`, e.message);
        }
    }));
    return balances;
}
