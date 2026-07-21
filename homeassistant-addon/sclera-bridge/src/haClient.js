import WebSocket from "ws";
import { log } from "./logger.js";

const EXTERNAL_ID_RE = /^[a-zA-Z0-9._-]{1,128}$/;

export class HaClient {
  #wsUrl;
  #token;
  #ws = null;
  #msgId = 1;
  #pending = new Map();
  #eventHandlers = new Map();
  #connected = false;
  #reconnectTimer = null;
  #shouldRun = false;
  #onDisconnect = null;
  #onReconnect = null;

  constructor({ wsUrl, token, onDisconnect, onReconnect }) {
    this.#wsUrl = wsUrl;
    this.#token = token;
    this.#onDisconnect = onDisconnect;
    this.#onReconnect = onReconnect;
  }

  get connected() {
    return this.#connected;
  }

  async connect() {
    this.#shouldRun = true;
    await this.#openSocket();
  }

  async stop() {
    this.#shouldRun = false;
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    if (this.#ws) {
      this.#ws.removeAllListeners();
      this.#ws.close();
      this.#ws = null;
    }
    this.#connected = false;
    for (const [, { reject }] of this.#pending) {
      reject(new Error("HA client stopped"));
    }
    this.#pending.clear();
  }

  async #openSocket() {
    if (!this.#token) {
      throw new Error("SUPERVISOR_TOKEN is required for Home Assistant API access");
    }

    return new Promise((resolve, reject) => {
      log.info(`Connecting to Home Assistant at ${this.#wsUrl}`);
      const ws = new WebSocket(this.#wsUrl);
      this.#ws = ws;
      let authResolved = false;

      ws.on("message", (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          log.warn("Invalid JSON from HA:", data.toString().slice(0, 200));
          return;
        }

        if (msg.type === "auth_required") {
          ws.send(JSON.stringify({ type: "auth", access_token: this.#token }));
          return;
        }

        if (msg.type === "auth_invalid") {
          const err = new Error(`HA auth failed: ${msg.message || "invalid token"}`);
          if (!authResolved) reject(err);
          else this.#scheduleReconnect();
          return;
        }

        if (msg.type === "auth_ok") {
          authResolved = true;
          this.#connected = true;
          log.info("Authenticated with Home Assistant");
          resolve();
          return;
        }

        if (msg.type === "event") {
          const handlers = this.#eventHandlers.get(msg.event?.event_type);
          if (handlers) {
            for (const handler of handlers) {
              try {
                handler(msg.event);
              } catch (err) {
                log.error("HA event handler error:", err.message);
              }
            }
          }
          return;
        }

        if (msg.id != null && this.#pending.has(msg.id)) {
          const { resolve: res, reject: rej } = this.#pending.get(msg.id);
          this.#pending.delete(msg.id);
          if (msg.success === false) {
            rej(new Error(msg.error?.message || JSON.stringify(msg.error) || "HA request failed"));
          } else {
            res(msg.result);
          }
        }
      });

      ws.on("error", (err) => {
        log.error("HA WebSocket error:", err.message);
        if (!authResolved) reject(err);
      });

      ws.on("close", () => {
        this.#connected = false;
        log.warn("Home Assistant WebSocket closed");
        for (const [, { reject: rej }] of this.#pending) {
          rej(new Error("HA WebSocket closed"));
        }
        this.#pending.clear();
        this.#onDisconnect?.();
        if (this.#shouldRun) this.#scheduleReconnect();
      });
    });
  }

  #scheduleReconnect() {
    if (this.#reconnectTimer || !this.#shouldRun) return;
    this.#reconnectTimer = setTimeout(async () => {
      this.#reconnectTimer = null;
      try {
        await this.#openSocket();
        await this.#resubscribeEvents();
        log.info("Reconnected to Home Assistant");
        this.#onReconnect?.();
      } catch (err) {
        log.error("HA reconnect failed:", err.message);
        this.#scheduleReconnect();
      }
    }, 5000);
  }

  async #resubscribeEvents() {
    for (const eventType of this.#eventHandlers.keys()) {
      await this.subscribeEvents(eventType);
    }
  }

  #send(type, extra = {}) {
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("HA WebSocket not connected"));
    }
    const id = this.#msgId++;
    const payload = { id, type, ...extra };
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#ws.send(JSON.stringify(payload));
    });
  }

  async getStates() {
    return this.#send("get_states");
  }

  async getEntityRegistry() {
    return this.#send("config/entity_registry/list");
  }

  async getDeviceRegistry() {
    return this.#send("config/device_registry/list");
  }

  async getAreaRegistry() {
    return this.#send("config/area_registry/list");
  }

  async callService(domain, service, target = {}, serviceData = {}) {
    const msg = { domain, service };
    if (Object.keys(target).length > 0) msg.target = target;
    if (Object.keys(serviceData).length > 0) msg.service_data = serviceData;
    return this.#send("call_service", msg);
  }

  async subscribeEvents(eventType, handler) {
    if (!this.#eventHandlers.has(eventType)) {
      this.#eventHandlers.set(eventType, new Set());
    }
    if (handler) {
      this.#eventHandlers.get(eventType).add(handler);
    }
    if (this.#connected) {
      await this.#send("subscribe_events", { event_type: eventType });
      log.debug(`Subscribed to HA event: ${eventType}`);
    }
  }

  offEvent(eventType, handler) {
    const handlers = this.#eventHandlers.get(eventType);
    if (handlers) handlers.delete(handler);
  }

  static isValidExternalId(entityId) {
    return EXTERNAL_ID_RE.test(entityId);
  }
}

export default HaClient;
