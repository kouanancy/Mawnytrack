export type Theme = "auto" | "light" | "dark";
export const THEMES: Theme[] = ["auto", "light", "dark"];
/** Copie du thème enregistré en base, lue par la mise en page racine pour appliquer le thème sans flash. */
export const THEME_COOKIE = "mt-theme";
export const isTheme = (v: unknown): v is Theme => typeof v === "string" && (THEMES as string[]).includes(v);
