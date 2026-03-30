import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import { fetchEvmBalances, type BalanceResult } from '../defi/evmBalance.js';
import { fetchUniswapV3Positions } from '../defi/uniswapV3.js';
import { fetchAaveV3Balances } from '../defi/aaveV3.js';
import { fetchMorphoBlueBalances } from '../defi/morphoBlue.js';
import { fetchMorphoVaultBalances } from '../defi/morphoVault.js';
import { fetchHyperliquidHlpPositions } from '../defi/hyperliquidHlp.js';
import { fetchOKXTokenBalances, fetchOKXDeFiPositions, type OKXCredentials } from '../defi/okx.js';
import { fetchPrices } from '../utils/price.js';
import { getBaseTokenGroup, STABLECOIN_SYMBOLS, EVM_RPCS, createProvider } from '../config/chains.js';

const router = Router();

interface SubPosition {
  id: string;
  label: string;
  source: string;
  protocol?: string;
  chain?: string;
  amount: number;
  usdValue: number;
}

interface TokenPosition {
  baseToken: string;
  subPositions: SubPosition[];
  totalAmount: number;
  totalUsdValue: number;
}

interface IncomeBreakdown {
  uniswap: number;
  morpho: number;
  hlp: number;
  total: number;
}

function buildIncomeBreakdown(positions: TokenPosition[]): IncomeBreakdown {
  let uniswap = 0;
  let morpho = 0;
  let hlp = 0;
  for (const tokenPos of positions) {
    for (const sub of tokenPos.subPositions) {
      const protocol = (sub.protocol || '').toLowerCase();
      if (sub.source === 'lp_fees' || (protocol.includes('uniswap') && sub.label.includes('手续费'))) {
        uniswap += sub.usdValue;
      } else if (protocol.includes('morpho')) {
        morpho += sub.usdValue;
      } else if (protocol.includes('hyperliquid') || sub.source === 'hlp') {
        hlp += sub.usdValue;
      }
    }
  }
  const safe = (v: number) => Number.isFinite(v) ? v : 0;
  return {
    uniswap: safe(uniswap),
    morpho: safe(morpho),
    hlp: safe(hlp),
    total: safe(uniswap + morpho + hlp),
  };
}

// In-flight deduplication: if a fetch is already running, share its Promise
// Prevents concurrent OKX/RPC calls when browser refresh and startup cron fire simultaneously
let _fetchInFlight: Promise<any> | null = null;

export async function fetchPositionsAggregate() {
  if (_fetchInFlight) return _fetchInFlight;
  _fetchInFlight = _fetchPositionsAggregateImpl().finally(() => { _fetchInFlight = null; });
  return _fetchInFlight;
}

