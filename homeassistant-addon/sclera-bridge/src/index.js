import fs from "fs";
import { Device } from "@sclera/sdk";
import { config, reloadConfig } from "./env.js";
import { setLogLevel, log } from "./logger.js";
import { HaClient } from "./haClient.js";
import { SyncEngine } from "./sync.js";
import { clearActionCache } from "./mapping.js";

setLogLevel(config.logLevel);

let haClient = null;
let syncEngine = null;
let hub = null;
let syncInterval = null;
let scleraReconnecting = false;

async function connectScleraHub() {
  hub = new Device({
    url: config.scleraWsUrl,
    configPath: config.scleraConfigPath,
    color: "#64748B",
  });

  hub.on("connected", () => log.info("[sclera] WebSocket connected"));
  hub.on("disconnected", onScleraDisconnected);
  hub.on("error", (err) => log.error("[sclera] Error:", err.message));
  hub.on("pairingStarted", ({ userCode }) => {
    log.info("");
    log.info("══════════════════════════════════════════════════");
    log.info(`  Sclera pairing code: ${userCode}`);
    log.info(`  Open: ${config.scleraFrontendUrl}/clients/pair?code=${userCode}`);
    log.info("══════════════════════════════════════════════════");
    log.info("");
  });

  await hub.connect();

  try {
    await hub.login();
    log.info("[sclera] Logged in with saved credentials");
  } catch {
    try {
      if (fs.existsSync(config.scleraConfigPath)) {
        fs.unlinkSync(config.scleraConfigPath);
      }
    } catch (e) {
      if (e.code !== "ENOENT") log.warn("[sclera] Could not remove stale config:", e.message);
    }

    log.info("[sclera] No saved credentials — starting pairing…");
    await hub.pair({
      deviceName: config.deviceName,
      deviceType: "hub",
      requestedPermissions: ["actions:read", "actions:exec"],
    });
    await hub.login();
    log.info("[sclera] Paired and logged in");
  }

  const user = await hub.getUser();
  log.info(`[sclera] Hub client ID: ${user.clientId} (user ${user.id})`);
}

async function onScleraDisconnected() {
  if (scleraReconnecting) return;
  scleraReconnecting = true;
  log.warn("[sclera] Disconnected — reconnecting in 5s…");
  await new Promise((r) => setTimeout(r, 5000));
  try {
    await hub.connect();
    await hub.login();
    log.info("[sclera] Reconnected");
    if (syncEngine) await syncEngine.fullSync();
  } catch (err) {
    log.error("[sclera] Reconnect failed:", err.message);
  } finally {
    scleraReconnecting = false;
  }
}

async function connectHomeAssistant() {
  haClient = new HaClient({
    wsUrl: config.haWsUrl,
    token: config.supervisorToken,
    onDisconnect: () => log.warn("[ha] Connection lost"),
    onReconnect: async () => {
      if (syncEngine) {
        try {
          await syncEngine.fullSync();
        } catch (err) {
          log.error("[ha] Resync after reconnect failed:", err.message);
        }
      }
    },
  });

  await haClient.connect();

  syncEngine = new SyncEngine({ haClient, hub });

  await haClient.subscribeEvents("state_changed", (event) => {
    syncEngine.handleStateChanged(event).catch((err) => {
      log.error("[ha] state_changed handler error:", err.message);
    });
  });

  for (const eventType of [
    "entity_registry_updated",
    "device_registry_updated",
    "area_registry_updated",
  ]) {
    await haClient.subscribeEvents(eventType, () => {
      syncEngine.handleRegistryUpdate(eventType);
    });
  }

  await syncEngine.fullSync();
}

function startPeriodicSync() {
  if (syncInterval) clearInterval(syncInterval);
  const ms = config.syncIntervalSeconds * 1000;
  syncInterval = setInterval(async () => {
    reloadConfig();
    setLogLevel(config.logLevel);
    if (!syncEngine) return;
    try {
      await syncEngine.fullSync();
    } catch (err) {
      log.error("[sync] Periodic sync failed:", err.message);
    }
  }, ms);
  log.info(`[sync] Periodic resync every ${config.syncIntervalSeconds}s`);
}

async function shutdown(signal) {
  log.info(`Received ${signal}, shutting down…`);
  if (syncInterval) clearInterval(syncInterval);
  if (haClient) await haClient.stop();
  clearActionCache();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

async function main() {
  log.info("Sclera Bridge starting…");
  log.info(`Sclera WS: ${config.scleraWsUrl}`);
  log.info(`HA WS: ${config.haWsUrl}`);

  if (!config.supervisorToken) {
    log.error("SUPERVISOR_TOKEN is not set. Enable homeassistant_api in config.yaml.");
    process.exit(1);
  }

  await connectScleraHub();
  await connectHomeAssistant();
  startPeriodicSync();

  log.info("[hub] Bridge running. Subdevices are available in Sclera.");
}

main().catch((err) => {
  log.error("Fatal error:", err);
  process.exit(1);
});
