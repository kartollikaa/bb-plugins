import type { ProviderIconStyle } from "./settings.ts";

/** Brand tints per agent provider id, darker in light mode and lighter in dark so the mask keeps contrast. */
const PROVIDER_TINT: Record<string, string> = {
  "claude-code": "text-[#C15F3C] dark:text-[#E08A6D]",
  claude: "text-[#C15F3C] dark:text-[#E08A6D]",
  codex: "text-[#0F8A6C] dark:text-[#3CC3A0]",
  openai: "text-[#0F8A6C] dark:text-[#3CC3A0]",
  gemini: "text-[#3367D6] dark:text-[#8AB4F8]",
  cursor: "text-[#6E56CF] dark:text-[#B4A6F5]",
};

/** Full contrast: the row's own text colour, for monochrome and for providers without a brand tint. */
export const PROVIDER_MONOCHROME = "text-sidebar-foreground";

export function providerTintClass(providerId: string, style: ProviderIconStyle): string {
  if (style === "monochrome") return PROVIDER_MONOCHROME;
  return PROVIDER_TINT[providerId] ?? PROVIDER_MONOCHROME;
}
