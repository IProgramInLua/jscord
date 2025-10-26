import WebSocket from "ws";
import fetch from "node-fetch";
import { handleCommand } from "./commandHandler.js";
export { Client } from "./client.js";

export class Jscord {
  constructor(token, options = {}) {
    if (!token) throw new Error("Missing bot token.");

    this.token = token;
    this.prefix = options.prefix || "!";
    this.intents = options.intents || 513;
    this.commands = new Map();
    this.ws = null;
    this.sequence = null;
    this.heartbeatInterval = null;
  }

  command(name, fn) {
    if (typeof fn !== "function") throw new Error("Command handler must be a function.");
    this.commands.set(name, fn);
  }

  async login() {
    const gatewayRes = await fetch("https://discord.com/api/v10/gateway/bot", {
      headers: { Authorization: `Bot ${this.token}` },
    });
    const gateway = await gatewayRes.json();
    if (!gateway.url) throw new Error("Failed to get Discord gateway URL.");

    this.ws = new WebSocket(`${gateway.url}/?v=10&encoding=json`);

    this.ws.on("open", () => console.log("[Jscord] Connected to Discord Gateway."));
    this.ws.on("message", (msg) => this._handleMessage(msg));
    this.ws.on("close", (code) => console.warn(`[Jscord] Disconnected (${code}). Reconnecting...`));
    this.ws.on("error", (err) => console.error("[Jscord] WebSocket Error:", err));
  }

  async sendMessage(channelId, content) {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${this.token}`,
      },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to send message: ${err}`);
    }

    return res.json();
  }

  _identify() {
    this.ws.send(
      JSON.stringify({
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
      })
    );
  }

  _heartbeat(ms) {
    clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      this.ws.send(JSON.stringify({ op: 1, d: this.sequence }));
    }, ms);
  }

  _handleMessage(raw) {
    const payload = JSON.parse(raw);
    const { t: event, op, d, s } = payload;

    if (s) this.sequence = s;

    switch (op) {
      case 10: // Hello
        this._heartbeat(d.heartbeat_interval);
        this._identify();
        break;
      case 11: // Heartbeat ACK
        break;
    }

    if (event === "MESSAGE_CREATE" && d?.content) {
      handleCommand(this, d);
    }
  }
}
