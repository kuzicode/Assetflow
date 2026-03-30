import { ethers } from 'ethers';
import { MORPHO_BLUE_ADDRESS } from '../config/defi.js';

const MORPHO_ABI = [
  'function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)',
  'function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)',
  'function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)',
];

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

export interface MorphoPosition {
  protocol: string;
  type: string;
  chain: string;
  symbol: string;
  amount: number;
  marketId: string;
  isDebt: boolean;
}

/**
 * Fetch Morpho Blue supply/borrow positions for given market IDs.
 * Market IDs must be pre-configured (stored in settings or passed in).
 */
export async function fetchMorphoBlueBalances(
  chain: string,
  address: string,
  provider: ethers.Provider,
  marketIds: string[]
): Promise<MorphoPosition[]> {
  const morphoAddr = MORPHO_BLUE_ADDRESS[chain];
  if (!morphoAddr || marketIds.length === 0) return [];

  const positions: MorphoPosition[] = [];

  try {
    const morpho = new ethers.Contract(morphoAddr, MORPHO_ABI, provider);

    // Process markets sequentially to avoid exceeding RPC batch call limits
    for (const marketId of marketIds) {
        try {
          // Fetch position, market state, and market params sequentially
          // (public RPCs often limit batch size to ~10 calls)
          const pos = await morpho.position(marketId, address);
          const marketState = await morpho.market(marketId);
          const marketParams = await morpho.idToMarketParams(marketId);

          const { supplyShares, borrowShares } = pos;
          const { totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares } = marketState;

          // Get loan token info
          const loanToken = new ethers.Contract(marketParams.loanToken, ERC20_ABI, provider);
          const [loanDecimals, loanSymbol] = await Promise.all([
            loanToken.decimals(),
            loanToken.symbol(),
          ]);
          const dec = Number(loanDecimals);

          // Supply: supplyShares * totalSupplyAssets / totalSupplyShares
          if (supplyShares > 0n && totalSupplyShares > 0n) {
            const supplyAssets = (supplyShares * totalSupplyAssets) / totalSupplyShares;
            const amount = parseFloat(ethers.formatUnits(supplyAssets, dec));

            if (amount > 0.000001) {
              positions.push({
                protocol: 'Morpho Blue',
                type: 'Lending',
                chain,
                symbol: loanSymbol,
                amount,
                marketId,
                isDebt: false,
              });
            }
          }

          // Borrow: borrowShares * totalBorrowAssets / totalBorrowShares
          if (borrowShares > 0n && totalBorrowShares > 0n) {
            const borrowAssets = (BigInt(borrowShares) * totalBorrowAssets) / totalBorrowShares;
            const amount = parseFloat(ethers.formatUnits(borrowAssets, dec));

            if (amount > 0.000001) {
              positions.push({
                protocol: 'Morpho Blue',
                type: 'Borrow',
                chain,
                symbol: loanSymbol,
                amount: -amount,
                marketId,
                isDebt: true,
              });
            }
          }
        } catch (e: any) {
          console.error(`[Morpho Blue] Error fetching market ${marketId}:`, e.message);
        }
    }
  } catch (e: any) {
    console.error(`[Morpho Blue] Failed for ${chain}:`, e.message);
  }

  return positions;
}
