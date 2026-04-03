import { v4 as uuidv4 } from 'uuid';
import { fetchEvmBalances, type BalanceResult } from '../defi/evmBalance.js';
import { fetchUniswapV3Positions } from '../defi/uniswapV3.js';
import { fetchAaveV3Balances } from '../defi/aaveV3.js';
import { fetchMorphoBlueBalances } from '../defi/morphoBlue.js';
import { fetchMorphoVaultBalances } from '../defi/morphoVault.js';
import { fetchHyperliquidHlpPositions } from '../defi/hyperliquidHlp.js';
import { fetchOKXTokenBalances, fetchOKXDeFiPositions, type OKXCredentials } from '../defi/okx.js';
import { getBaseTokenGroup, STABLECOIN_SYMBOLS, createProvider } from '../config/chains.js';
import { fetchPrices } from '../utils/price.js';
import { mapWithConcurrency } from '../utils/async.js';
import { listWalletRows } from '../repositories/walletsRepo.js';
import { listManualAssetRows } from '../repositories/manualAssetsRepo.js';
import { getSetting } from '../repositories/settingsRepo.js';

interface Wallet {
  id: string;
  label: string;
  address: string;
  chains: string[];
}

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

export interface PositionsSnapshot {
  positions: TokenPosition[];
  prices: Record<string, number>;
  timestamp: string;
  incomeBreakdown: IncomeBreakdown;
  isStale: boolean;
  missingSymbols: string[];
  partialFailureSources: string[];
}

interface PositionsCache {
  value: PositionsSnapshot | null;
  expiresAt: number;
}

// Cache expires at the next 08:00 UTC+8 (= 00:00 UTC).
// This ensures positions are fetched at most once per day: the 08:00 cron is
// the authoritative daily refresh; any earlier visit on the same day reuses
// the cached result rather than hitting the chain again.
function getNextEightAmUTC8(): number {
  const now = Date.now();
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0); // today's 00:00 UTC = today's 08:00 UTC+8
  let next = d.getTime();
  if (next <= now) next += 24 * 3600_000; // already passed → use tomorrow
  return next;
}

const EXTERNAL_CONCURRENCY = Math.max(1, Number(process.env.EXTERNAL_FETCH_CONCURRENCY || '3'));

function getWallets(): Wallet[] {
  return listWalletRows().map((wallet) => ({
    id: wallet.id,
    label: wallet.label,
    address: wallet.address,
    chains: JSON.parse(wallet.chains_json),
  }));
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
  const safe = (value: number) => (Number.isFinite(value) ? value : 0);
  return {
    uniswap: safe(uniswap),
    morpho: safe(morpho),
    hlp: safe(hlp),
    total: safe(uniswap + morpho + hlp),
  };
}

function applyUsdValue(sub: SubPosition, baseToken: string, prices: Record<string, number>) {
  if (sub.source === 'cex_manual') {
    const unitUsd = baseToken === 'STABLE' ? 1 : prices[baseToken];
    sub.usdValue = Number.isFinite(unitUsd) ? sub.amount * unitUsd : 0;
  }
}

function finalizePositions(groupMap: Record<string, SubPosition[]>, prices: Record<string, number>) {
  return Object.entries(groupMap).map(([baseToken, subs]) => {
    for (const sub of subs) applyUsdValue(sub, baseToken, prices);
    return {
      baseToken,
      subPositions: subs,
      totalAmount: subs.reduce((sum, sub) => sum + sub.amount, 0),
      totalUsdValue: subs.reduce((sum, sub) => sum + sub.usdValue, 0),
    };
  });
}

