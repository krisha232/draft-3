import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, isDark } from '../lib/theme';

// Switches between light and dark mode and remembers the choice on this device.
export default function ThemeToggle({ withLabel = false }) {
  const [dark, setDark] = useState(isDark);
  const toggle = () => {
    const next = !dark;
    applyTheme(next ? 'dark' : 'light');
    setDark(next);
  };
  const label = dark ? 'Light mode' : 'Dark mode';
  if (withLabel) {
    return (
      <button className="btn ghost" onClick={toggle}>
        {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />} {label}
      </button>
    );
  }
  return (
    <button className="icon-btn" onClick={toggle} title={label} aria-label={label}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
