const HYPERLIQUID_API = 'https://api.hyperliquid.xyz/info';
const HLP_VAULT_ADDRESS = '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';
/**
 * Fetch Hyperliquid HLP vault APY.
 * Uses apr field from vaultDetails if available, otherwise computes 30-day trailing annualized return.
 * Returns APY as a percentage (e.g. 12.3 means 12.3%).
 */
export async function fetchHlpApy() {
    try {
        const resp = await fetch(HYPERLIQUID_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'vaultDetails', vaultAddress: HLP_VAULT_ADDRESS }),
        });
        if (!resp.ok)
            return null;
        const data = await resp.json();
        // Prefer direct apr field (decimal, e.g. 0.12 = 12%)
        if (typeof data.apr === 'number')
            return data.apr * 100;
        // Fall back: compute from portfolio value history (30-day trailing annualized)
        const portfolio = data.portfolio;
        if (!portfolio || portfolio.length < 2)
            return null;
        const sorted = portfolio.slice().sort((a, b) => a[0] - b[0]);
        const latest = sorted[sorted.length - 1];
        const latestTime = latest[0];
        const thirtyDaysAgo = latestTime - 30 * 24 * 60 * 60 * 1000;
        const oldEntry = sorted.reduce((prev, curr) => Math.abs(curr[0] - thirtyDaysAgo) < Math.abs(prev[0] - thirtyDaysAgo) ? curr : prev);
        const latestVal = parseFloat(latest[1]);
        const oldVal = parseFloat(oldEntry[1]);
        if (!oldVal || oldVal <= 0)
            return null;
        const daysDiff = (latestTime - oldEntry[0]) / (1000 * 60 * 60 * 24);
        if (daysDiff < 1)
            return null;
        const periodReturn = (latestVal - oldVal) / oldVal;
        return (periodReturn / daysDiff) * 365 * 100;
    }
    catch (e) {
        console.error('[Hyperliquid HLP] APY fetch failed:', e.message);
        return null;
    }
}
/**
 * Fetch Hyperliquid HLP vault equity for a user address.
 * Returns positions denominated in USDC.
 */
export async function fetchHyperliquidHlpPositions(address) {
    const positions = [];
    try {
        const resp = await fetch(HYPERLIQUID_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'userVaultEquities', user: address }),
        });
        if (!resp.ok) {
            console.error(`[Hyperliquid HLP] HTTP ${resp.status}: ${resp.statusText}`);
            return [];
        }
        const data = await resp.json();
        for (const vault of data) {
            const equity = parseFloat(vault.equity);
            if (equity > 0.01) {
                positions.push({
                    protocol: 'Hyperliquid HLP',
                    type: 'Vault',
                    vaultAddress: vault.vaultAddress,
                    equity,
                    symbol: 'USDC',
                    lockedUntilTimestamp: vault.lockedUntilTimestamp,
                });
            }
        }
    }
    catch (e) {
        console.error(`[Hyperliquid HLP] Failed for ${address}:`, e.message);
    }
    return positions;
}
