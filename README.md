# telegram-approval-buttons

OpenClaw plugin that adds **inline keyboard buttons** to exec approval messages in Telegram.  
Instead of typing `/approve <id> allow-once`, just tap a button.

## Features

- **One-tap approvals** — ✅ Allow Once · 🔏 Always · ❌ Deny
- **Auto-resolve** — edits the message after a decision is made (removes buttons, shows result)
- **Expiry handling** — stale approvals are automatically cleaned up and marked as expired
- **Self-diagnostics** — `/approvalstatus` command checks config, Telegram connectivity, and stats
- **Graceful fallback** — if button delivery fails, the original plain-text message goes through
- **Zero dependencies** — uses only Node.js built-in `fetch`

## How it works

```
┌─────────────┐    message_sending     ┌──────────────────┐
│  OpenClaw   │ ─── approval text ──→  │     Plugin        │
│  Gateway    │                        │                   │
│             │    cancel original      │  1. Parse text    │
│             │ ←──────────────────── │  2. Send buttons  │
└─────────────┘                        │  3. Track pending │
                                       └────────┬─────────┘
                                                │
                                    Telegram Bot API
                                                │
                                       ┌────────▼─────────┐
                                       │   Telegram Chat   │
                                       │                   │
                                       │  🔐 Exec Approval │
                                       │  [✅ Allow] [🔏]  │
                                       │  [❌ Deny]        │
                                       └──────────────────┘
```

When you tap a button, OpenClaw's Telegram integration converts the `callback_data` 
(`/approve <id> <action>`) into a synthetic text message — no webhook needed.

## Installation

### From extensions directory (local)

```bash
# Copy the plugin into your extensions directory
cp -r telegram-approval-buttons ~/.openclaw/extensions/

# Restart the gateway
openclaw gateway restart
```

### From npm (when published)

```bash
openclaw plugins install @openclaw-community/telegram-approval-buttons
openclaw gateway restart
```

## Configuration

The plugin auto-detects most settings from your existing Telegram channel config.

### Minimal (zero-config if Telegram is already set up)

```jsonc
{
  "plugins": {
    "entries": {
      "telegram-approval-buttons": {
        "enabled": true,
        "config": {
          "chatId": "123456789"  // Your Telegram user/chat ID
        }
      }
    }
  }
}
```

### Full options

```jsonc
{
  "plugins": {
    "entries": {
      "telegram-approval-buttons": {
        "enabled": true,
        "config": {
          // Required: Telegram chat ID for approval messages
          "chatId": "123456789",
          
          // Optional: bot token (auto-detected from channels.telegram.token)
          "botToken": "123:ABC...",
          
          // Optional: minutes before stale approvals are cleaned up (default: 10)
          "staleMins": 10,
          
          // Optional: verbose diagnostic logging (default: false)
          "verbose": false
        }
      }
    }
  }
}
```

### Config resolution order

| Setting    | Priority 1 (explicit)       | Priority 2 (shared config)         | Priority 3 (env)          |
|------------|-----------------------------|------------------------------------|---------------------------|
| `botToken` | `pluginConfig.botToken`     | `channels.telegram.token`          | `TELEGRAM_BOT_TOKEN`      |
| `chatId`   | `pluginConfig.chatId`       | `channels.telegram.allowFrom[0]`   | `TELEGRAM_CHAT_ID`        |

## Commands

| Command            | Description                                  | Auth required |
|--------------------|--------------------------------------------- |---------------|
| `/approvalstatus`  | Show plugin health, config, and pending stats | Yes           |

## Architecture

```
telegram-approval-buttons/
├── index.ts                  # Entry point — orchestration only
├── types.ts                  # Shared TypeScript interfaces
├── lib/
│   ├── telegram-api.ts       # Telegram Bot API client (isolated)
│   ├── approval-parser.ts    # Parse OpenClaw approval text format
│   ├── message-formatter.ts  # HTML formatting for Telegram messages
│   ├── approval-store.ts     # In-memory pending approval tracker
│   └── diagnostics.ts        # Config resolution, health checks
├── openclaw.plugin.json      # Plugin manifest
├── package.json              # npm package metadata
└── README.md
```

Each module has a **single responsibility** and can be modified independently:

- **telegram-api.ts** — swap transport, add retry logic, or mock for testing
- **approval-parser.ts** — adapt if OpenClaw changes its approval text format
- **message-formatter.ts** — customize the look and feel of messages
- **approval-store.ts** — replace with persistent storage if needed
- **diagnostics.ts** — extend health checks or add auto-repair logic

## Diagnostics

Send `/approvalstatus` in Telegram to get a health report:

```
🟢 Approval Buttons Status

Config: chatId=✓ · token=✓
Telegram: ✓ connected (@your_bot)
Pending: 0 · Processed: 5
Uptime: 42m
```

## Compatibility

- OpenClaw ≥ 2026.2.9
- Node.js ≥ 22 (uses built-in `fetch`)
- Telegram Bot API (no webhook configuration needed)

## License

MIT
