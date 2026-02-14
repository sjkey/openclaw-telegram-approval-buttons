// ─────────────────────────────────────────────────────────────────────────────
// telegram-approval-buttons · lib/approval-parser.ts
// Parse OpenClaw's plain-text exec approval format into structured data
// ─────────────────────────────────────────────────────────────────────────────

import type { ApprovalAction, ApprovalInfo, ApprovalResolution, SentApproval } from "../types.js";

// ─── Regex patterns (compiled once) ─────────────────────────────────────────

const RE_APPROVAL_MARKER = /Exec approval required/i;
const RE_ID = /ID:\s*([a-f0-9-]+)/i;
const RE_COMMAND_BLOCK = /Command:\s*`{0,3}\n?(.+?)\n?`{0,3}(?:\n|$)/is;
const RE_COMMAND_INLINE = /Command:\s*(.+)/i;
const RE_CWD = /CWD:\s*(.+)/i;
const RE_HOST = /Host:\s*(.+)/i;
const RE_AGENT = /Agent:\s*(.+)/i;
const RE_SECURITY = /Security:\s*(.+)/i;
const RE_ASK = /Ask:\s*(.+)/i;
const RE_EXPIRES = /Expires in:\s*(.+)/i;

/**
 * Parse OpenClaw's plain-text approval message into an ApprovalInfo object.
 *
 * Returns null if the text doesn't match the approval format.
 * This function is intentionally lenient — it extracts what it can and
 * falls back to sensible defaults for missing fields.
 */
export function parseApprovalText(text: string): ApprovalInfo | null {
  if (!RE_APPROVAL_MARKER.test(text)) return null;

  const id = text.match(RE_ID)?.[1]?.trim();
  if (!id) return null;

  // Try block format first (```command```), then inline
  let command = text.match(RE_COMMAND_BLOCK)?.[1]?.trim();
  if (!command) command = text.match(RE_COMMAND_INLINE)?.[1]?.trim() ?? "unknown";

  return {
    id,
    command,
    cwd: text.match(RE_CWD)?.[1]?.trim() ?? "unknown",
    host: text.match(RE_HOST)?.[1]?.trim() ?? "gateway",
    agent: text.match(RE_AGENT)?.[1]?.trim() ?? "main",
    security: text.match(RE_SECURITY)?.[1]?.trim() ?? "allowlist",
    ask: text.match(RE_ASK)?.[1]?.trim() ?? "on-miss",
    expires: text.match(RE_EXPIRES)?.[1]?.trim() ?? "120s",
  };
}

/**
 * Detect if an outgoing message indicates an approval was resolved.
 *
 * Checks whether the message text references any pending approval ID
 * (full UUID or first 8 chars) and attempts to determine the action.
 */
export function detectApprovalResult(
  text: string,
  pending: ReadonlyMap<string, SentApproval>,
): ApprovalResolution | null {
  for (const [id] of pending) {
    const shortId = id.slice(0, 8);
    if (!text.includes(id) && !text.includes(shortId)) continue;

    const action = inferAction(text);
    return { id, action };
  }
  return null;
}

// ─── Internal ───────────────────────────────────────────────────────────────

/**
 * Infer the approval action from message text.
 * Order matters: check most specific patterns first.
 */
function inferAction(text: string): ApprovalAction {
  const lower = text.toLowerCase();
  if (lower.includes("allow-always") || lower.includes("always allow")) return "allow-always";
  if (lower.includes("deny") || lower.includes("denied") || lower.includes("rejected")) return "deny";
  if (lower.includes("allow-once") || lower.includes("allowed")) return "allow-once";
  if (lower.includes("approved")) return "allow-once";
  // Default when we see the ID but can't determine action
  return "allow-once";
}
