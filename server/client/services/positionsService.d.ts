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
export declare function buildPositionsSnapshot(): Promise<PositionsSnapshot>;
export declare function getPositionsSnapshot(options?: {
    force?: boolean;
}): Promise<PositionsSnapshot>;
export declare function getCachedPositionsSnapshot(): PositionsSnapshot | null;
export declare function invalidatePositionsSnapshotCache(): void;
export {};