async function _fetchPositionsAggregateImpl() {
  // 1. Get wallets from DB
  const walletRows: any[] = db.prepare('SELECT * FROM wallets').all();
  const wallets = walletRows.map((w) => ({
    ...w,
    chains: JSON.parse(w.chains_json),
  }));

  // 2. Check for OKX API credentials (from environment variables)
  const okxApiKey = process.env.OKX_API_KEY;
  const okxSecretKey = process.env.OKX_SECRET_KEY;
  const okxPassphrase = process.env.OKX_PASSPHRASE;
  const okxProjectId = process.env.OKX_PROJECT_ID;
  const okxReady = okxApiKey && okxSecretKey && okxPassphrase && okxProjectId;

  const groupMap: Record<string, SubPosition[]> = {};
  let prices: Record<string, number> = {};

  if (okxReady) {
    // === OKX path: covers all EVM chains + DeFi protocols ===
    const okxCreds: OKXCredentials = {
      apiKey: okxApiKey!,
      secretKey: okxSecretKey!,
      passphrase: okxPassphrase!,
      projectId: okxProjectId!,
    };

    const evmWallets = wallets.filter((w) =>
      !w.chains.includes('bitcoin') && !w.chains.includes('solana')
    );

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const putPrice = (symbol: string, price: number) => {
      if (!symbol || !Number.isFinite(price) || price <= 0) return;
      if (!prices[symbol]) prices[symbol] = price;
    };

    for (const wallet of evmWallets) {
      try {
        const tokens = await fetchOKXTokenBalances(wallet.address, okxCreds);
        await sleep(1100);
        const defiPositions = await fetchOKXDeFiPositions(wallet.address, okxCreds);
        if (evmWallets.indexOf(wallet) < evmWallets.length - 1) await sleep(1100);

        // Wallet token balances
        for (const t of tokens) {
          const group = getBaseTokenGroup(t.symbol);
          // Skip USD vault tokens (STEAKUSDC, GTUSDCP, etc.) — captured by DeFi positions API
          if (group === 'STABLE' && !STABLECOIN_SYMBOLS.includes(t.symbol)) continue;

          // Derive spot price from OKX snapshot
          if (t.symbol && t.amount && t.amount > 0 && t.usdValue && t.usdValue > 0) {
            const spotPrice = t.usdValue / t.amount;
            putPrice(t.symbol, spotPrice);
            // Also set group-level price (e.g. 'BTC') so frontend prices['BTC'] works
            if (group !== 'STABLE' && group !== t.symbol) putPrice(group, spotPrice);
          }
          if (group === 'STABLE') putPrice('STABLE', 1);

          if (!groupMap[group]) groupMap[group] = [];
          groupMap[group].push({
            id: uuidv4(),
            label: `${wallet.label}-${t.symbol}`,
            source: 'wallet',
            chain: t.chain,
            amount: t.amount,
            usdValue: t.usdValue,
          });
        }

        // DeFi protocol positions (USD-denominated, grouped under STABLE)
        for (const pos of defiPositions) {
          if (!groupMap['STABLE']) groupMap['STABLE'] = [];
          // Morpho/Aave/Compound are lending; Uniswap/Curve etc. are LP
          const isLending = /morpho|aave|compound|euler|benqi|venus/i.test(pos.protocol);
          groupMap['STABLE'].push({
            id: uuidv4(),
            label: `${wallet.label}-${pos.protocol}`,
            source: isLending ? 'lending' : 'lp',
            protocol: pos.protocol,
            chain: pos.chain,
            amount: pos.usdValue,
            usdValue: pos.usdValue,
          });
        }

        // Hyperliquid HLP — not covered by OKX API, use Hyperliquid REST directly
        try {
          const hlpPositions = await fetchHyperliquidHlpPositions(wallet.address);
          for (const pos of hlpPositions) {
            if (!groupMap['STABLE']) groupMap['STABLE'] = [];
            groupMap['STABLE'].push({
              id: uuidv4(),
              label: `${wallet.label}-HLP`,
              source: 'hlp',
              protocol: 'Hyperliquid HLP',
              amount: pos.equity,
              usdValue: pos.equity,
            });
          }
        } catch (e: any) {
          console.error(`[HLP] Failed wallet ${wallet.label}:`, e.message);
        }

        // Uniswap V3 LP fees — OKX bundles fees+principal together, fetch fees separately via RPC
        const evmChains = wallet.chains.filter((c: string) =>
          ['ethereum', 'arbitrum', 'optimism', 'base', 'polygon', 'bsc', 'avalanche'].includes(c)
        );
        for (const chain of evmChains) {
          try {
            const provider = createProvider(chain);
            if (!provider) continue;
            const uniPositions = await fetchUniswapV3Positions(chain, wallet.address, provider);
            for (const pos of uniPositions) {
              const ethPrice = prices['ETH'] || prices['WETH'] || 0;
              const stablePrice = 1;
              // LP fees — always converted to USD and grouped under STABLE
              const sym0 = pos.token0Symbol;
              const sym1 = pos.token1Symbol;
              const price0 = STABLECOIN_SYMBOLS.includes(sym0) ? stablePrice : (prices[sym0] || ethPrice);
              const price1 = STABLECOIN_SYMBOLS.includes(sym1) ? stablePrice : (prices[sym1] || ethPrice);
              const totalFeeUsd = (pos.fees0 > 0.000001 ? pos.fees0 * price0 : 0) + (pos.fees1 > 0.000001 ? pos.fees1 * price1 : 0);
              if (totalFeeUsd > 0.01) {
                if (!groupMap['STABLE']) groupMap['STABLE'] = [];
                groupMap['STABLE'].push({
                  id: uuidv4(),
                  label: `${wallet.label}-${sym0}/${sym1}-手续费`,
                  source: 'lp_fees',
                  protocol: 'Uniswap V3',
                  chain,
                  amount: totalFeeUsd,
                  usdValue: totalFeeUsd,
                });
              }
            }
          } catch (e: any) {
            console.error(`[UniV3 fees] Failed ${chain}/${wallet.label}:`, e.message);
          }
        }
      } catch (e: any) {
        console.error(`[OKX] Failed wallet ${wallet.label}:`, e.message);
      }
    }

    // Ensure base-token keys used by frontend exist
    if (!prices.ETH && prices.WETH) prices.ETH = prices.WETH;
    if (!prices.BTC && prices.WBTC) prices.BTC = prices.WBTC;
    if (!prices.BNB && prices.WBNB) prices.BNB = prices.WBNB;
    if (!prices.STABLE) prices.STABLE = 1;
  } else {
    // === Fallback: direct RPC path ===
    const allBalances: (BalanceResult & { walletLabel: string })[] = [];
    await Promise.all(
      wallets.map(async (wallet) => {
        try {
          const balances = await fetchEvmBalances(wallet.address, wallet.chains);
          for (const b of balances) allBalances.push({ ...b, walletLabel: wallet.label });
        } catch (e: any) {
          console.error(`[Positions] Failed wallet ${wallet.label}:`, e.message);
        }
      })
    );

    const morphoMarketsRow: any = db.prepare("SELECT value FROM settings WHERE key = 'morpho_market_ids'").get();
    const morphoMarketIds: string[] = morphoMarketsRow ? JSON.parse(morphoMarketsRow.value) : [];
    const morphoVaultsRow: any = db.prepare("SELECT value FROM settings WHERE key = 'morpho_vault_addresses'").get();
    const morphoVaultAddresses: string[] = morphoVaultsRow ? JSON.parse(morphoVaultsRow.value) : [];

    const defiSubs: SubPosition[] = [];

    await Promise.all(
      wallets.map(async (wallet) => {
        for (const chain of wallet.chains) {
          const provider = createProvider(chain);
          if (!provider) continue;
          try {
            const uniPositions = await fetchUniswapV3Positions(chain, wallet.address, provider);
            for (const pos of uniPositions) {
              const pairLabel = `${pos.token0Symbol}/${pos.token1Symbol}`;
              if (pos.amount0 > 0.000001) defiSubs.push({ id: uuidv4(), label: `${wallet.label}-${pairLabel}-仓位`, source: 'lp', protocol: 'Uniswap V3', chain, amount: pos.amount0, usdValue: 0, _symbol: pos.token0Symbol, _group: getBaseTokenGroup(pos.token0Symbol) } as any);
              if (pos.amount1 > 0.000001) defiSubs.push({ id: uuidv4(), label: `${wallet.label}-${pairLabel}-仓位`, source: 'lp', protocol: 'Uniswap V3', chain, amount: pos.amount1, usdValue: 0, _symbol: pos.token1Symbol, _group: getBaseTokenGroup(pos.token1Symbol) } as any);
              if (pos.fees0 > 0.000001) defiSubs.push({ id: uuidv4(), label: `${wallet.label}-${pairLabel}-手续费`, source: 'lp_fees', protocol: 'Uniswap V3', chain, amount: pos.fees0, usdValue: 0, _symbol: pos.token0Symbol, _group: getBaseTokenGroup(pos.token0Symbol) } as any);
              if (pos.fees1 > 0.000001) defiSubs.push({ id: uuidv4(), label: `${wallet.label}-${pairLabel}-手续费`, source: 'lp_fees', protocol: 'Uniswap V3', chain, amount: pos.fees1, usdValue: 0, _symbol: pos.token1Symbol, _group: getBaseTokenGroup(pos.token1Symbol) } as any);
            }
          } catch (e: any) { console.error(`[DeFi] Uniswap V3 failed ${chain}/${wallet.label}:`, e.message); }
          try {
            const aavePositions = await fetchAaveV3Balances(chain, wallet.address, provider);
            for (const pos of aavePositions) defiSubs.push({ id: uuidv4(), label: `${wallet.label}-AAVE-${pos.symbol}`, source: 'lending', protocol: 'Aave V3', chain, amount: pos.amount, usdValue: 0, _symbol: pos.symbol, _group: getBaseTokenGroup(pos.symbol) } as any);
          } catch (e: any) { console.error(`[DeFi] Aave V3 failed ${chain}/${wallet.label}:`, e.message); }
          try {
            const morphoPositions = await fetchMorphoBlueBalances(chain, wallet.address, provider, morphoMarketIds);
            for (const pos of morphoPositions) defiSubs.push({ id: uuidv4(), label: `${wallet.label}-Morpho-${pos.symbol}`, source: 'lending', protocol: 'Morpho Blue', chain, amount: pos.amount, usdValue: 0, _symbol: pos.symbol, _group: getBaseTokenGroup(pos.symbol) } as any);
          } catch (e: any) { console.error(`[DeFi] Morpho Blue failed ${chain}/${wallet.label}:`, e.message); }
          try {
            const vaultPositions = await fetchMorphoVaultBalances(chain, wallet.address, provider, morphoVaultAddresses);
            for (const pos of vaultPositions) defiSubs.push({ id: uuidv4(), label: `${wallet.label}-${pos.vaultName}`, source: 'lending', protocol: 'Morpho Vault', chain, amount: pos.amount, usdValue: 0, _symbol: pos.symbol, _group: getBaseTokenGroup(pos.symbol) } as any);
          } catch (e: any) { console.error(`[DeFi] Morpho Vault failed ${chain}/${wallet.label}:`, e.message); }
        }
      })
    );

    await Promise.all(
      wallets.map(async (wallet) => {
        try {
          const hlpPositions = await fetchHyperliquidHlpPositions(wallet.address);
          for (const pos of hlpPositions) defiSubs.push({ id: uuidv4(), label: `${wallet.label}-HLP`, source: 'lending', protocol: 'Hyperliquid HLP', amount: pos.equity, usdValue: 0, _symbol: pos.symbol, _group: getBaseTokenGroup(pos.symbol) } as any);
        } catch (e: any) { console.error(`[DeFi] Hyperliquid HLP failed ${wallet.label}:`, e.message); }
      })
    );

    const allSymbols = new Set(allBalances.map((b) => b.symbol));
    for (const d of defiSubs) { if ((d as any)._symbol) allSymbols.add((d as any)._symbol); }
    prices = await fetchPrices([...allSymbols]);

    for (const b of allBalances) {
      const group = getBaseTokenGroup(b.symbol);
      if (!groupMap[group]) groupMap[group] = [];
      const price = prices[b.symbol] || 0;
      groupMap[group].push({ id: uuidv4(), label: `${b.walletLabel}-${b.symbol}`, source: 'wallet', chain: b.chain, amount: b.amount, usdValue: b.amount * price });
    }
    for (const d of defiSubs) {
      const sym = (d as any)._symbol;
      const price = prices[sym] || 0;
      const usdValue = Math.abs(d.amount) * price;
      // LP fees are always shown as USD under STABLE regardless of token type
      const group = d.source === 'lp_fees' ? 'STABLE' : (d as any)._group;
      if (!groupMap[group]) groupMap[group] = [];
      if (d.source === 'lp_fees') {
        groupMap[group].push({ id: d.id, label: d.label, source: d.source, protocol: d.protocol, chain: d.chain, amount: usdValue, usdValue });
      } else {
        groupMap[group].push({ id: d.id, label: d.label, source: d.source, protocol: d.protocol, chain: d.chain, amount: d.amount, usdValue });
      }
    }
  }

  // 6. Add manual assets
  const manualRows: any[] = db.prepare('SELECT * FROM manual_assets').all();
  for (const asset of manualRows) {
    const group = asset.base_token;
    if (!groupMap[group]) groupMap[group] = [];
    groupMap[group].push({
      id: asset.id,
      label: asset.label,
      source: 'cex_manual',
      amount: asset.amount,
      usdValue: 0, // manual assets don't have auto price calc yet
    });
  }

  // Ensure base-token prices are always present for the frontend
  const missingBasePrices = (['ETH', 'BTC', 'BNB'] as const).filter((t) => !prices[t]);
  if (missingBasePrices.length > 0) {
    const fallback = await fetchPrices(missingBasePrices);
    for (const t of missingBasePrices) {
      if (fallback[t]) prices[t] = fallback[t];
    }
  }

  // 7. Build TokenPosition array
  const positions: TokenPosition[] = Object.entries(groupMap).map(([baseToken, subs]) => ({
    baseToken,
    subPositions: subs,
    totalAmount: subs.reduce((s, p) => s + p.amount, 0),
    totalUsdValue: subs.reduce((s, p) => s + p.usdValue, 0),
  }));
  const incomeBreakdown = buildIncomeBreakdown(positions);
  return {
    positions,
    prices,
    timestamp: new Date().toISOString(),
    incomeBreakdown,
  };
}

