import type { Pending } from "./contract.ts";

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? value as Json : {});
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

const LIMIT = 600;
const clip = (text: string) => (text.length > LIMIT ? `${text.slice(0, LIMIT - 1)}…` : text);

/** What a pending bb interaction asks, in its own words: the question, the command, the plan, the tool. */
export function describePending(interaction: unknown): Pending | null {
  const item = obj(interaction);
  if (item.status !== undefined && item.status !== "pending") return null;
  const payload = obj(item.payload);
  if (payload.kind === "user_question") {
    const questions = arr(payload.questions).map(obj).flatMap((q) => {
      const prompt = str(q.prompt);
      if (!prompt) return [];
      const options = arr(q.options).map(obj).flatMap((o) => {
        const label = str(o.label);
        const description = str(o.description);
        return label ? [description ? `${label} — ${description}` : label] : [];
      });
      return [{ prompt, options }];
    });
    if (!questions.length) return null;
    const text = questions.map((q) => [questions.length > 1 ? `**${q.prompt}**` : null, ...q.options.map((o) => `- ${o}`)].filter(Boolean).join("\n")).join("\n\n");
    return { kind: "question", title: questions.length > 1 ? `${questions.length} questions` : questions[0]!.prompt, text: clip(text) };
  }
  if (payload.kind === "approval") {
    const subject = obj(payload.subject);
    const reason = str(payload.reason);
    const withReason = (detail: string | null) => clip([detail, reason].filter(Boolean).join("\n\n"));
    switch (subject.kind) {
      case "command": {
        const command = str(subject.command);
        const shown = command && command.length > LIMIT / 2 ? `${command.slice(0, LIMIT / 2 - 1)}…` : command;
        return { kind: "approval", title: "Approve a command", text: withReason(shown ? `\`\`\`\n${shown}\n\`\`\`${str(subject.cwd) ? `\nin \`${str(subject.cwd)}\`` : ""}` : null) };
      }
      case "file_change": {
        const scope = str(subject.writeScope);
        return { kind: "approval", title: "Approve file changes", text: withReason(scope ? `Writes to \`${scope}\`` : null) };
      }
      case "permission_grant": {
        const permissions = obj(subject.permissions);
        const files = obj(permissions.fileSystem);
        const write = arr(files.write).flatMap((p) => (str(p) ? [`\`${str(p)}\``] : []));
        const read = arr(files.read).flatMap((p) => (str(p) ? [`\`${str(p)}\``] : []));
        const network = obj(permissions.network).enabled === true;
        const parts = [write.length ? `Write: ${write.join(", ")}` : null, read.length ? `Read: ${read.join(", ")}` : null, network ? "Network access" : null];
        const tool = str(subject.toolName);
        return { kind: "approval", title: tool ? `Grant ${tool} a permission` : "Grant a permission", text: withReason(parts.filter(Boolean).join("\n") || null) };
      }
      case "plan":
        return { kind: "approval", title: "Approve a plan", text: withReason(str(subject.plan)) };
      case "tool_use": {
        const presentation = obj(subject.presentation);
        const tool = str(subject.tool);
        return { kind: "approval", title: str(presentation.title) ?? (tool ? `Approve ${tool}` : "Approve a tool call"), text: withReason(str(presentation.detail)) };
      }
    }
    return reason ? { kind: "approval", title: "Approve a request", text: clip(reason) } : null;
  }
  if (payload.kind === "plugin") {
    const presentation = obj(payload.presentation);
    const title = str(payload.title) ?? str(presentation.title);
    return title ? { kind: "approval", title, text: clip(str(presentation.detail) ?? "") } : null;
  }
  const title = str(payload.title);
  return title ? { kind: "approval", title, text: "" } : null;
}
