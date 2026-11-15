export type ThemePreference = "system" | "light" | "dark";

export function resolveDark(pref: ThemePreference): boolean {
  if (pref === "dark") return true;
  if (pref === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(pref: ThemePreference) {
  document.documentElement.classList.toggle("dark", resolveDark(pref));
}
