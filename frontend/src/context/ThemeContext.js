import React, { createContext, useContext, useState } from 'react';
import { lightTheme, darkTheme } from '../theme/colors';

// AsyncStorage bağımlılığı olmadan - tema uygulama süresince hafızada tutulur
const ThemeContext = createContext();

export function ThemeProvider({ children }) {
    const [isDark, setIsDark] = useState(false);
    const theme = isDark ? darkTheme : lightTheme;

    const toggleTheme = () => {
        setIsDark(prev => !prev);
    };

    return (
        <ThemeContext.Provider value={{ isDark, theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
