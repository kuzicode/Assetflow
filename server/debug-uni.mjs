// Debug script: test fetchUniswapV3Positions for both wallets
// Run: node --experimental-vm-modules debug-uni.mjs
import { ethers } from 'ethers';

const W1 = '0xf0777e27c50eaa9a6cb2255b0aa3ee21e35aad84';
const W2 = '0x7C6Ef14F6890D0fdA17fB8E4Fb6F649F0355c3BE';

const RPC = process.env.ETH_RPC_URL || process.env.ETH_RPC_FALLBACK || 'https://ethereum-rpc.publicnode.com';
const provider = new ethers.JsonRpcProvider(RPC);

const MAX_UINT128 = 2n ** 128n - 1n;
const NFT_ADDR = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';

const NFT_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max) params) returns (uint256 amount0, uint256 amount1)',
];

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

async function debugWallet(address, label) {
  console.log(`\n=== ${label} (${address}) ===`);
  const nft = new ethers.Contract(NFT_ADDR, NFT_ABI, provider);

  const balance = await nft.balanceOf(address);
  const count = Number(balance);
  console.log(`  LP positions: ${count}`);
  if (count === 0) return;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const tokenIds = [];
  for (let i = 0; i < count; i++) {
    if (i > 0) await sleep(200);
    const tokenId = await nft.tokenOfOwnerByIndex(address, i);
    tokenIds.push(Number(tokenId));
  }
  console.log(`  Token IDs: ${tokenIds.join(', ')}`);

  for (const tokenId of tokenIds) {
    try {
      const pos = await nft.positions(tokenId);
      const liq = pos.liquidity;
      console.log(`\n  [#${tokenId}] liquidity=${liq}, tokensOwed0=${pos.tokensOwed0}, tokensOwed1=${pos.tokensOwed1}`);

      if (liq === 0n && pos.tokensOwed0 === 0n && pos.tokensOwed1 === 0n) {
        console.log(`    → SKIPPED (closed, no owed fees)`);
        continue;
      }

      const t0 = new ethers.Contract(pos.token0, ERC20_ABI, provider);
      const t1 = new ethers.Contract(pos.token1, ERC20_ABI, provider);
      const [dec0, sym0, dec1, sym1] = await Promise.all([t0.decimals(), t0.symbol(), t1.decimals(), t1.symbol()]);
      console.log(`    pair: ${sym0}/${sym1}`);

      // Try collect.staticCall
      try {
        const collected = await nft.collect.staticCall(
          { tokenId, recipient: address, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 },
          { from: address }
        );
        const fees0 = parseFloat(ethers.formatUnits(collected.amount0, Number(dec0)));
        const fees1 = parseFloat(ethers.formatUnits(collected.amount1, Number(dec1)));
        console.log(`    fees via staticCall: ${fees0} ${sym0}, ${fees1} ${sym1}`);
      } catch (err) {
        console.warn(`    staticCall FAILED: ${err.message?.slice(0, 120)}`);
        const fees0 = parseFloat(ethers.formatUnits(pos.tokensOwed0, Number(dec0)));
        const fees1 = parseFloat(ethers.formatUnits(pos.tokensOwed1, Number(dec1)));
        console.log(`    fees via tokensOwed: ${fees0} ${sym0}, ${fees1} ${sym1}`);
      }
    } catch (e) {
      console.error(`    ERROR: ${e.message}`);
    }
  }
}

async function main() {
  console.log(`RPC: ${RPC}`);
  try {
    const block = await provider.getBlockNumber();
    console.log(`Connected, block: ${block}`);
  } catch (e) {
    console.error(`RPC connection failed: ${e.message}`);
    process.exit(1);
  }

  await debugWallet(W1, 'W1 黑Onekey');
  await debugWallet(W2, 'W2 白Onekey');
}

main().catch(console.error);