/**
 * POST /api/positions/fetch
 * Aggregate all sources: on-chain wallets + DeFi + manual assets → TokenPosition[]
 */
router.post('/fetch', async (_req, res) => {
  try {
    const data = await fetchPositionsAggregate();
    res.json(data);
  } catch (error: any) {
    console.error('[Positions] Fetch error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/positions/manual
router.get('/manual', (_req, res) => {
  const assets: any[] = db.prepare('SELECT * FROM manual_assets ORDER BY base_token, label').all();
  res.json(assets.map((a) => ({
    id: a.id,
    label: a.label,
    baseToken: a.base_token,
    amount: a.amount,
    source: a.source,
    platform: a.platform || '',
    updatedAt: a.updated_at,
  })));
});

// POST /api/positions/manual
router.post('/manual', (req, res) => {
  const { id, label, baseToken, amount, source, platform } = req.body;
  if (!label || !baseToken || amount == null) {
    return res.status(400).json({ error: 'Missing label, baseToken, or amount' });
  }
  const assetId = id || uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO manual_assets (id, label, base_token, amount, source, platform, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label,
      base_token = excluded.base_token,
      amount = excluded.amount,
      source = excluded.source,
      platform = excluded.platform,
      updated_at = excluded.updated_at
  `).run(assetId, label, baseToken, amount, source || 'cex_manual', platform || '', now);

  res.json({ id: assetId, label, baseToken, amount, source: source || 'cex_manual', platform: platform || '', updatedAt: now });
});

// DELETE /api/positions/manual/:id
router.delete('/manual/:id', (req, res) => {
  const result = db.prepare('DELETE FROM manual_assets WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  res.json({ success: true });
});

export default router;
