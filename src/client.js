import WebSocket from "ws";
import fetch from "node-fetch";
import { handleCommand } from "./commandHandler.js";

export class Client {
  constructor(token, options = {}) {
    if (!token) throw new Error("Missing bot token.");

    this.token = token;
    this.intents = options.intents || 513; // GUILDS + GUILD_MESSAGES
    this.ws = null;
    this.sequence = null;
    this.sessionId = null;
    this.heartbeatInterval = null;
    this.commands = new Map();
    this.events = new Map();
    this.reconnectDelay = 5000;
  }

  on(event, fn) {
    if (!this.events.has(event)) this.events.set(event, []);
    this.events.get(event).push(fn);
  }

  emit(event, ...args) {
    const listeners = this.events.get(event);
    if (listeners) {
      for (const fn of listeners) {
        try {
          fn(...args);
        } catch (err) {
          console.error(`[JSCORD] ⚠️ Event '${event}' error:`, err);
        }
      }
    }
  }
  
  command(name, fn) {
    this.commands.set(name, fn);
  }

  async login() {
    try {
      const res = await fetch("https://discord.com/api/v10/gateway/bot", {
        headers: { Authorization: `Bot ${this.token}` },
      });
      const gateway = await res.json();

      if (!gateway.url) throw new Error("Failed to fetch gateway URL");

      this.ws = new WebSocket(`${gateway.url}?v=10&encoding=json`);
      this.ws.on("open", () => this._onOpen());
      this.ws.on("message", (msg) => this._onMessage(msg));
      this.ws.on("close", (code) => this._onClose(code));
      this.ws.on("error", (err) =>
        console.error("[JSCORD] ❌ WebSocket error:", err.message)
      );
    } catch (err) {
      console.error("[JSCORD] Login failed:", err.message);
      setTimeout(() => this.login(), this.reconnectDelay);
    }
  }

  _onOpen() {
    console.log("[JSCORD] ✅ Connected to Gateway");
  }

  _onMessage(message) {
    let payload;
    try {
      payload = JSON.parse(message);
    } catch {
      return;
    }

    const { t: event, s, op, d } = payload;
    if (s) this.sequence = s;

    switch (op) {
      case 10: // Hello
        this._startHeartbeat(d.heartbeat_interval);
        this._identify();
        break;
      case 11: // Heartbeat ACK
        break;
      case 1: // Heartbeat request
        this._sendHeartbeat();
        break;
    }

    if (event === "READY") {
      this.sessionId = d.session_id;
      console.log(
        `[JSCORD] 🟢 Logged in as ${d.user.username}#${d.user.discriminator}`
      );
      this.emit("ready", d.user);
    }

    if (event === "MESSAGE_CREATE") {
      this.emit("messageCreate", d);
      handleCommand(this, d);
    }
  }

  _onClose(code) {
    console.warn(`[JSCORD] ⚠️ Gateway closed (${code}). Reconnecting...`);
    clearInterval(this.heartbeatInterval);
    setTimeout(() => this.login(), this.reconnectDelay);
  }

  _identify() {
    const payload = {
      op: 2,
      d: {
        token: this.token,
        intents: this.intents,
        properties: {
          os: "linux",
          browser: "jscord",
          device: "jscord",
        },
      },
    };
    this.ws.send(JSON.stringify(payload));
    console.log("[JSCORD] 🪪 Sent IDENTIFY payload");
  }

  _startHeartbeat(interval) {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(
      () => this._sendHeartbeat(),
      interval
    );
    console.log(`[JSCORD] ❤️ Heartbeat started (${interval}ms)`);
  }

  _sendHeartbeat() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op: 1, d: this.sequence }));
    }
  }

  async sendMessage(channelId, content) {
    try {
      const body =
        typeof content === "string" ? { content } : { ...content };

      const res = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bot ${this.token}`,
          },
          body: JSON.stringify(body),
        }
      );

      const data = await res.json();
      if (!res.ok)
        console.error(`[JSCORD] ⚠️ Send failed (${res.status}):`, data);
      return data;
    } catch (err) {
      console.error("[JSCORD] Send Message Error:", err.message);
    }
  }
}
