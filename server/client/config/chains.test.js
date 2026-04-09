import { describe, it, expect } from 'vitest';
import { getBaseTokenGroup, STABLECOIN_SYMBOLS } from './chains.js';
describe('getBaseTokenGroup', () => {
    it('maps stablecoins to STABLE', () => {
        for (const symbol of STABLECOIN_SYMBOLS) {
            expect(getBaseTokenGroup(symbol)).toBe('STABLE');
        }
    });
    it('maps ETH variants to ETH', () => {
        const ethTokens = ['ETH', 'WETH', 'stETH', 'wstETH', 'cbETH', 'rETH'];
        for (const symbol of ethTokens) {
            expect(getBaseTokenGroup(symbol)).toBe('ETH');
        }
    });
    it('maps BTC variants to BTC', () => {
        const btcTokens = ['BTC', 'WBTC', 'tBTC', 'cbBTC'];
        for (const symbol of btcTokens) {
            expect(getBaseTokenGroup(symbol)).toBe('BTC');
        }
    });
    it('maps BNB variants to BNB', () => {
        expect(getBaseTokenGroup('BNB')).toBe('BNB');
        expect(getBaseTokenGroup('WBNB')).toBe('BNB');
    });
    it('returns symbol as-is for unknown tokens', () => {
        expect(getBaseTokenGroup('LINK')).toBe('LINK');
        expect(getBaseTokenGroup('UNI')).toBe('UNI');
        expect(getBaseTokenGroup('ARB')).toBe('ARB');
    });
});
