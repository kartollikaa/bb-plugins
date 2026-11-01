export const SHELL_LANGUAGES = [
  "bash",
  "sh",
  "shell",
  "zsh",
  "console",
  "shell-session",
  "terminal",
] as const;

const PROMPT = /^\s*[$%]\s+/;

/**
 * Turns a fence body into the text to type into a shell. Transcript-style
 * blocks (`$ cmd` followed by output) keep only the prompted lines.
 */
export function commandFromFence(code: string): string {
  const lines = code.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  const prompted = lines.filter((line) => PROMPT.test(line));
  const picked = prompted.length > 0 ? prompted.map((line) => line.replace(PROMPT, "")) : lines;
  return picked.join("\n").trim();
}

export function terminalTitle(command: string): string {
  const firstLine = command.split("\n")[0] ?? "";
  return firstLine.length > 40 ? `${firstLine.slice(0, 39)}…` : firstLine || "Shell";
}

/** Bracketed paste keeps a multi-line block from running line by line mid-edit. */
export function shellInput(command: string): string {
  return command.includes("\n") ? `\x1b[200~${command}\x1b[201~\r` : `${command}\r`;
}

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
