interface YieldsSnapshot {
    aave_usdc: {
        apy: number | null;
        chain: string;
    };
    morpho_usdc: {
        apy: number | null;
        chain: string;
        vault: string;
    };
    hlp: {
        apy: number | null;
    };
    updatedAt: string;
    partialFailureSources: string[];
    isStale: boolean;
}
export declare function getYieldsSnapshot(force?: boolean): Promise<YieldsSnapshot>;
export declare function prefetchYields(): Promise<YieldsSnapshot>;
export {};
