const DEBANK_BASE = 'https://pro-openapi.debank.com/v1';
async function debankGet(path, apiKey) {
    const res = await fetch(`${DEBANK_BASE}${path}`, {
        headers: { AccessKey: apiKey },
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`DeBank ${res.status}: ${body}`);
    }
    return res.json();
}
/**
 * Fetch all wallet token balances across all chains.
 * is_all=false skips tiny dust (< $0.1)
 */
export async function fetchDebankTokens(address, apiKey) {
    const data = await debankGet(`/user/all_token_list?id=${address}&is_all=false`, apiKey);
    return data
        .filter((t) => t.amount > 0 && t.price > 0 && t.amount * t.price >= 0.1)
        .map((t) => ({
        symbol: t.symbol.toUpperCase(),
        chain: t.chain,
        amount: t.amount,
        price: t.price,
        usdValue: t.amount * t.price,
    }));
}
/**
 * Fetch all DeFi protocol positions (LP, lending, farming, etc.)
 */
export async function fetchDebankProtocols(address, apiKey) {
    const data = await debankGet(`/user/all_complex_protocol_list?id=${address}`, apiKey);
    const results = [];
    for (const protocol of data) {
        const protocolName = protocol.name;
        const chain = protocol.chain;
        for (const item of (protocol.portfolio_item_list ?? [])) {
            const itemName = (item.name ?? '').toLowerCase();
            const detail = item.detail ?? {};
            const isLP = itemName.includes('liquidity') || itemName.includes(' lp') || itemName === 'pool';
            for (const token of (detail.supply_token_list ?? [])) {
                if ((token.amount ?? 0) <= 0)
                    continue;
                results.push({
                    protocol: protocolName,
                    chain,
                    type: isLP ? 'lp' : 'lending',
                    symbol: token.symbol.toUpperCase(),
                    amount: token.amount,
                    price: token.price ?? 0,
                    usdValue: token.amount * (token.price ?? 0),
                });
            }
            for (const token of (detail.reward_token_list ?? [])) {
                if ((token.amount ?? 0) <= 0)
                    continue;
                results.push({
                    protocol: protocolName,
                    chain,
                    type: 'lp_fees',
                    symbol: token.symbol.toUpperCase(),
                    amount: token.amount,
                    price: token.price ?? 0,
                    usdValue: token.amount * (token.price ?? 0),
                });
            }
            // Borrow positions → negative amounts (debt)
            for (const token of (detail.borrow_token_list ?? [])) {
                if ((token.amount ?? 0) <= 0)
                    continue;
                results.push({
                    protocol: protocolName,
                    chain,
                    type: 'lending',
                    symbol: token.symbol.toUpperCase(),
                    amount: -token.amount,
                    price: token.price ?? 0,
                    usdValue: -token.amount * (token.price ?? 0),
                });
            }
        }
    }
    return results;
}
