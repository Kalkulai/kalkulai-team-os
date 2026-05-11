'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

/**
 * Dark is the default. We toggle the `light` class on <html>.
 * The inline script in layout.tsx sets the initial .light class
 * before hydration so there is no flash on reload.
 */
export function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read DOM-applied theme into local state on mount
    setLight(document.documentElement.classList.contains('light'));
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle('light', next);
    localStorage.setItem('theme', next ? 'light' : 'dark');
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={light ? 'Dark Mode' : 'Light Mode'}
      className="grid size-[34px] place-items-center rounded-[10px] border border-[var(--line-1)] bg-white/[0.04] text-[var(--ink-2)] transition-colors hover:bg-white/[0.08] hover:text-[var(--ink-1)]"
    >
      {light ? <Moon size={15} aria-hidden /> : <Sun size={15} aria-hidden />}
    </button>
  );
}
