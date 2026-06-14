import React, { createContext, useContext, useState } from 'react';
import { COLORS } from '../constants/theme';

const darkTheme = {
  background:   COLORS.bg_primary,
  card:         COLORS.bg_card,
  elevated:     COLORS.bg_elevated,
  text:         COLORS.text_primary,
  textSecondary:COLORS.text_secondary,
  textMuted:    COLORS.text_muted,
  primary:      COLORS.accent_purple,
  primaryLight: COLORS.accent_violet + '22',
  accent:       COLORS.accent_cyan,
  success:      COLORS.success,
  danger:       COLORS.danger,
  warning:      COLORS.warning,
  border:       COLORS.border,
  input:        COLORS.bg_input,
  bottomBar:    COLORS.bg_card,
  progressBg:   COLORS.border,
  flipBack:     COLORS.bg_elevated,
  accentLight:  COLORS.accent_purple + '22',
  dangerLight:  COLORS.danger + '22',
  overlay:      COLORS.overlay_dark,
}

const lightTheme = {
  background:    '#f1f5f9',
  card:          '#ffffff',
  elevated:      '#e2e8f0',
  text:          '#0f172a',
  textSecondary: '#475569',
  textMuted:     '#64748b',
  primary:       '#7c3aed',
  primaryLight:  '#7c3aed22',
  accent:        '#0891b2',
  success:       '#059669',
  danger:        '#dc2626',
  warning:       '#d97706',
  border:        '#cbd5e1',
  input:         '#f8fafc',
  bottomBar:     '#ffffff',
  progressBg:    '#e2e8f0',
  flipBack:      '#e2e8f0',
  accentLight:   '#7c3aed22',
  dangerLight:   '#dc262622',
  overlay:       'rgba(0,0,0,0.5)',
}

// AsyncStorage bağımlılığı olmadan - tema uygulama süresince hafızada tutulur
const ThemeContext = createContext();

export function ThemeProvider({ children }) {
    const [isDark, setIsDark] = useState(true);
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
