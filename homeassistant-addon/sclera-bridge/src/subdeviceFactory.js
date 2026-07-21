import { Subdevice } from "@sclera/sdk";
import { getActionsForDomain } from "./mapping.js";
import { HaClient } from "./haClient.js";
import { config } from "./env.js";

/**
 * @typedef {object} HaEntityContext
 * @property {object} entity - entity registry entry or synthetic from state
 * @property {object|null} device
 * @property {object|null} area
 * @property {object|null} state
 */

/**
 * @param {string} entityId
 */
export function parseDomain(entityId) {
  const dot = entityId.indexOf(".");
  return dot === -1 ? entityId : entityId.slice(0, dot);
}

/**
 * @param {string} entityId
 * @param {import('./env.js').config} cfg
 */
export function shouldIncludeEntity(entityId, cfg = config) {
  if (cfg.excludeEntities.has(entityId)) return false;
  const domain = parseDomain(entityId);
  if (cfg.includeDomains.size > 0 && !cfg.includeDomains.has(domain)) return false;
  if (cfg.excludeDomains.has(domain)) return false;
  if (!HaClient.isValidExternalId(entityId)) return false;
  return true;
}

/**
 * @param {HaEntityContext} ctx
 */
export function buildSubdeviceName({ entity, device, area, state }) {
  const friendly =
    entity?.name ||
    entity?.original_name ||
    state?.attributes?.friendly_name ||
    entity?.entity_id ||
    "Unknown";

  const parts = [];
  if (area?.name) parts.push(area.name);
  if (device?.name_by_user || device?.name) parts.push(device.name_by_user || device.name);
  parts.push(friendly);

  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} – ${parts[1]}`;
  return `${parts[0]} / ${parts[1]} – ${parts[2]}`;
}

/**
 * @param {HaEntityContext} ctx
 * @param {import('./haClient.js').HaClient} haClient
 * @param {import('@sclera/sdk').default} stateChangedEvent
 */
export function createSubdeviceFromEntity(ctx, haClient, stateChangedEvent) {
  const entityId = ctx.entity?.entity_id || ctx.state?.entity_id;
  if (!entityId) return null;

  const domain = parseDomain(entityId);
  const actions = getActionsForDomain(haClient, domain);

  const metadata = {
    ha_domain: domain,
    ha_device_id: ctx.entity?.device_id ?? ctx.device?.id ?? null,
    ha_area_id: ctx.entity?.area_id ?? ctx.device?.area_id ?? ctx.area?.area_id ?? null,
    ha_platform: ctx.entity?.platform ?? null,
    ha_disabled: ctx.entity?.disabled_by ?? null,
  };

  return new Subdevice({
    externalId: entityId,
    name: buildSubdeviceName(ctx).slice(0, 256),
    deviceType: domain,
    metadata,
    actions,
    events: [stateChangedEvent],
  });
}

/**
 * Merge registry entries with live states into entity contexts.
 * @param {object[]} entityRegistry
 * @param {object[]} deviceRegistry
 * @param {object[]} areaRegistry
 * @param {object[]} states
 */
export function buildEntityContexts(entityRegistry, deviceRegistry, areaRegistry, states) {
  const devicesById = new Map(deviceRegistry.map((d) => [d.id, d]));
  const areasById = new Map(areaRegistry.map((a) => [a.area_id, a]));
  const statesById = new Map(states.map((s) => [s.entity_id, s]));
  const registryById = new Map(entityRegistry.map((e) => [e.entity_id, e]));

  const allEntityIds = new Set([
    ...entityRegistry.map((e) => e.entity_id),
    ...states.map((s) => s.entity_id),
  ]);

  const contexts = [];
  for (const entityId of allEntityIds) {
    if (!shouldIncludeEntity(entityId)) continue;

    const entity = registryById.get(entityId) ?? { entity_id: entityId };
    if (entity.disabled_by) continue;

    const device = entity.device_id ? devicesById.get(entity.device_id) ?? null : null;
    const areaId = entity.area_id ?? device?.area_id ?? null;
    const area = areaId ? areasById.get(areaId) ?? null : null;
    const state = statesById.get(entityId) ?? null;

    contexts.push({ entity, device, area, state });
  }

  return contexts;
}
