import { describe, it, expect, vi } from "vitest";
import { mesiboChannel } from "./channel.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeCfg = (overrides: Record<string, unknown> = {}) => ({
  channels: {
    mesibo: {
      accessToken: "test-token",
      appId: "com.test.app",
      authorizedUsers: "alice@test,bob@test",
      dmPolicy: "allowlist",
      allowFrom: ["alice@test"],
      ...overrides,
    },
  },
});

// ---------------------------------------------------------------------------
// config.listAccountIds
// ---------------------------------------------------------------------------
describe("config.listAccountIds", () => {
  it("returns DEFAULT_ACCOUNT_ID when top-level accessToken is set", () => {
    const ids = mesiboChannel.config.listAccountIds(makeCfg());
    expect(ids.length).toBe(1);
  });

  it("returns empty array when no accessToken", () => {
    const ids = mesiboChannel.config.listAccountIds({ channels: { mesibo: {} } });
    expect(ids).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// config.resolveAccount
// ---------------------------------------------------------------------------
describe("config.resolveAccount", () => {
  it("maps config fields to account", () => {
    const account = mesiboChannel.config.resolveAccount(makeCfg());
    expect(account.accessToken).toBe("test-token");
    expect(account.appId).toBe("com.test.app");
    expect(account.authorizedUsers).toEqual(["alice@test", "bob@test"]);
  });

  it("parses authorizedUsers from comma-separated string", () => {
    const account = mesiboChannel.config.resolveAccount(
      makeCfg({ authorizedUsers: " alice@test , bob@test " }),
    );
    expect(account.authorizedUsers).toEqual(["alice@test", "bob@test"]);
  });

  it("returns empty authorizedUsers when not set", () => {
    const account = mesiboChannel.config.resolveAccount(
      makeCfg({ authorizedUsers: undefined }),
    );
    expect(account.authorizedUsers).toEqual([]);
  });

  it("defaults dmPolicy to allowlist when not supplied", () => {
    const account = mesiboChannel.config.resolveAccount({ channels: { mesibo: { accessToken: "tok" } } });
    expect(account.dmPolicy).toBe("allowlist");
  });

  it("defaults allowFrom to empty array", () => {
    const account = mesiboChannel.config.resolveAccount({ channels: { mesibo: { accessToken: "tok" } } });
    expect(account.allowFrom).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// config.inspectAccount
// ---------------------------------------------------------------------------
describe("config.inspectAccount", () => {
  it("returns a summary string", () => {
    const result = mesiboChannel.config.inspectAccount?.(makeCfg());
    expect(JSON.stringify(result)).toContain("com.test.app");
    expect(JSON.stringify(result)).toContain("alice@test");
  });
});

// ---------------------------------------------------------------------------
// security.dm
// ---------------------------------------------------------------------------
describe("security.dm", () => {
  it("resolves policy from account", () => {
    const account = mesiboChannel.config.resolveAccount(makeCfg({ dmPolicy: "allow_all" }));
    expect(mesiboChannel.security?.dm?.resolvePolicy?.(account)).toBe("allow_all");
  });

  it("resolves allowFrom from account", () => {
    const account = mesiboChannel.config.resolveAccount(makeCfg({ allowFrom: ["bob@test"] }));
    expect(mesiboChannel.security?.dm?.resolveAllowFrom?.(account)).toContain("bob@test");
  });
});

// ---------------------------------------------------------------------------
// outbound.sendText (unit – MesiboClient is mocked)
// ---------------------------------------------------------------------------
const { sendTextMock, connectMock, disconnectMock } = vi.hoisted(() => ({
  sendTextMock: vi.fn().mockResolvedValue("msg-123"),
  connectMock: vi.fn().mockResolvedValue(undefined),
  disconnectMock: vi.fn(),
}));

vi.mock("./client.js", () => ({
  MesiboClient: vi.fn().mockImplementation(() => ({
    connect: connectMock,
    sendText: sendTextMock,
    disconnect: disconnectMock,
  })),
}));

describe("outbound.sendText", () => {
  it("calls MesiboClient.sendText and returns messageId", async () => {
    const account = mesiboChannel.config.resolveAccount(makeCfg());

    const result = await (mesiboChannel.outbound as any).attachedResults.sendText({
      to: "alice@test",
      text: "hello",
      account,
    });

    expect(sendTextMock).toHaveBeenCalledWith("alice@test", "hello");
    expect(result.messageId).toBe("msg-123");
    expect(disconnectMock).toHaveBeenCalled();
  });
});
