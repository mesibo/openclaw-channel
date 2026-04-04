/**
 * Thin wrapper around the Mesibo Node.js SDK (@mesibo/core).
 */

import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const { Mesibo } = _require("@mesibo/core") as typeof import("@mesibo/core");

export interface MesiboAccount {
  accessToken: string;
  appId: string;
  botAddress: string;
}

export type InboundHandler = (from: string, text: string, messageId: string) => Promise<void>;

export type PresenceEvent =
  | { kind: "typing"; from: string }
  | { kind: "stoppedTyping"; from: string }
  | { kind: "online"; from: string }
  | { kind: "offline"; from: string }
  | { kind: "joined"; from: string }
  | { kind: "left"; from: string };

export type PresenceHandler = (event: PresenceEvent) => void;

export class MesiboClient {
  private api: any;
  private ready = false;
  private pendingReady: Array<() => void> = [];

  constructor(private readonly account: MesiboAccount) {}

  /** Connect to Mesibo and start listening for messages and presence. */
  async connect(onMessage: InboundHandler, onPresence?: PresenceHandler): Promise<void> {
    this.api = Mesibo.getInstance();
    if (this.account.appId) this.api.setAppName(this.account.appId);
    this.api.setCredentials(this.account.accessToken, 0 /* uid, 0 = auto */);

    const listener = new MesiboListener(this, onMessage, onPresence);
    this.api.setListener(listener);

    this.api.start();

    // Wait until the connection is established (status 1 = online)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Mesibo connection timed out")), 15_000);
      this.pendingReady.push(() => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  /** Called by the listener when the connection comes online. */
  _onOnline(): void {
    this.ready = true;
    for (const cb of this.pendingReady) cb();
    this.pendingReady = [];
  }

  /**
   * Send a plain-text message to a Mesibo address.
   * Returns the platform message ID assigned by Mesibo.
   */
  async sendText(to: string, text: string): Promise<string> {
    if (!this.ready) throw new Error("Mesibo client is not connected");

    const profile = this.api.getProfile(to, 0);
    const msg = profile.newMessage();
    msg.message = text;
    msg.send();

    // Mesibo assigns the ID synchronously on send
    return String(msg.getMessageId?.() ?? msg.id ?? "");
  }

  /** Send a read receipt for an incoming message. */
  sendReadReceipt(to: string, messageId: string): void {
    if (!this.ready) return;
    this.api.sendReadReceipt(to, 0, messageId);
  }

  /** Send a typing indicator to a Mesibo address. Mesibo clears it automatically. */
  sendTyping(to: string): void {
    if (!this.ready) return;
      
    console.debug(`[mesibo] sendTyping: sending Typing to=${to}`);
    if (!to) {
      console.debug("[mesibo] sendTyping: skipped — to is empty");
      return;
    }
    const profile = this.api.getProfile(to, 0);
    if (!profile) {
      console.debug(`[mesibo] sendTyping: getProfile returned null for to=${to}`);
      return;
    }
    profile.sendTyping();
  }

  /** Disconnect the Mesibo session. */
  disconnect(): void {
    this.api?.stop?.();
    this.ready = false;
  }
}

// ---------------------------------------------------------------------------
// Internal listener – translates Mesibo callbacks into plugin-friendly calls
// ---------------------------------------------------------------------------

class MesiboListener {
  constructor(
    private readonly client: MesiboClient,
    private readonly onMessage: InboundHandler,
    private readonly onPresence?: PresenceHandler,
  ) {}

  Mesibo_onConnectionStatus(status: number): void {
    const labels: Record<number, string> = {
      1: "ONLINE", 2: "OFFLINE", 4: "AUTHFAIL",
      5: "STOPPED", 6: "CONNECTING", 7: "CONNECTFAILURE", 8: "NONETWORK",
    };
    console.log(`[mesibo] connection status: ${labels[status] ?? status}`);
    if (status === 1) {
      this.client._onOnline();
    }
  }

  Mesibo_onMessage(m: any): void {
    if (!m || !m.message) return;
    // Skip presence notifications and outgoing messages
    if (m.isPresence?.()) return;
    if (!m.isIncoming?.()) return;

    const sender = m.getSenderProfile?.();
    const from: string = sender ? sender.getAddress() : (m.peer ?? "");
    const text: string = m.message;
    const messageId: string = String(m.getMessageId?.() ?? m.id ?? "");

    this.client.sendReadReceipt(from, messageId);

    // Fire-and-forget; errors are logged but must not crash the listener
    this.onMessage(from, text, messageId).catch((err: unknown) => {
      console.error("[mesibo-plugin] inbound handler error:", err);
    });
  }

  Mesibo_onMessageUpdate(_m: any): void {
    // Required callback – not used by the channel plugin
  }

  Mesibo_onMessageStatus(_m: any): void {
    // Delivery receipts – not needed for the channel plugin
  }

  Mesibo_onPresence(p: any): void {
    if (!this.onPresence) return;
    const sender = p.getSenderProfile?.();
    const from: string = sender ? sender.getAddress() : (p.peer ?? "");
    if (!from) return;

    if (p.isTyping?.())              this.onPresence({ kind: "typing", from });
    else if (p.isTypingCleared?.())  this.onPresence({ kind: "stoppedTyping", from });
    else if (p.hasJoined?.())        this.onPresence({ kind: "joined", from });
    else if (p.hasLeft?.())          this.onPresence({ kind: "left", from });
    else if (p.isOnline?.())         this.onPresence({ kind: "online", from });
    else if (p.isOffline?.())        this.onPresence({ kind: "offline", from });
  }
}
