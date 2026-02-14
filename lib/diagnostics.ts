// ─────────────────────────────────────────────────────────────────────────────
// telegram-approval-buttons · lib/diagnostics.ts
// Self-diagnostics: config validation, connectivity check, auto-repair
// ─────────────────────────────────────────────────────────────────────────────

import type { HealthCheck, Logger, PluginConfig, ResolvedConfig } from "../types.js";
import type { TelegramApi } from "./telegram-api.js";
import type { ApprovalStore } from "./approval-store.js";

// ─── Config resolution ─────────────────────────────────────────────────────

export interface ConfigSources {
  pluginConfig: PluginConfig;
  telegramChannelConfig: { token?: string; allowFrom?: (string | number)[] };
  env: { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_CHAT_ID?: string };
}

/**
 * Resolve plugin configuration from multiple sources with priority:
 * 1. pluginConfig (explicit config in openclaw.json)
 * 2. channels.telegram (shared Telegram config)
 * 3. Environment variables (fallback)
 *
 * Returns null with diagnostic messages if critical config is missing.
 */
export function resolveConfig(
  sources: ConfigSources,
  log: Logger,
): ResolvedConfig | null {
  const { pluginConfig, telegramChannelConfig, env } = sources;

  // ── Bot token resolution ────────────────────────────────────────────
  const botToken =
    pluginConfig.botToken ||
    telegramChannelConfig.token ||
    env.TELEGRAM_BOT_TOKEN ||
    "";

  if (!botToken) {
    log.warn(
      "[diagnostics] No bot token found. Check: " +
        "pluginConfig.botToken → channels.telegram.token → TELEGRAM_BOT_TOKEN env",
    );
  }

  // ── Chat ID resolution ──────────────────────────────────────────────
  let chatId = pluginConfig.chatId || env.TELEGRAM_CHAT_ID || "";

  // Auto-repair: extract from allowFrom if not explicitly set
  if (!chatId && Array.isArray(telegramChannelConfig.allowFrom)) {
    const first = telegramChannelConfig.allowFrom[0];
    const candidate = String(first ?? "");
    if (/^-?\d+$/.test(candidate)) {
      chatId = candidate;
      log.info(
        `[diagnostics] Auto-resolved chatId from channels.telegram.allowFrom: ${chatId}`,
      );
    }
  }

  if (!chatId) {
    log.warn(
      "[diagnostics] No chatId found. Set pluginConfig.chatId, " +
        "TELEGRAM_CHAT_ID env, or channels.telegram.allowFrom",
    );
  }

  // ── Missing critical config ─────────────────────────────────────────
  if (!botToken || !chatId) {
    log.error("[diagnostics] Plugin disabled due to missing configuration");
    return null;
  }

  // ── Optional config with defaults ───────────────────────────────────
  const staleMins =
    typeof pluginConfig.staleMins === "number" && pluginConfig.staleMins > 0
      ? pluginConfig.staleMins
      : 10;

  const verbose = pluginConfig.verbose === true;

  return { chatId, botToken, staleMins, verbose };
}

// ─── Health check ───────────────────────────────────────────────────────────

/**
 * Run a full health check: config validation + Telegram connectivity + store stats.
 */
export async function runHealthCheck(
  config: ResolvedConfig | null,
  tg: TelegramApi | null,
  store: ApprovalStore,
  startedAt: number,
): Promise<HealthCheck> {
  const health: HealthCheck = {
    ok: false,
    config: {
      chatId: !!config?.chatId,
      botToken: !!config?.botToken,
    },
    telegram: { reachable: false },
    store: {
      pending: store.pendingCount,
      totalProcessed: store.processedCount,
    },
    uptime: Date.now() - startedAt,
  };

  // Config check
  if (!config || !tg) {
    health.telegram.error = "not configured";
    return health;
  }

  // Telegram connectivity check
  const me = await tg.getMe();
  if (me.ok) {
    health.telegram.reachable = true;
    health.telegram.botUsername = me.username;
    health.ok = true;
  } else {
    health.telegram.error = me.error;
  }

  return health;
}

// ─── Startup diagnostics ────────────────────────────────────────────────────

/**
 * Log startup diagnostic summary.
 */
export function logStartupDiagnostics(
  config: ResolvedConfig,
  log: Logger,
): void {
  const maskedToken = config.botToken.slice(0, 6) + "…" + config.botToken.slice(-4);
  const maskedChatId = config.chatId.slice(0, 3) + "…" + config.chatId.slice(-2);
  log.info(
    `[diagnostics] Config OK → chatId=${maskedChatId}, ` +
      `token=${maskedToken}, staleMins=${config.staleMins}, ` +
      `verbose=${config.verbose}`,
  );
}

/**
 * Run async startup checks (non-blocking).
 * Verifies Telegram API connectivity and logs the result.
 */
export async function runStartupChecks(
  tg: TelegramApi,
  log: Logger,
): Promise<void> {
  const me = await tg.getMe();
  if (me.ok) {
    log.info(`[diagnostics] Telegram connected → @${me.username}`);
  } else {
    log.warn(
      `[diagnostics] Telegram unreachable: ${me.error}. ` +
        "Plugin will still attempt to send messages.",
    );
  }
}
