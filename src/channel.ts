import { createChatChannelPlugin, DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/core";
import { createPatchedAccountSetupAdapter } from "openclaw/plugin-sdk/setup";
import { createTypingCallbacks } from "openclaw/plugin-sdk/channel-runtime";
import { MesiboClient } from "./client.js";

export interface MesiboAccount {
  accountId: string;
  accessToken: string;
  appId: string;
  authorizedUsers: string[];
  dmPolicy: "allowlist" | "allow_all";
  allowFrom: string[];
}

function resolveMesiboAccountRaw(cfg: any, accountId?: string | null) {
  const channelCfg = cfg?.channels?.mesibo ?? {};
  const accounts = channelCfg.accounts ?? {};
  const id = accountId ?? DEFAULT_ACCOUNT_ID;
  return accounts[id] ?? channelCfg;
}

function resolveMesiboAccount(cfg: any, accountId?: string | null): MesiboAccount {
  const raw = resolveMesiboAccountRaw(cfg, accountId);
  const id = accountId ?? DEFAULT_ACCOUNT_ID;
  const authorizedUsersRaw: string = raw.authorizedUsers ?? "";
  return {
    accountId: id,
    accessToken: raw.accessToken ?? "",
    appId: raw.appId ?? "",
    authorizedUsers: authorizedUsersRaw
      ? authorizedUsersRaw.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [],
    dmPolicy: raw.dmPolicy ?? "allowlist",
    allowFrom: raw.allowFrom ?? [],
  };
}

export const mesiboChannel = createChatChannelPlugin<MesiboAccount>({
  base: {
    id: "mesibo",
    meta: {
      id: "mesibo",
      label: "Mesibo",
      selectionLabel: "Mesibo (Real-time Messaging SDK)",
      docsPath: "/channels/mesibo",
      blurb: "Connect OpenClaw to the Mesibo real-time platform",
    },
    capabilities: {
      chatTypes: ["direct"],
    },
    reload: { configPrefixes: ["channels.mesibo"] },

    configSchema: {
      schema: {
        type: "object",
        properties: {
          accessToken: { type: "string" },
          appId: { type: "string" },
          authorizedUsers: { type: "string" },
          dmPolicy: { type: "string", enum: ["allowlist", "allow_all"] },
          allowFrom: { type: "array", items: { type: "string" } },
        },
      },
    },

    setupWizard: {
      channel: "mesibo",
      status: {
        configuredLabel: "Configured",
        unconfiguredLabel: "Not configured",
        resolveConfigured: ({ cfg }: { cfg: any }) => {
          const raw = resolveMesiboAccountRaw(cfg);
          return Boolean(raw.accessToken);
        },
      },
      credentials: [],
      textInputs: [
        {
          inputKey: "accessToken",
          message: "Mesibo User Access Token (refer to tutorial https://docs.mesibo.com/tutorials/get-started/):",
          required: true,
          currentValue: ({ cfg, accountId }: { cfg: any; accountId: string }) =>
            resolveMesiboAccountRaw(cfg, accountId).accessToken || undefined,
        },
        {
          inputKey: "url",
          message: "App ID (the same App ID used when creating the User Access Token):",
          required: true,
          currentValue: ({ cfg, accountId }: { cfg: any; accountId: string }) =>
            resolveMesiboAccountRaw(cfg, accountId).appId || undefined,
        },
        {
          inputKey: "userId",
          message: "Authorized users (comma-separated Mesibo addresses, leave empty to allow all):",
          required: false,
          currentValue: ({ cfg, accountId }: { cfg: any; accountId: string }) =>
            resolveMesiboAccountRaw(cfg, accountId).authorizedUsers || undefined,
        },
      ],
    },

    gateway: {
      startAccount: async (ctx) => {
        ctx.log?.info(`[mesibo] startAccount called for accountId=${ctx.accountId}`);

        if (!ctx.channelRuntime) {
          ctx.log?.warn?.("channelRuntime not available — skipping AI dispatch");
          return;
        }

        const { routing, reply } = ctx.channelRuntime;
        const client = new MesiboClient(ctx.account);

        ctx.log?.info(`[mesibo] connecting (appId=${ctx.account.appId})`);
        if (ctx.account.authorizedUsers.length === 0) {
          ctx.log?.info(`[mesibo] authorized users: not set — accepting messages from all users`);
        } else {
          ctx.log?.info(`[mesibo] authorized users: ${ctx.account.authorizedUsers.join(", ")}`);
        }

        await client.connect(
          async (from, text, messageId) => {
            if (ctx.account.authorizedUsers.length > 0 && !ctx.account.authorizedUsers.includes(from)) {
              ctx.log?.info?.(`[mesibo] ignoring message from unauthorized sender from=${from}`);
              return;
            }

            ctx.log?.info(`[mesibo] inbound message from=${from} id=${messageId}`);
            const sessionKey = routing.buildAgentSessionKey({
              agentId: "default",
              channel: "mesibo",
              accountId: ctx.accountId,
              peer: { kind: "direct", id: from },
            });

            const typingCallbacks = createTypingCallbacks({
              start: async () => { client.sendTyping(from); },
              onStartError: (err) => { ctx.log?.warn?.(`[mesibo] typing indicator error: ${err}`); },
            });

            await reply.dispatchReplyWithBufferedBlockDispatcher({
              ctx: {
                Body: text,
                From: from,
                Provider: "mesibo",
                SessionKey: sessionKey,
                AccountId: ctx.accountId,
                MessageSid: messageId,
                ChatType: "direct",
              },
              cfg: ctx.cfg,
              dispatcherOptions: {
                deliver: async (payload) => {
                  if (payload.text) await client.sendText(from, payload.text);
                },
                typingCallbacks,
              },
            });
          },
          (event) => {
            ctx.log?.info(`[mesibo] presence from=${event.from} kind=${event.kind}`);
          },
        );

        ctx.log?.info(`[mesibo] connected, listening for messages`);

        // Keep running until the account is stopped
        await new Promise<void>((resolve) => {
          ctx.abortSignal.addEventListener("abort", () => {
            ctx.log?.info(`[mesibo] stopping accountId=${ctx.accountId}`);
            client.disconnect();
            resolve();
          });
        });
      },
    },

    // accessToken → input.accessToken
    // appId       → input.url  (ChannelSetupInput has no appId key)
    // authorizedUsers → input.userId  (ChannelSetupInput has no authorizedUsers key)
    // Each textInput step calls applyAccountConfig with only one field at a time,
    // so buildPatch must only include fields that are actually present in the input.
    // Unconditional inclusion would overwrite previously saved fields with undefined/"".
    setup: createPatchedAccountSetupAdapter({
      channelKey: "mesibo",
      ensureChannelEnabled: true,
      ensureAccountEnabled: true,
      buildPatch: (input) => ({
        ...(input.accessToken !== undefined ? { accessToken: input.accessToken } : {}),
        ...(input.url !== undefined ? { appId: input.url } : {}),
        ...(input.userId !== undefined ? { authorizedUsers: input.userId } : {}),
      }),
    }),

    config: {
      listAccountIds: (cfg: any) => {
        const channelCfg = cfg?.channels?.mesibo ?? {};
        if (channelCfg.enabled || channelCfg.accessToken) return [DEFAULT_ACCOUNT_ID];
        return [];
      },
      resolveAccount: (cfg: any, accountId) => resolveMesiboAccount(cfg, accountId),
      inspectAccount: (cfg: any, accountId) => {
        const account = resolveMesiboAccount(cfg, accountId);
        const authSummary = account.authorizedUsers.length > 0
          ? account.authorizedUsers.join(", ")
          : "all users";
        return { summary: `App: ${account.appId} | Authorized: ${authSummary}` };
      },
      isConfigured: (account: MesiboAccount) => Boolean(account.accessToken),
    },
  },

  security: {
    dm: {
      channelKey: "mesibo",
      resolvePolicy: (account) => account.dmPolicy ?? "allowlist",
      resolveAllowFrom: (account) => account.allowFrom ?? [],
      defaultPolicy: "allowlist",
    },
  },

  pairing: {
    text: {
      idLabel: "Mesibo address (phone number or username)",
      message: "Your OpenClaw verification code is:",
      notify: async ({ target, code, account }) => {
        const client = new MesiboClient(account);
        await client.connect(async () => {});
        await client.sendText(target, `Your OpenClaw verification code is: ${code}`);
        client.disconnect();
      },
    },
  },

  threading: {
    topLevelReplyToMode: "reply",
  },

  outbound: {
    attachedResults: {
      channel: "mesibo",
      async sendText({ to, text, account }) {
        const client = new MesiboClient(account);
        await client.connect(async () => {});
        const messageId = await client.sendText(to, text);
        client.disconnect();
        return { messageId };
      },
    },
    base: {
      deliveryMode: "direct",
    },
  },
});
