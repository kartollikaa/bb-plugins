import type { ProviderIconStyle } from "./settings.ts";

export interface Tint {
  light: string;
  dark: string;
}

/** Brand tints per agent provider id: darker on light themes, lighter on dark, so the mask keeps contrast. */
const PROVIDER_TINT: Record<string, Tint> = {
  "claude-code": { light: "#C15F3C", dark: "#E08A6D" },
  claude: { light: "#C15F3C", dark: "#E08A6D" },
  codex: { light: "#3941FF", dark: "#7A9DFF" },
  openai: { light: "#3941FF", dark: "#7A9DFF" },
  gemini: { light: "#3367D6", dark: "#8AB4F8" },
  cursor: { light: "#6E56CF", dark: "#B4A6F5" },
};

/** The icon's colour as an inline value following bb's colour scheme; null draws it in the row's full text colour. */
export function providerTintColor(providerId: string, style: ProviderIconStyle): string | null {
  const tint = style === "tint" ? PROVIDER_TINT[providerId] : undefined;
  return tint ? `light-dark(${tint.light}, ${tint.dark})` : null;
}
