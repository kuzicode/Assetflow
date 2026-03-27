export interface HlpPosition {
  protocol: string;
  type: string;
  vaultAddress: string;
  equity: number;
  symbol: string;
  lockedUntilTimestamp: number;
}

interface VaultEquityResponse {
  vaultAddress: string;
  equity: string;
  lockedUntilTimestamp: number;
}

const HYPERLIQUID_API = 'https://api.hyperliquid.xyz/info';

/**
 * Fetch Hyperliquid HLP vault equity for a user address.
 * Returns positions denominated in USDC.
 */
export async function fetchHyperliquidHlpPositions(
  address: string
): Promise<HlpPosition[]> {
  const positions: HlpPosition[] = [];

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

    const data: VaultEquityResponse[] = await resp.json();

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
  } catch (e: any) {
    console.error(`[Hyperliquid HLP] Failed for ${address}:`, e.message);
  }

  return positions;
}
