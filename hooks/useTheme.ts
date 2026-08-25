import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'igui-theme';

// index.html ja aplica a classe "dark" no <html> antes do React montar (evita
// flash de tela clara), lendo o mesmo localStorage. Esse hook so sincroniza o
// estado do React com o que ja esta no DOM/localStorage.
const getInitialTheme = (): Theme => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch (_) {
    return 'light';
  }
};

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (_) {
      // localStorage indisponivel (modo privado etc.) - preferencia so vale pra sessao atual
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme };
};
