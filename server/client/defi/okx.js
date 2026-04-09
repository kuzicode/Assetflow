import { createHmac } from 'crypto';
const OKX_BASE = 'https://web3.okx.com';
// OKX chainIndex values for our supported EVM chains
export const OKX_CHAIN_INDEXES = '1,42161,10,8453,137,56,43114'; // eth,arb,op,base,matic,bsc,avax
// Map OKX chainIndex → human-readable chain name
const CHAIN_INDEX_NAME = {
    '1': 'ethereum',
    '56': 'bsc',
    '137': 'polygon',
    '42161': 'arbitrum',
    '10': 'optimism',
    '8453': 'base',
    '43114': 'avalanche',
};
// ── Signing ────────────────────────────────────────────────────────────────
function sign(timestamp, method, path, body, secretKey) {
    const message = timestamp + method.toUpperCase() + path + body;
    return createHmac('sha256', secretKey).update(message).digest('base64');
}
function buildHeaders(method, path, body, creds) {
    const timestamp = new Date().toISOString();
    return {
        'Content-Type': 'application/json',
        'OK-ACCESS-KEY': creds.apiKey,
        'OK-ACCESS-SIGN': sign(timestamp, method, path, body, creds.secretKey),
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': creds.passphrase,
        'OK-ACCESS-PROJECT': creds.projectId,
    };
}
async function okxGet(pathWithQuery, creds) {
    const headers = buildHeaders('GET', pathWithQuery, '', creds);
    const res = await fetch(`${OKX_BASE}${pathWithQuery}`, { headers });
    if (!res.ok)
        throw new Error(`OKX API ${res.status}: ${await res.text()}`);
    const json = await res.json();
    if (json.code !== '0')
        throw new Error(`OKX error ${json.code}: ${json.msg}`);
    return json.data;
}
async function okxPost(path, body, creds) {
    const bodyStr = JSON.stringify(body);
    const headers = buildHeaders('POST', path, bodyStr, creds);
    const res = await fetch(`${OKX_BASE}${path}`, { method: 'POST', headers, body: bodyStr });
    if (!res.ok)
        throw new Error(`OKX API ${res.status}: ${await res.text()}`);
    const json = await res.json();
    if (String(json.code) !== '0')
        throw new Error(`OKX error ${json.code}: ${json.msg}`);
    return json.data;
}
// ── Public fetchers ─────────────────────────────────────────────────────────
/**
 * Fetch all token balances for a wallet across all supported EVM chains.
 */
export async function fetchOKXTokenBalances(address, creds) {
    const path = `/api/v5/wallet/asset/all-token-balances-by-address?address=${address}&chains=${OKX_CHAIN_INDEXES}&filter=1`;
    const data = await okxGet(path, creds);
    const tokens = [];
    for (const entry of (data ?? [])) {
        for (const t of (entry.tokenAssets ?? [])) {
            if (t.isRiskToken)
                continue;
            const amount = parseFloat(t.balance ?? '0');
            const price = parseFloat(t.tokenPrice ?? '0');
            const usdValue = amount * price;
            if (usdValue < 0.1)
                continue; // skip dust
            tokens.push({
                symbol: t.symbol.toUpperCase(),
                chain: CHAIN_INDEX_NAME[t.chainIndex] ?? t.chainIndex,
                amount,
                price,
                usdValue,
            });
        }
    }
    return tokens;
}
/**
 * Fetch all DeFi protocol positions for a wallet.
 * Returns protocol-level USD values (platform list endpoint).
 */
export async function fetchOKXDeFiPositions(address, creds) {
    // Build wallet address list for all EVM chains
    const chainIds = OKX_CHAIN_INDEXES.split(',');
    const walletAddressList = chainIds.map((chainId) => ({ chainId, walletAddress: address }));
    const data = await okxPost('/api/v5/defi/user/asset/platform/list', { walletAddressList }, creds);
    const positions = [];
    // data is { walletIdPlatformList: [{ platformList: [...] }] }
    const walletIdPlatformList = data?.walletIdPlatformList ?? [];
    for (const entry of walletIdPlatformList) {
        for (const platform of (entry.platformList ?? [])) {
            const usdValue = parseFloat(platform.currencyAmount ?? '0');
            if (usdValue < 0.1)
                continue;
            // Determine chain from network breakdown (pick largest)
            let chain = 'ethereum';
            let maxVal = 0;
            for (const net of (platform.networkBalanceVoList ?? [])) {
                const val = parseFloat(net.currencyAmount ?? '0');
                if (val > maxVal) {
                    maxVal = val;
                    chain = CHAIN_INDEX_NAME[String(net.chainId)] ?? String(net.chainId);
                }
            }
            positions.push({
                protocol: (platform.platformName ?? platform.name),
                chain,
                usdValue,
            });
        }
    }
    return positions;
}
