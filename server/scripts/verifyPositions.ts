import { strict as assert } from 'node:assert';

type PositionsFetchResponse = {
  positions: Array<{
    baseToken: string;
    totalAmount: number;
    totalUsdValue: number;
    subPositions: Array<{
      id: string;
      label: string;
      source: string;
      protocol?: string;
      chain?: string;
      amount: number;
      usdValue: number;
    }>;
  }>;
  prices: Record<string, number>;
  timestamp: string;
};

const API = process.env.ASSETFLOW_API ?? 'http://localhost:3001';

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function round(n: number, d = 8) {
  const m = 10 ** d;
  return Math.round(n * m) / m;
}

function pct(a: number, b: number) {
  return b === 0 ? 0 : (a / b) * 100;
}

async function main() {
  const res = await fetch(`${API}/api/positions/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) {
    throw new Error(`fetch positions failed: ${res.status}`);
  }
  const data = (await res.json()) as PositionsFetchResponse;

  console.log(`\n[verify] timestamp=${data.timestamp}`);
  assert(Array.isArray(data.positions), 'positions must be array');
  assert(data.prices && typeof data.prices === 'object', 'prices must be object');

  const issues: string[] = [];

  // Price sanity: stable is 1 if present
  if (data.prices.STABLE != null && Math.abs(data.prices.STABLE - 1) > 0.05) {
    issues.push(`prices.STABLE expected ~1, got ${data.prices.STABLE}`);
  }
  for (const k of ['ETH', 'BTC', 'BNB']) {
    if (data.prices[k] != null && data.prices[k] <= 0) {
      issues.push(`prices.${k} must be >0 when present, got ${data.prices[k]}`);
    }
  }

  // Invariants per baseToken
  let grandUsd = 0;
  for (const p of data.positions) {
    if (!p || typeof p !== 'object') continue;
    const subs = Array.isArray(p.subPositions) ? p.subPositions : [];

    if (!isFiniteNumber(p.totalAmount) || !isFiniteNumber(p.totalUsdValue)) {
      issues.push(`[${p.baseToken}] totalAmount/totalUsdValue not finite`);
      continue;
    }

    const sumAmount = subs.reduce((s, sp) => s + (Number(sp.amount) || 0), 0);
    const sumUsd = subs.reduce((s, sp) => s + (Number(sp.usdValue) || 0), 0);
    const amountDiff = Math.abs(sumAmount - p.totalAmount);
    const usdDiff = Math.abs(sumUsd - p.totalUsdValue);

    // Allow tiny float drift
    if (amountDiff > 1e-6) {
      issues.push(`[${p.baseToken}] totalAmount mismatch: total=${p.totalAmount} sum(sub)=${sumAmount} diff=${amountDiff}`);
    }
    if (usdDiff > 1e-3) {
      issues.push(`[${p.baseToken}] totalUsdValue mismatch: total=${p.totalUsdValue} sum(sub)=${sumUsd} diff=${usdDiff}`);
    }

    // Wallet stable sanity: for wallet subpositions under STABLE, usdValue ~ amount
    if (p.baseToken === 'STABLE') {
      for (const sp of subs.filter((s) => s.source === 'wallet')) {
        const drift = Math.abs((Number(sp.usdValue) || 0) - (Number(sp.amount) || 0));
        if (drift > 0.05) {
          issues.push(`[STABLE wallet] usdValue not ~amount for ${sp.label}: amount=${sp.amount} usd=${sp.usdValue}`);
        }
      }
    }

    grandUsd += p.totalUsdValue;
  }

  // Stable breakdown (matches Dashboard logic)
  const stable = data.positions.find((p) => p.baseToken === 'STABLE');
  if (stable) {
    const subs = stable.subPositions || [];
    const stableTotal = stable.totalUsdValue;
    const uniLp = subs
      .filter((s) => (s.protocol || '').toLowerCase().includes('uniswap') && s.source === 'lp')
      .reduce((sum, s) => sum + (s.usdValue || 0), 0);
    const hlp = subs
      .filter((s) => (s.protocol || '').toLowerCase().includes('hyperliquid') || s.source === 'hlp')
      .reduce((sum, s) => sum + (s.usdValue || 0), 0);
    const morpho = subs
      .filter((s) => (s.protocol || '').toLowerCase().includes('morpho'))
      .reduce((sum, s) => sum + (s.usdValue || 0), 0);
    const other = Math.max(0, stableTotal - (uniLp + hlp + morpho));

    console.log('\n[stable breakdown]');
    console.log(`total_usd=${round(stableTotal, 2)}`);
    console.log(`uniswap_lp_usd=${round(uniLp, 2)} (${round(pct(uniLp, stableTotal), 2)}%)`);
    console.log(`hlp_usd=${round(hlp, 2)} (${round(pct(hlp, stableTotal), 2)}%)`);
    console.log(`morpho_usd=${round(morpho, 2)} (${round(pct(morpho, stableTotal), 2)}%)`);
    console.log(`other_usd=${round(other, 2)} (${round(pct(other, stableTotal), 2)}%)`);
  }

  console.log('\n[totals]');
  console.log(`grand_usd_positions=${round(grandUsd, 2)}`);

  if (issues.length) {
    console.log('\n[issues]');
    for (const i of issues) console.log(`- ${i}`);
    process.exitCode = 1;
  } else {
    console.log('\nOK: no consistency issues found.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

