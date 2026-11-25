"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { FiMoon, FiSun } from "react-icons/fi";

const THEME_STORAGE_KEY = "packstudio-theme";
type Theme = "light" | "dark";
const THEME_CHANGE_EVENT = "packstudio-theme-change";

function isTheme(value: string | null | undefined): value is Theme {
  return value === "light" || value === "dark";
}

function getThemeSnapshot(): Theme {
  const currentTheme = document.documentElement.dataset.theme;
  return isTheme(currentTheme) ? currentTheme : "dark";
}

function getServerThemeSnapshot(): Theme {
  return "dark";
}

function broadcastTheme(theme: Theme) {
  document.querySelectorAll("iframe").forEach((frame) => {
    frame.contentWindow?.postMessage(
      { type: "packstudio:theme", theme },
      window.location.origin,
    );
  });
}

function subscribeToTheme(onChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY || !isTheme(event.newValue)) return;
    document.documentElement.dataset.theme = event.newValue;
    document.documentElement.style.colorScheme = event.newValue;
    broadcastTheme(event.newValue);
    onChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  };
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    broadcastTheme(nextTheme);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

  return (
    <>
      {children}
      <button
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        className="theme-toggle"
        onClick={toggleTheme}
        title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        type="button"
      >
        {theme === "dark" ? <FiSun aria-hidden="true" /> : <FiMoon aria-hidden="true" />}
      </button>
    </>
  );
}
