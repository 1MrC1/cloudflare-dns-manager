import { useState } from 'react';
import translations from '../utils/translations.js';

const useTranslate = () => {
    const [lang, setLang] = useState<'zh' | 'en'>(
        (localStorage.getItem('lang') as 'zh' | 'en') || 'zh'
    );

    const t = (key: string): string =>
        (translations as Record<string, Record<string, string>>)[lang]?.[key] || key;

    const changeLang = (l: 'zh' | 'en') => {
        setLang(l);
        localStorage.setItem('lang', l);
    };

    const toggleLang = () => {
        changeLang(lang === 'zh' ? 'en' : 'zh');
    };

    return { t, lang, changeLang, toggleLang };
};

export default useTranslate;
