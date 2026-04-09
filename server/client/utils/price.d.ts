export interface PriceSnapshot {
    prices: Record<string, number>;
    ath: Record<string, {
        ath: number;
        athDate: string;
    }>;
    missingSymbols: string[];
    partialFailureSources: string[];
    timestamp: string;
}
interface AthEntry {
    ath: number;
    athDate: string;
}
export declare function fetchAthData(symbols: string[]): Promise<Record<string, AthEntry>>;
/**
 * Fetch USD prices for a list of symbols.
 * Returns a map: symbol -> price in USD.
 */
export declare function fetchPrices(symbols: string[]): Promise<PriceSnapshot>;
export {};
