import React, { createContext, useContext } from 'react';

const ThemeContext = createContext(null);

export const ThemeProvider = ({ t, lang, changeLang, toggleLang, darkMode, setDarkMode, children }) => {
    return (
        <ThemeContext.Provider value={{ t, lang, changeLang, toggleLang, darkMode, setDarkMode }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const ctx = useContext(ThemeContext);
    if (!ctx) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return ctx;
};

export default ThemeContext;
