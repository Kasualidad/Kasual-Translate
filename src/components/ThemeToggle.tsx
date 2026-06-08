import React, { useEffect, useState } from 'react';
import { FaDesktop, FaMoon, FaSun } from 'react-icons/fa';

type Theme = 'dark' | 'light' | 'system';
const THEME_VERSION = 'orange-light-default';

interface ThemeToggleProps {
  label?: string;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ label = 'Theme' }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const storedVersion = localStorage.getItem('kasual_theme_version');
    if (storedVersion !== THEME_VERSION) {
      localStorage.setItem('kasual_theme_version', THEME_VERSION);
      localStorage.setItem('kasual_theme', 'light');
      return 'light';
    }

    const storedTheme = localStorage.getItem('kasual_theme') as Theme | null;
    return storedTheme === 'dark' || storedTheme === 'light' || storedTheme === 'system' ? storedTheme : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('theme-dark', systemDark);
    } else {
      root.classList.toggle('theme-dark', theme === 'dark');
    }
    localStorage.setItem('kasual_theme', theme);
    localStorage.setItem('kasual_theme_version', THEME_VERSION);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => {
      if (prev === 'dark') return 'light';
      if (prev === 'light') return 'system';
      return 'dark';
    });
  };

  const getIcon = () => {
    if (theme === 'dark') return <FaMoon aria-hidden="true" />;
    if (theme === 'light') return <FaSun aria-hidden="true" />;
    return <FaDesktop aria-hidden="true" />;
  };

  return (
    <button onClick={toggleTheme} className="btn icon-only" title={`${label}: ${theme}`} aria-label={`${label}: ${theme}`}>
      {getIcon()}
    </button>
  );
};

export default ThemeToggle;
