const DEBANK_BASE = 'https://pro-openapi.debank.com/v1';

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
  amount: number; // negative = debt
  price: number;
  usdValue: number;
}

async function debankGet(path: string, apiKey: string) {
  const res = await fetch(`${DEBANK_BASE}${path}`, {
    headers: { AccessKey: apiKey },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DeBank ${res.status}: ${body}`);
  }
  return res.json() as Promise<any[]>;
}

/**
 * Fetch all wallet token balances across all chains.
 * is_all=false skips tiny dust (< $0.1)
 */
export async function fetchDebankTokens(address: string, apiKey: string): Promise<DebankToken[]> {
  const data = await debankGet(`/user/all_token_list?id=${address}&is_all=false`, apiKey);
  return data
    .filter((t) => t.amount > 0 && t.price > 0 && t.amount * t.price >= 0.1)
    .map((t) => ({
      symbol: (t.symbol as string).toUpperCase(),
      chain: t.chain as string,
      amount: t.amount as number,
      price: t.price as number,
      usdValue: (t.amount as number) * (t.price as number),
    }));
}

/**
 * Fetch all DeFi protocol positions (LP, lending, farming, etc.)
 */
export async function fetchDebankProtocols(address: string, apiKey: string): Promise<DebankProtocolPosition[]> {
  const data = await debankGet(`/user/all_complex_protocol_list?id=${address}`, apiKey);
  const results: DebankProtocolPosition[] = [];

  for (const protocol of data) {
    const protocolName: string = protocol.name;
    const chain: string = protocol.chain;

    for (const item of (protocol.portfolio_item_list ?? [])) {
      const itemName: string = (item.name ?? '').toLowerCase();
      const detail = item.detail ?? {};
      const isLP = itemName.includes('liquidity') || itemName.includes(' lp') || itemName === 'pool';

      for (const token of (detail.supply_token_list ?? [])) {
        if ((token.amount ?? 0) <= 0) continue;
        results.push({
          protocol: protocolName,
          chain,
          type: isLP ? 'lp' : 'lending',
          symbol: (token.symbol as string).toUpperCase(),
          amount: token.amount as number,
          price: token.price ?? 0,
          usdValue: (token.amount as number) * (token.price ?? 0),
        });
      }

      for (const token of (detail.reward_token_list ?? [])) {
        if ((token.amount ?? 0) <= 0) continue;
        results.push({
          protocol: protocolName,
          chain,
          type: 'lp_fees',
          symbol: (token.symbol as string).toUpperCase(),
          amount: token.amount as number,
          price: token.price ?? 0,
          usdValue: (token.amount as number) * (token.price ?? 0),
        });
      }

      // Borrow positions → negative amounts (debt)
      for (const token of (detail.borrow_token_list ?? [])) {
        if ((token.amount ?? 0) <= 0) continue;
        results.push({
          protocol: protocolName,
          chain,
          type: 'lending',
          symbol: (token.symbol as string).toUpperCase(),
          amount: -(token.amount as number),
          price: token.price ?? 0,
          usdValue: -(token.amount as number) * (token.price ?? 0),
        });
      }
    }
  }

  return results;
}
