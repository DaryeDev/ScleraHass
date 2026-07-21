import fs from "fs";

const OPTIONS_PATH = "/data/options.json";

function readOptionsFile() {
  try {
    const raw = fs.readFileSync(OPTIONS_PATH, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      return {
        sclera_ws_url: process.env.SCLERA_WS_URL || "ws://localhost:3000/api/ws",
        sclera_frontend_url: process.env.SCLERA_FRONTEND_URL || "http://localhost:5173",
        device_name: process.env.DEVICE_NAME || "Home Assistant",
        include_domains: [],
        exclude_domains: [],
        exclude_entities: [],
        sync_interval_seconds: 300,
        log_level: process.env.LOG_LEVEL || "info",
      };
    }
    throw new Error(`Cannot read ${OPTIONS_PATH}: ${err.message}`);
  }
}

const options = readOptionsFile();

export const config = {
  scleraWsUrl: options.sclera_ws_url,
  scleraFrontendUrl: options.sclera_frontend_url.replace(/\/+$/, ""),
  deviceName: options.device_name || "Home Assistant",
  includeDomains: new Set(
    (options.include_domains || []).map((d) => String(d).trim().toLowerCase()).filter(Boolean),
  ),
  excludeDomains: new Set(
    (options.exclude_domains || []).map((d) => String(d).trim().toLowerCase()).filter(Boolean),
  ),
  excludeEntities: new Set(
    (options.exclude_entities || []).map((e) => String(e).trim()).filter(Boolean),
  ),
  syncIntervalSeconds: Number(options.sync_interval_seconds) || 300,
  logLevel: options.log_level || "info",
  supervisorToken: process.env.SUPERVISOR_TOKEN || "",
  haWsUrl: process.env.HA_WS_URL || "ws://supervisor/core/websocket",
  scleraConfigPath: "/data/sclera_client_config.json",
};

export function reloadConfig() {
  const fresh = readOptionsFile();
  config.scleraWsUrl = fresh.sclera_ws_url;
  config.scleraFrontendUrl = fresh.sclera_frontend_url.replace(/\/+$/, "");
  config.deviceName = fresh.device_name || "Home Assistant";
  config.includeDomains = new Set(
    (fresh.include_domains || []).map((d) => String(d).trim().toLowerCase()).filter(Boolean),
  );
  config.excludeDomains = new Set(
    (fresh.exclude_domains || []).map((d) => String(d).trim().toLowerCase()).filter(Boolean),
  );
  config.excludeEntities = new Set(
    (fresh.exclude_entities || []).map((e) => String(e).trim()).filter(Boolean),
  );
  config.syncIntervalSeconds = Number(fresh.sync_interval_seconds) || 300;
  config.logLevel = fresh.log_level || "info";
}
