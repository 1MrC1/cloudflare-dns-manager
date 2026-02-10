import { useState } from 'react';
import translations from '../utils/translations.js';

type Lang = 'zh' | 'en' | 'ja' | 'ko';
const langCycle: Lang[] = ['zh', 'en', 'ja', 'ko'];

const useTranslate = () => {
    const [lang, setLang] = useState<Lang>(
        (localStorage.getItem('lang') as Lang) || 'zh'
    );

    const t = (key: string): string =>
        (translations as Record<string, Record<string, string>>)[lang]?.[key] || key;

    const changeLang = (l: Lang) => {
        setLang(l);
        localStorage.setItem('lang', l);
    };

    const toggleLang = () => {
        const idx = langCycle.indexOf(lang);
        const next = langCycle[(idx + 1) % langCycle.length];
        changeLang(next);
    };

    return { t, lang, changeLang, toggleLang };
};

export default useTranslate;
