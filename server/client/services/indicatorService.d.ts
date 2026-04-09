interface KlineRow {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    closeTime: number;
}
interface MaPoint {
    time: string;
    close: number;
    ma2: number;
    ma3: number;
    ma4: number;
    ma5: number;
    ma6: number;
    macd: number;
    signal: number;
    hist: number;
}
declare function buildMaSeries(klines: KlineRow[]): MaPoint[];
declare function classifyTrend(point: MaPoint): "above_ma4" | "above_ma3" | "between_ma2_ma3" | "between_ma5_ma2" | "below_ma5" | "below_ma6";
export declare function getMaChart(symbol: string, interval: string): Promise<any>;
export declare function getMaTrends(interval: string, symbols?: string[]): Promise<any>;
export { classifyTrend, buildMaSeries };
export interface MvrvHistoryItem {
    date: string;
    mvrv: number;
    price: number;
}
export interface MvrvResult {
    current: {
        mvrv: number;
        price: number;
        status: string;
        percentile: number;
    };
    history: MvrvHistoryItem[];
    timestamp: string;
}
export declare function getMvrv(): Promise<MvrvResult>;
export interface Ahr999HistoryItem {
    date: string;
    ahr999: number;
    price: number;
    cost200d: number;
    fittedPrice: number;
}
export interface Ahr999Result {
    current: {
        ahr999: number;
        price: number;
        cost200d: number;
        fittedPrice: number;
        suggestion: string;
    };
    history: Ahr999HistoryItem[];
    timestamp: string;
}
export declare function getAhr999(): Promise<Ahr999Result>;
export interface BtcdomHistoryItem {
    date: string;
    dominance: number;
}
export interface BtcdomResult {
    current: {
        dominance: number;
        price: number;
        status: string;
    };
    history: BtcdomHistoryItem[];
    timestamp: string;
}
export declare function getBtcdom(): Promise<BtcdomResult>;
