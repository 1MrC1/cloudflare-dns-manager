import translations from '../../src/utils/translations';

describe('translations', () => {
    const zhKeys = Object.keys(translations.zh).sort();
    const enKeys = Object.keys(translations.en).sort();

    it('both languages have the same set of keys', () => {
        expect(zhKeys).toEqual(enKeys);
    });

    it('no empty string values in zh', () => {
        const emptyKeys = Object.entries(translations.zh)
            .filter(([, v]) => v === '')
            .map(([k]) => k);
        expect(emptyKeys).toEqual([]);
    });

    it('no empty string values in en', () => {
        const emptyKeys = Object.entries(translations.en)
            .filter(([, v]) => v === '')
            .map(([k]) => k);
        expect(emptyKeys).toEqual([]);
    });

    it('all keys present in zh are present in en', () => {
        const enKeySet = new Set(Object.keys(translations.en));
        const missingInEn = Object.keys(translations.zh).filter(k => !enKeySet.has(k));
        expect(missingInEn).toEqual([]);
    });

    it('all keys present in en are present in zh', () => {
        const zhKeySet = new Set(Object.keys(translations.zh));
        const missingInZh = Object.keys(translations.en).filter(k => !zhKeySet.has(k));
        expect(missingInZh).toEqual([]);
    });
});
