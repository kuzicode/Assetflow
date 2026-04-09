import { describe, expect, it } from 'vitest';
import { buildMaSeries, classifyTrend } from './indicatorService.js';
describe('indicator service helpers', () => {
    it('builds MA series with derived bands and macd fields', () => {
        const klines = Array.from({ length: 100 }, (_, index) => ({
            openTime: Date.UTC(2024, 0, index + 1),
            open: 100 + index,
            high: 101 + index,
            low: 99 + index,
            close: 100 + index,
            closeTime: Date.UTC(2024, 0, index + 1, 4),
        }));
        const series = buildMaSeries(klines);
        expect(series.length).toBeGreaterThan(0);
        expect(series[0].ma4).toBeGreaterThan(series[0].ma3);
        expect(series[0].ma3).toBeGreaterThan(series[0].ma2);
        expect(series[0].ma2).toBeGreaterThan(series[0].ma5);
        expect(series[0].macd).toBeTypeOf('number');
    });
    it('classifies trend by price and ma bands', () => {
        expect(classifyTrend({ close: 130, ma2: 100, ma3: 110, ma4: 120, ma5: 90, ma6: 80, macd: 0, signal: 0, hist: 0, time: '' })).toBe('above_ma4');
        expect(classifyTrend({ close: 115, ma2: 100, ma3: 110, ma4: 120, ma5: 90, ma6: 80, macd: 0, signal: 0, hist: 0, time: '' })).toBe('above_ma3');
        expect(classifyTrend({ close: 104, ma2: 100, ma3: 110, ma4: 120, ma5: 90, ma6: 80, macd: 0, signal: 0, hist: 0, time: '' })).toBe('between_ma2_ma3');
        expect(classifyTrend({ close: 95, ma2: 100, ma3: 110, ma4: 120, ma5: 90, ma6: 80, macd: 0, signal: 0, hist: 0, time: '' })).toBe('between_ma5_ma2');
        expect(classifyTrend({ close: 85, ma2: 100, ma3: 110, ma4: 120, ma5: 90, ma6: 80, macd: 0, signal: 0, hist: 0, time: '' })).toBe('below_ma5');
        expect(classifyTrend({ close: 70, ma2: 100, ma3: 110, ma4: 120, ma5: 90, ma6: 80, macd: 0, signal: 0, hist: 0, time: '' })).toBe('below_ma6');
    });
});
