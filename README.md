# OpenClaw Mesibo Channel Plugin

Connects [OpenClaw](https://openclaw.ai) to the [Mesibo](https://mesibo.com) real-time messaging platform. Once installed, your OpenClaw AI agent can receive and reply to messages sent via Mesibo — with full support for typing indicators, read receipts, and presence events.

**Package:** `@mesibo/openclaw-channel`  
**Channel ID:** `mesibo`

Tutorial: [https://docs.mesibo.com/tutorials/openclaw-production-mobile-web-integration/](https://docs.mesibo.com/tutorials/openclaw-production-mobile-web-integration/)
---

## How it works

The plugin bridges Mesibo and OpenClaw:

1. It authenticates to Mesibo using your User Access Token.
2. Incoming messages from authorised Mesibo addresses are forwarded to your OpenClaw agent.
3. The agent's reply is sent back to the original sender via Mesibo.

## Prerequisites

- An OpenClaw instance (self-hosted or cloud).
- A [Mesibo account](https://mesibo.com) with an application and a bot/service user created.
- The **User Access Token** and **App ID** for that user, obtained from the [Mesibo console](https://console.mesibo.com).

**New to Mesibo?** Follow the official get-started tutorial to create your app and generate a token:  
https://docs.mesibo.com/tutorials/get-started/

---

## Uninstall a previous version

If you have an older version of this plugin installed, remove it before installing again.

```bash
# From your OpenClaw root directory
openclaw plugin uninstall mesibo --force
```

Then verify it is gone:

```bash
openclaw plugins list
```

`mesibo` should no longer appear in the list. You can also remove any leftover configuration:

## Install

Install the plugin from the npm registry into your OpenClaw instance:

```bash
openclaw plugin install @mesibo/openclaw-channel
```

Or, if you are working from source inside this repository:

```bash
# Install Node dependencies
npm install

# Register the local plugin with OpenClaw (path to this directory)
openclaw plugin install . -l
```

Confirm the plugin loaded:

```bash
openclaw plugins list
# mesibo   @mesibo/openclaw-channel   v1.0.12   enabled
```

---

## Configure

```bash
openclaw configure --section channels
```

The wizard will prompt you for:

| Prompt | What to enter |
|--------|--------------|
| **Mesibo User Access Token** | Token from [console.mesibo.com](https://console.mesibo.com) → your app → Users |
| **App ID** | The App ID used when creating the token (e.g. `com.example.myapp`) |
| **Authorized users** | Comma-separated Mesibo addresses that may message the bot; leave blank to allow everyone |


## Verify the connection

Restart OpenClaw after configuration, then check the logs:

```bash
openclaw gateway
# Expected log lines:
# [mesibo] startAccount called for accountId=default
# [mesibo] connecting (appId=com.example.myapp)
# [mesibo] connection status: ONLINE
# [mesibo] connected, listening for messages
```

Send a test message from a Mesibo client to the bot's address. You should see:

```
[mesibo] inbound message from=<your-address> id=<msg-id>
```

and receive a reply from your OpenClaw agent.

---

## Security

- **`accessToken` is sensitive.** Use environment variable substitution or your secrets manager rather than hard-coding it in plain text.
- Set `dmPolicy: "allowlist"` and populate `allowFrom` to restrict which Mesibo users can trigger the agent in production.
- The `authorizedUsers` field provides a secondary filter at the plugin level, independent of the OpenClaw DM policy.

---

## Tutorials and documentation

| Resource | URL |
|----------|-----|
| Mesibo get-started tutorial | https://docs.mesibo.com/tutorials/get-started/ |
| Mesibo console (tokens & apps) | https://console.mesibo.com |

---

## Development

```bash
# Run tests
npm test

# TypeScript type-check
npx tsc --noEmit
```

The plugin entry points are:

- `index.ts` — runtime channel entry (loaded by OpenClaw at startup).
- `setup-entry.ts` — setup wizard entry (loaded during `openclaw channel setup`).
- `src/channel.ts` — channel plugin definition (routing, config, pairing, outbound).
- `src/client.ts` — thin wrapper around `@mesibo/core` (connect, send, disconnect).

---

## License

See the LICENSE file in the root of this repository.
