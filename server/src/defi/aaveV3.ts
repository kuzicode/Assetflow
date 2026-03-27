import { ethers } from 'ethers';
import { AAVE_UI_POOL_DATA_PROVIDERS, AAVE_POOL_ADDRESSES_PROVIDERS } from '../config/defi.js';

const UI_POOL_ABI = [
  'function getUserReservesData(address provider, address user) view returns (tuple(address underlyingAsset, uint256 scaledATokenBalance, bool usageAsCollateralEnabledOnUser, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 variableBorrowRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)[] userReserves, tuple(uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor) userEmodeCategoryId)',
  'function getReservesData(address provider) view returns (tuple(address underlyingAsset, string name, string symbol, uint256 decimals, uint256 baseLTVasCollateral, uint256 reserveLiquidationThreshold, uint256 reserveLiquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen, uint128 liquidityIndex, uint128 variableBorrowIndex, uint128 liquidityRate, uint128 variableBorrowRate, uint128 stableBorrowRate, uint40 lastUpdateTimestamp, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint256 availableLiquidity, uint256 totalPrincipalStableDebt, uint256 averageStableRate, uint256 stableDebtLastUpdateTimestamp, uint256 totalScaledVariableDebt, uint256 priceInMarketReferenceCurrency, address priceOracle, uint256 variableRateSlope1, uint256 variableRateSlope2, uint256 stableRateSlope1, uint256 stableRateSlope2, uint256 baseStableBorrowRate, uint256 baseVariableBorrowRate, uint256 optimalUsageRatio, bool isPaused, bool isSiloedBorrowing, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt, bool flashLoanEnabled, uint256 debtCeiling, uint256 debtCeilingDecimals, uint8 eModeCategoryId, uint256 borrowCap, uint256 supplyCap, uint16 eModeLtv, uint16 eModeLiquidationThreshold, uint16 eModeLiquidationBonus, address eModePriceSource, string eModeLabel, bool borrowableInIsolation)[] reservesData, tuple(uint256 marketReferenceCurrencyUnit, int256 marketReferenceCurrencyPriceInUsd, int256 networkBaseTokenPriceInUsd, uint8 networkBaseTokenPriceDecimals) baseCurrencyInfo)',
];

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

export interface AavePosition {
  protocol: string;
  type: string;
  chain: string;
  symbol: string;
  amount: number;
  isDebt: boolean;
}

const RAY = 10n ** 27n;

/**
 * Fetch Aave V3 supply and borrow positions for an address.
 * Uses liquidityIndex to convert scaledATokenBalance → actual balance.
 */
export async function fetchAaveV3Balances(
  chain: string,
  address: string,
  provider: ethers.JsonRpcProvider
): Promise<AavePosition[]> {
  const uiPoolAddr = AAVE_UI_POOL_DATA_PROVIDERS[chain];
  const poolProviderAddr = AAVE_POOL_ADDRESSES_PROVIDERS[chain];
  if (!uiPoolAddr || !poolProviderAddr) return [];

  const positions: AavePosition[] = [];

  try {
    const uiPool = new ethers.Contract(uiPoolAddr, UI_POOL_ABI, provider);

    // Fetch user reserves + reserve data in parallel
    const [[userReserves], [reservesData]] = await Promise.all([
      uiPool.getUserReservesData(poolProviderAddr, address),
      uiPool.getReservesData(poolProviderAddr),
    ]);

    // Build liquidityIndex map: underlyingAsset -> liquidityIndex
    const indexMap: Record<string, bigint> = {};
    const varBorrowIndexMap: Record<string, bigint> = {};
    for (const r of reservesData) {
      const key = r.underlyingAsset.toLowerCase();
      indexMap[key] = r.liquidityIndex;
      varBorrowIndexMap[key] = r.variableBorrowIndex;
    }

    // Filter active reserves
    const activeReserves = userReserves.filter(
      (r: any) => r.scaledATokenBalance > 0n || r.currentVariableDebt > 0n || r.currentStableDebt > 0n
    );

    await Promise.all(
      activeReserves.map(async (reserve: any) => {
        try {
          const tokenContract = new ethers.Contract(reserve.underlyingAsset, ERC20_ABI, provider);
          const [decimals, symbol] = await Promise.all([
            tokenContract.decimals(),
            tokenContract.symbol(),
          ]);
          const dec = Number(decimals);
          const assetKey = reserve.underlyingAsset.toLowerCase();

          // Supply position: scaledBalance * liquidityIndex / RAY
          if (reserve.scaledATokenBalance > 0n) {
            const liqIndex = indexMap[assetKey] || RAY;
            const actualBalance = (reserve.scaledATokenBalance * liqIndex) / RAY;
            const amount = parseFloat(ethers.formatUnits(actualBalance, dec));

            if (amount > 0.000001) {
              positions.push({
                protocol: 'Aave V3',
                type: 'Lending',
                chain,
                symbol,
                amount,
                isDebt: false,
              });
            }
          }

          // Variable debt
          if (reserve.currentVariableDebt > 0n) {
            const amount = parseFloat(ethers.formatUnits(reserve.currentVariableDebt, dec));
            if (amount > 0.000001) {
              positions.push({
                protocol: 'Aave V3',
                type: 'Borrow',
                chain,
                symbol,
                amount: -amount,
                isDebt: true,
              });
            }
          }

          // Stable debt
          if (reserve.currentStableDebt > 0n) {
            const amount = parseFloat(ethers.formatUnits(reserve.currentStableDebt, dec));
            if (amount > 0.000001) {
              positions.push({
                protocol: 'Aave V3',
                type: 'Borrow',
                chain,
                symbol,
                amount: -amount,
                isDebt: true,
              });
            }
          }
        } catch (e: any) {
          console.error(`[Aave V3] Error processing ${reserve.underlyingAsset}:`, e.message);
        }
      })
    );
  } catch (e: any) {
    console.error(`[Aave V3] Failed for ${chain}:`, e.message);
  }

  return positions;
}
