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
 * Turns a fence body into the text to run. Transcript-style blocks
 * (`$ cmd` followed by output) keep only the prompted lines.
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

/** FNV-1a; distinguishes fences that share a message id and per-language index. */
export function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export const EXIT_OSC = 777;
const OSC_PREFIX = "bb-inline-terminal;";

export type WrapperSignal = { kind: "start" } | { kind: "exit"; code: number };

/** Decodes this run's OSC 777 markers; output that merely prints a marker lacks the nonce. */
export function parseWrapperOsc(data: string, nonce: string): WrapperSignal | null {
  const prefix = `${OSC_PREFIX}${nonce};`;
  if (!data.startsWith(prefix)) return null;
  const rest = data.slice(prefix.length);
  if (rest === "start") return { kind: "start" };
  const match = /^exit;(\d+)$/.exec(rest);
  return match === null ? null : { kind: "exit", code: Number(match[1]) };
}

export function newNonce(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/** Sourced inside the interactive shell, so `cd`, venvs, aliases and history stay in the session. */
const RUN_SH = String.raw`__it_osc() { printf '\033]777;bb-inline-terminal;%s;%s\007' "$INLINE_TERMINAL_NONCE" "$1"; }
__it_finish() {
  __it_osc "exit;$1"
  trap - INT EXIT
  rm -rf "$INLINE_TERMINAL_DIR"
  if [ -n "$ZSH_VERSION" ]; then print -s -- "$INLINE_TERMINAL_CMD"; elif [ -n "$BASH_VERSION" ]; then history -s -- "$INLINE_TERMINAL_CMD"; fi
  [ "$ENV" = "$INLINE_TERMINAL_DIR/run.sh" ] && unset ENV
  unset INLINE_TERMINAL_CMD INLINE_TERMINAL_NONCE INLINE_TERMINAL_DIR INLINE_TERMINAL_USER_ZDOTDIR
}
printf '\033[2m$ %s\033[0m\n' "$INLINE_TERMINAL_CMD"
__it_osc start
trap '__it_finish "$?"' EXIT
trap '__it_finish 130; unset -f __it_osc __it_finish; return 130' INT
eval "$INLINE_TERMINAL_CMD"
__it_finish "$?"
unset -f __it_osc __it_finish`;

/** zsh reads every startup file from ZDOTDIR; each shim loads the user's own file of that name. */
const zshShim = (file: string) => String.raw`ZDOTDIR="$INLINE_TERMINAL_USER_ZDOTDIR"
[ -f "$ZDOTDIR/${file}" ] && . "$ZDOTDIR/${file}"
if [ -n "$ZDOTDIR" ]; then INLINE_TERMINAL_USER_ZDOTDIR="$ZDOTDIR"; else INLINE_TERMINAL_USER_ZDOTDIR="$HOME"; fi
ZDOTDIR="$INLINE_TERMINAL_DIR"`;

const ZSHRC = String.raw`ZDOTDIR="$INLINE_TERMINAL_USER_ZDOTDIR"
[ -f "$ZDOTDIR/.zshrc" ] && . "$ZDOTDIR/.zshrc"
[ "$ZDOTDIR" = "$HOME" ] && unset ZDOTDIR
. "$INLINE_TERMINAL_DIR/run.sh"`;

const BASHRC = String.raw`[ -f /etc/profile ] && . /etc/profile
if [ -f "$HOME/.bash_profile" ]; then . "$HOME/.bash_profile"
elif [ -f "$HOME/.bash_login" ]; then . "$HOME/.bash_login"
elif [ -f "$HOME/.profile" ]; then . "$HOME/.profile"
elif [ -f "$HOME/.bashrc" ]; then . "$HOME/.bashrc"
fi
. "$INLINE_TERMINAL_DIR/run.sh"`;

const LAUNCH = String.raw`t="$TMPDIR"; [ -n "$t" ] || t=/tmp
d=$(mktemp -d "$t/inline-terminal.XXXXXX") || exit 1
export INLINE_TERMINAL_CMD="$1" INLINE_TERMINAL_NONCE="$2" INLINE_TERMINAL_DIR="$d"
cat > "$d/run.sh" <<'IT_EOF'
${RUN_SH}
IT_EOF
case "$SHELL" in
*/zsh)
  cat > "$d/.zshenv" <<'IT_EOF'
${zshShim(".zshenv")}
IT_EOF
  cat > "$d/.zprofile" <<'IT_EOF'
${zshShim(".zprofile")}
IT_EOF
  cat > "$d/.zshrc" <<'IT_EOF'
${ZSHRC}
IT_EOF
  if [ -n "$ZDOTDIR" ]; then INLINE_TERMINAL_USER_ZDOTDIR="$ZDOTDIR"; else INLINE_TERMINAL_USER_ZDOTDIR="$HOME"; fi
  export INLINE_TERMINAL_USER_ZDOTDIR ZDOTDIR="$d"
  exec "$SHELL" -il ;;
*/bash)
  cat > "$d/bashrc" <<'IT_EOF'
${BASHRC}
IT_EOF
  exec "$SHELL" --rcfile "$d/bashrc" -i ;;
*)
  export ENV="$d/run.sh"
  exec /bin/sh -i ;;
esac`;

/** The command and nonce travel as argv, never spliced into the script, so no quoting can break out. */
export function wrapperArgv(command: string, nonce: string): string[] {
  return ["/bin/sh", "-c", LAUNCH, "inline-terminal", command, nonce];
}

const MAX_OUTPUT_CHARS = 20_000;

/** A fence longer than any backtick run inside, so quoted output can never close it early. */
function fenced(body: string, info = ""): string {
  const longestRun = Math.max(0, ...(body.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}${info}\n${body}\n${fence}`;
}

/** What gets posted to the thread: a short visible line plus the full output for the agent only. */
export function resultMessage(command: string, exitCode: number, output: string) {
  const trimmed = output.replace(/\s+$/, "");
  const clipped =
    trimmed.length > MAX_OUTPUT_CHARS
      ? `[… first ${trimmed.length - MAX_OUTPUT_CHARS} chars omitted]\n${trimmed.slice(-MAX_OUTPUT_CHARS)}`
      : trimmed;
  const firstLine = command.split("\n")[0] ?? "";
  const shown = command.includes("\n") ? `${firstLine} …` : firstLine;
  return {
    visible: `Ran \`${shown.replace(/`/g, "'")}\` in the inline terminal — exit ${exitCode}.`,
    agentOnly: [
      "Output of the command the user just ran from your shell code block (inline terminal, this thread's workspace).",
      "Command:",
      fenced(command, "sh"),
      `Exit code: ${exitCode}`,
      "Output:",
      fenced(clipped === "" ? "(no output)" : clipped),
    ].join("\n"),
  };
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