export async function buildPositionsSnapshot(): Promise<PositionsSnapshot> {
  const wallets = getWallets();
  const groupMap: Record<string, SubPosition[]> = {};
  const partialFailureSources = new Set<string>();
  const missingSymbols = new Set<string>();
  let prices: Record<string, number> = {};

  const okxApiKey = process.env.OKX_API_KEY;
  const okxSecretKey = process.env.OKX_SECRET_KEY;
  const okxPassphrase = process.env.OKX_PASSPHRASE;
  const okxProjectId = process.env.OKX_PROJECT_ID;
  const okxReady = okxApiKey && okxSecretKey && okxPassphrase && okxProjectId;

  const putPrice = (symbol: string, price: number) => {
    if (!symbol || !Number.isFinite(price) || price <= 0) return;
    if (!prices[symbol]) prices[symbol] = price;
  };

  if (okxReady) {
    const okxCreds: OKXCredentials = {
      apiKey: okxApiKey!,
      secretKey: okxSecretKey!,
      passphrase: okxPassphrase!,
      projectId: okxProjectId!,
    };

    const evmWallets = wallets.filter((wallet) => !wallet.chains.includes('bitcoin') && !wallet.chains.includes('solana'));
    // OKX rate-limit: process wallets one at a time and serialize the two per-wallet calls
    // to avoid hitting the per-second request cap (429).
    for (const wallet of evmWallets) {
      try {
        const tokens = await fetchOKXTokenBalances(wallet.address, okxCreds);
        await new Promise((resolve) => setTimeout(resolve, 600));
        const defiPositions = await fetchOKXDeFiPositions(wallet.address, okxCreds);

        for (const token of tokens) {
          const group = getBaseTokenGroup(token.symbol);
          if (group === 'STABLE' && !STABLECOIN_SYMBOLS.includes(token.symbol)) continue;
          if (token.symbol && token.amount > 0 && token.usdValue > 0) {
            const spotPrice = token.usdValue / token.amount;
            putPrice(token.symbol, spotPrice);
            if (group !== 'STABLE' && group !== token.symbol) putPrice(group, spotPrice);
          }
          if (group === 'STABLE') putPrice('STABLE', 1);
          if (!groupMap[group]) groupMap[group] = [];
          groupMap[group].push({
            id: uuidv4(),
            label: `${wallet.label}-${token.symbol}`,
            source: 'wallet',
            chain: token.chain,
            amount: token.amount,
            usdValue: token.usdValue,
          });
        }

        for (const position of defiPositions) {
          if (!groupMap.STABLE) groupMap.STABLE = [];
          const isLending = /morpho|aave|compound|euler|benqi|venus/i.test(position.protocol);
          groupMap.STABLE.push({
            id: uuidv4(),
            label: `${wallet.label}-${position.protocol}`,
            source: isLending ? 'lending' : 'lp',
            protocol: position.protocol,
            chain: position.chain,
            amount: position.usdValue,
            usdValue: position.usdValue,
          });
        }

        try {
          const hlpPositions = await fetchHyperliquidHlpPositions(wallet.address);
          for (const position of hlpPositions) {
            if (!groupMap.STABLE) groupMap.STABLE = [];
            groupMap.STABLE.push({
              id: uuidv4(),
              label: `${wallet.label}-HLP`,
              source: 'hlp',
              protocol: 'Hyperliquid HLP',
              amount: position.equity,
              usdValue: position.equity,
            });
          }
        } catch (error: any) {
          partialFailureSources.add(`hyperliquid:${wallet.label}`);
          console.error(`[HLP] Failed wallet ${wallet.label}:`, error.message);
        }

        await mapWithConcurrency(
          wallet.chains.filter((chain) =>
            ['ethereum', 'arbitrum', 'optimism', 'base', 'polygon', 'bsc', 'avalanche'].includes(chain)
          ),
          EXTERNAL_CONCURRENCY,
          async (chain) => {
            try {
              const provider = createProvider(chain);
              if (!provider) return;
              const uniPositions = await fetchUniswapV3Positions(chain, wallet.address, provider);
              for (const position of uniPositions) {
                const ethPrice = prices.ETH || prices.WETH || 0;
                const price0 = STABLECOIN_SYMBOLS.includes(position.token0Symbol) ? 1 : (prices[position.token0Symbol] || ethPrice);
                const price1 = STABLECOIN_SYMBOLS.includes(position.token1Symbol) ? 1 : (prices[position.token1Symbol] || ethPrice);
                const totalFeeUsd = (position.fees0 > 0.000001 ? position.fees0 * price0 : 0) + (position.fees1 > 0.000001 ? position.fees1 * price1 : 0);
                if (totalFeeUsd > 0.01) {
                  if (!groupMap.STABLE) groupMap.STABLE = [];
                  groupMap.STABLE.push({
                    id: uuidv4(),
                    label: `${wallet.label}-${position.token0Symbol}/${position.token1Symbol}-手续费`,
                    source: 'lp_fees',
                    protocol: 'Uniswap V3',
                    chain,
                    amount: totalFeeUsd,
                    usdValue: totalFeeUsd,
                  });
                }
              }
            } catch (error: any) {
              partialFailureSources.add(`uniswap:${chain}:${wallet.label}`);
              console.error(`[UniV3 fees] Failed ${chain}/${wallet.label}:`, error.message);
            }
          }
        );
      } catch (error: any) {
        partialFailureSources.add(`okx:${wallet.label}`);
        console.error(`[OKX] Failed wallet ${wallet.label}:`, error.message);
      }
      // 600ms gap between wallets to stay under OKX rate limit
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    if (!prices.ETH && prices.WETH) prices.ETH = prices.WETH;
    if (!prices.BTC && prices.WBTC) prices.BTC = prices.WBTC;
    if (!prices.BNB && prices.WBNB) prices.BNB = prices.WBNB;
    if (!prices.STABLE) prices.STABLE = 1;
  } else {
    const allBalances: (BalanceResult & { walletLabel: string })[] = [];
    await mapWithConcurrency(wallets, EXTERNAL_CONCURRENCY, async (wallet) => {
      try {
        const balances = await fetchEvmBalances(wallet.address, wallet.chains);
        for (const balance of balances) allBalances.push({ ...balance, walletLabel: wallet.label });
      } catch (error: any) {
        partialFailureSources.add(`wallet:${wallet.label}`);
        console.error(`[Positions] Failed wallet ${wallet.label}:`, error.message);
      }
    });

    const morphoMarketIds = JSON.parse(getSetting('morpho_market_ids') || '[]') as string[];
    const morphoVaultAddresses = JSON.parse(getSetting('morpho_vault_addresses') || '[]') as string[];
    const defiSubs: Array<SubPosition & { _symbol?: string; _group?: string }> = [];

    await mapWithConcurrency(wallets, EXTERNAL_CONCURRENCY, async (wallet) => {
      await mapWithConcurrency(wallet.chains, EXTERNAL_CONCURRENCY, async (chain) => {
        const provider = createProvider(chain);
        if (!provider) return;

        try {
          const uniPositions = await fetchUniswapV3Positions(chain, wallet.address, provider);
          for (const position of uniPositions) {
            const pairLabel = `${position.token0Symbol}/${position.token1Symbol}`;
            if (position.amount0 > 0.000001) defiSubs.push({ id: uuidv4(), label: `${wallet.label}-${pairLabel}-仓位`, source: 'lp', protocol: 'Uniswap V3', chain, amount: position.amount0, usdValue: 0, _symbol: position.token0Symbol, _group: getBaseTokenGroup(position.token0Symbol) });
            if (position.amount1 > 0.000001) defiSubs.push({ id: uuidv4(), label: `${wallet.label}-${pairLabel}-仓位`, source: 'lp', protocol: 'Uniswap V3', chain, amount: position.amount1, usdValue: 0, _symbol: position.token1Symbol, _group: getBaseTokenGroup(position.token1Symbol) });
            if (position.fees0 > 0.000001) defiSubs.push({ id: uuidv4(), label: `${wallet.label}-${pairLabel}-手续费`, source: 'lp_fees', protocol: 'Uniswap V3', chain, amount: position.fees0, usdValue: 0, _symbol: position.token0Symbol, _group: getBaseTokenGroup(position.token0Symbol) });
            if (position.fees1 > 0.000001) defiSubs.push({ id: uuidv4(), label: `${wallet.label}-${pairLabel}-手续费`, source: 'lp_fees', protocol: 'Uniswap V3', chain, amount: position.fees1, usdValue: 0, _symbol: position.token1Symbol, _group: getBaseTokenGroup(position.token1Symbol) });
          }
        } catch (error: any) {
          partialFailureSources.add(`uniswap:${chain}:${wallet.label}`);
          console.error(`[DeFi] Uniswap V3 failed ${chain}/${wallet.label}:`, error.message);
        }

        try {
          const aavePositions = await fetchAaveV3Balances(chain, wallet.address, provider);
          for (const position of aavePositions) defiSubs.push({ id: uuidv4(), label: `${wallet.label}-AAVE-${position.symbol}`, source: 'lending', protocol: 'Aave V3', chain, amount: position.amount, usdValue: 0, _symbol: position.symbol, _group: getBaseTokenGroup(position.symbol) });
        } catch (error: any) {
          partialFailureSources.add(`aave:${chain}:${wallet.label}`);
          console.error(`[DeFi] Aave V3 failed ${chain}/${wallet.label}:`, error.message);
        }

        try {
          const morphoPositions = await fetchMorphoBlueBalances(chain, wallet.address, provider, morphoMarketIds);
          for (const position of morphoPositions) defiSubs.push({ id: uuidv4(), label: `${wallet.label}-Morpho-${position.symbol}`, source: 'lending', protocol: 'Morpho Blue', chain, amount: position.amount, usdValue: 0, _symbol: position.symbol, _group: getBaseTokenGroup(position.symbol) });
        } catch (error: any) {
          partialFailureSources.add(`morpho-blue:${chain}:${wallet.label}`);
          console.error(`[DeFi] Morpho Blue failed ${chain}/${wallet.label}:`, error.message);
        }

        try {
          const vaultPositions = await fetchMorphoVaultBalances(chain, wallet.address, provider, morphoVaultAddresses);
          for (const position of vaultPositions) defiSubs.push({ id: uuidv4(), label: `${wallet.label}-${position.vaultName}`, source: 'lending', protocol: 'Morpho Vault', chain, amount: position.amount, usdValue: 0, _symbol: position.symbol, _group: getBaseTokenGroup(position.symbol) });
        } catch (error: any) {
          partialFailureSources.add(`morpho-vault:${chain}:${wallet.label}`);
          console.error(`[DeFi] Morpho Vault failed ${chain}/${wallet.label}:`, error.message);
        }
      });
    });

    await mapWithConcurrency(wallets, EXTERNAL_CONCURRENCY, async (wallet) => {
      try {
        const hlpPositions = await fetchHyperliquidHlpPositions(wallet.address);
        for (const position of hlpPositions) defiSubs.push({ id: uuidv4(), label: `${wallet.label}-HLP`, source: 'hlp', protocol: 'Hyperliquid HLP', amount: position.equity, usdValue: position.equity, _symbol: position.symbol, _group: getBaseTokenGroup(position.symbol) });
      } catch (error: any) {
        partialFailureSources.add(`hyperliquid:${wallet.label}`);
        console.error(`[DeFi] Hyperliquid HLP failed ${wallet.label}:`, error.message);
      }
    });

    const allSymbols = new Set(allBalances.map((balance) => balance.symbol));
    for (const defiSub of defiSubs) {
      if (defiSub._symbol) allSymbols.add(defiSub._symbol);
    }
    const priceSnapshot = await fetchPrices([...allSymbols]);
    prices = priceSnapshot.prices;
    for (const symbol of priceSnapshot.missingSymbols) missingSymbols.add(symbol);
    for (const source of priceSnapshot.partialFailureSources) partialFailureSources.add(source);

    for (const balance of allBalances) {
      const group = getBaseTokenGroup(balance.symbol);
      if (!groupMap[group]) groupMap[group] = [];
      const price = prices[balance.symbol];
      if (price == null && !STABLECOIN_SYMBOLS.includes(balance.symbol)) missingSymbols.add(balance.symbol);
      groupMap[group].push({
        id: uuidv4(),
        label: `${balance.walletLabel}-${balance.symbol}`,
        source: 'wallet',
        chain: balance.chain,
        amount: balance.amount,
        usdValue: Number.isFinite(price) ? balance.amount * price : 0,
      });
    }

    for (const defiSub of defiSubs) {
      const symbol = defiSub._symbol || '';
      const price = symbol ? prices[symbol] : undefined;
      if (symbol && price == null && !STABLECOIN_SYMBOLS.includes(symbol)) missingSymbols.add(symbol);
      const usdValue = symbol && Number.isFinite(price) ? Math.abs(defiSub.amount) * (price as number) : defiSub.usdValue;
      const group = defiSub.source === 'lp_fees' ? 'STABLE' : (defiSub._group || getBaseTokenGroup(symbol));
      if (!groupMap[group]) groupMap[group] = [];
      if (defiSub.source === 'lp_fees') {
        groupMap[group].push({ id: defiSub.id, label: defiSub.label, source: defiSub.source, protocol: defiSub.protocol, chain: defiSub.chain, amount: usdValue, usdValue });
      } else {
        groupMap[group].push({ id: defiSub.id, label: defiSub.label, source: defiSub.source, protocol: defiSub.protocol, chain: defiSub.chain, amount: defiSub.amount, usdValue });
      }
    }
  }

  const missingBasePrices = (['ETH', 'BTC', 'BNB'] as const).filter((token) => prices[token] == null);
  if (missingBasePrices.length > 0) {
    const fallbackSnapshot = await fetchPrices(missingBasePrices as unknown as string[]);
    prices = { ...prices, ...fallbackSnapshot.prices };
    for (const symbol of fallbackSnapshot.missingSymbols) missingSymbols.add(symbol);
    for (const source of fallbackSnapshot.partialFailureSources) partialFailureSources.add(source);
  }

  for (const asset of listManualAssetRows()) {
    const group = asset.base_token;
    if (!groupMap[group]) groupMap[group] = [];
    groupMap[group].push({
      id: asset.id,
      label: asset.label,
      source: 'cex_manual',
      amount: asset.amount,
      usdValue: 0,
    });
  }

  const positions = finalizePositions(groupMap, prices);
  return {
    positions,
    prices,
    timestamp: new Date().toISOString(),
    incomeBreakdown: buildIncomeBreakdown(positions),
    isStale: partialFailureSources.size > 0 || missingSymbols.size > 0,
    missingSymbols: [...missingSymbols],
    partialFailureSources: [...partialFailureSources],
  };
}

let cache: PositionsCache = {
  value: null,
  expiresAt: 0,
};
let inFlight: Promise<PositionsSnapshot> | null = null;

export async function getPositionsSnapshot(options?: { force?: boolean }) {
  const force = options?.force ?? false;
  if (!force && cache.value && Date.now() < cache.expiresAt) {
    return cache.value;
  }
  if (inFlight) return inFlight;
  inFlight = buildPositionsSnapshot()
    .then((snapshot) => {
      cache = {
        value: snapshot,
        expiresAt: getNextEightAmUTC8(),
      };
      return snapshot;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function getCachedPositionsSnapshot() {
  return cache.value;
}

export function invalidatePositionsSnapshotCache() {
  cache = { value: null, expiresAt: 0 };
}
