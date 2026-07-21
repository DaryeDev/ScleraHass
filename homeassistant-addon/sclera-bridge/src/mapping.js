import { Action, ActionParameter } from "@sclera/sdk";

/** @type {Record<string, Record<string, object>> | null} */
let servicesCatalog = null;

/**
 * @param {Record<string, Record<string, object>> | null} catalog
 */
export function setServicesCatalog(catalog) {
  servicesCatalog = catalog;
  clearActionCache();
}

/**
 * @param {import('./haClient.js').HaClient} haClient
 * @param {string} domain
 * @param {string} service
 * @param {Array<{ id: string, name: string, type: string, required?: boolean }>} [paramDefs]
 */
function serviceAction(id, name, domain, service, haClient, paramDefs = []) {
  const action = new Action(id).setName(name);
  for (const p of paramDefs) {
    action.addParameter(
      new ActionParameter(p.id)
        .setName(p.name)
        .setType(p.type)
        .setRequired(!!p.required),
    );
  }
  action.setExec(async (params, _caller, ctx) => {
    const entityId = ctx.externalId;
    const serviceData = {};
    for (const p of paramDefs) {
      if (params[p.id] !== undefined && params[p.id] !== null) {
        serviceData[p.id] = params[p.id];
      }
    }
    await haClient.callService(domain, service, { entity_id: entityId }, serviceData);
    return { success: true, entity_id: entityId, service };
  });
  return action;
}

/**
 * @param {string} serviceId
 */
function humanizeServiceName(serviceId) {
  return serviceId
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * @param {object} fieldDef
 * @returns {"string" | "number" | "boolean" | "object" | "array"}
 */
function mapHaFieldToParamType(fieldDef) {
  const selector = fieldDef?.selector;
  if (!selector || typeof selector !== "object") return "object";

  if ("number" in selector) return "number";
  if ("boolean" in selector) return "boolean";
  if ("text" in selector || "select" in selector || "entity" in selector) return "string";
  if (
    "color_rgb" in selector ||
    "color_temp" in selector ||
    "rgb" in selector ||
    "rgbw" in selector
  ) {
    return "array";
  }
  return "object";
}

/**
 * @param {string} fieldId
 * @param {object} fieldDef
 */
function fieldDisplayName(fieldId, fieldDef) {
  if (typeof fieldDef?.name === "string" && fieldDef.name.length > 0) {
    return fieldDef.name;
  }
  return humanizeServiceName(fieldId);
}

/**
 * @param {import('./haClient.js').HaClient} haClient
 * @param {string} domain
 * @param {Record<string, object>} domainServices
 * @returns {import('@sclera/sdk').default[]}
 */
export function buildAutoActionsFromHaServices(haClient, domain, domainServices) {
  const actions = [];

  for (const [serviceId, serviceDef] of Object.entries(domainServices)) {
    if (!serviceDef || typeof serviceDef !== "object") continue;

    const displayName =
      typeof serviceDef.name === "string" && serviceDef.name.length > 0
        ? serviceDef.name
        : humanizeServiceName(serviceId);

    const paramDefs = [];
    const fields = serviceDef.fields;
    if (fields && typeof fields === "object") {
      for (const [fieldId, fieldDef] of Object.entries(fields)) {
        if (!fieldDef || typeof fieldDef !== "object") continue;
        paramDefs.push({
          id: fieldId,
          name: fieldDisplayName(fieldId, fieldDef),
          type: mapHaFieldToParamType(fieldDef),
          required: !!fieldDef.required,
        });
      }
    }

    actions.push(serviceAction(serviceId, displayName, domain, serviceId, haClient, paramDefs));
  }

  return actions;
}

/** @type {Record<string, (haClient: import('./haClient.js').HaClient) => import('@sclera/sdk').default[]>} */
const DOMAIN_BUILDERS = {
  light: (ha) => [
    serviceAction("turn_on", "Turn on", "light", "turn_on", ha, [
      { id: "brightness_pct", name: "Brightness %", type: "number", required: false },
      { id: "color_temp_kelvin", name: "Color temp (K)", type: "number", required: false },
      { id: "rgb_color", name: "RGB color", type: "array", required: false },
    ]),
    serviceAction("turn_off", "Turn off", "light", "turn_off", ha),
    serviceAction("toggle", "Toggle", "light", "toggle", ha),
  ],
  switch: (ha) => [
    serviceAction("turn_on", "Turn on", "switch", "turn_on", ha),
    serviceAction("turn_off", "Turn off", "switch", "turn_off", ha),
    serviceAction("toggle", "Toggle", "switch", "toggle", ha),
  ],
  input_boolean: (ha) => [
    serviceAction("turn_on", "Turn on", "input_boolean", "turn_on", ha),
    serviceAction("turn_off", "Turn off", "input_boolean", "turn_off", ha),
    serviceAction("toggle", "Toggle", "input_boolean", "toggle", ha),
  ],
  lock: (ha) => [
    serviceAction("lock", "Lock", "lock", "lock", ha),
    serviceAction("unlock", "Unlock", "lock", "unlock", ha),
    serviceAction("open", "Open", "lock", "open", ha),
  ],
  cover: (ha) => [
    serviceAction("open_cover", "Open", "cover", "open_cover", ha),
    serviceAction("close_cover", "Close", "cover", "close_cover", ha),
    serviceAction("stop_cover", "Stop", "cover", "stop_cover", ha),
    serviceAction("toggle", "Toggle", "cover", "toggle", ha),
    serviceAction("set_cover_position", "Set position", "cover", "set_cover_position", ha, [
      { id: "position", name: "Position", type: "number", required: true },
    ]),
  ],
  climate: (ha) => [
    serviceAction("turn_on", "Turn on", "climate", "turn_on", ha),
    serviceAction("turn_off", "Turn off", "climate", "turn_off", ha),
    serviceAction("set_temperature", "Set temperature", "climate", "set_temperature", ha, [
      { id: "temperature", name: "Temperature", type: "number", required: true },
    ]),
    serviceAction("set_hvac_mode", "Set HVAC mode", "climate", "set_hvac_mode", ha, [
      { id: "hvac_mode", name: "HVAC mode", type: "string", required: true },
    ]),
    serviceAction("set_fan_mode", "Set fan mode", "climate", "set_fan_mode", ha, [
      { id: "fan_mode", name: "Fan mode", type: "string", required: true },
    ]),
  ],
  fan: (ha) => [
    serviceAction("turn_on", "Turn on", "fan", "turn_on", ha),
    serviceAction("turn_off", "Turn off", "fan", "turn_off", ha),
    serviceAction("toggle", "Toggle", "fan", "toggle", ha),
    serviceAction("set_percentage", "Set percentage", "fan", "set_percentage", ha, [
      { id: "percentage", name: "Percentage", type: "number", required: true },
    ]),
    serviceAction("oscillate", "Oscillate", "fan", "oscillate", ha, [
      { id: "oscillating", name: "Oscillating", type: "boolean", required: true },
    ]),
  ],
  media_player: (ha) => [
    serviceAction("turn_on", "Turn on", "media_player", "turn_on", ha),
    serviceAction("turn_off", "Turn off", "media_player", "turn_off", ha),
    serviceAction("media_play", "Play", "media_player", "media_play", ha),
    serviceAction("media_pause", "Pause", "media_player", "media_pause", ha),
    serviceAction("media_stop", "Stop", "media_player", "media_stop", ha),
    serviceAction("media_next_track", "Next track", "media_player", "media_next_track", ha),
    serviceAction(
      "media_previous_track",
      "Previous track",
      "media_player",
      "media_previous_track",
      ha,
    ),
    serviceAction("volume_set", "Set volume", "media_player", "volume_set", ha, [
      { id: "volume_level", name: "Volume level", type: "number", required: true },
    ]),
    serviceAction("volume_mute", "Mute", "media_player", "volume_mute", ha, [
      { id: "is_volume_muted", name: "Muted", type: "boolean", required: true },
    ]),
    serviceAction("select_source", "Select source", "media_player", "select_source", ha, [
      { id: "source", name: "Source", type: "string", required: true },
    ]),
  ],
  input_number: (ha) => [
    serviceAction("set_value", "Set value", "input_number", "set_value", ha, [
      { id: "value", name: "Value", type: "number", required: true },
    ]),
  ],
  input_text: (ha) => [
    serviceAction("set_value", "Set value", "input_text", "set_value", ha, [
      { id: "value", name: "Value", type: "string", required: true },
    ]),
  ],
  input_select: (ha) => [
    serviceAction("select_option", "Select option", "input_select", "select_option", ha, [
      { id: "option", name: "Option", type: "string", required: true },
    ]),
  ],
  input_datetime: (ha) => [
    serviceAction("set_datetime", "Set datetime", "input_datetime", "set_datetime", ha, [
      { id: "datetime", name: "Datetime", type: "string", required: false },
      { id: "date", name: "Date", type: "string", required: false },
      { id: "time", name: "Time", type: "string", required: false },
    ]),
  ],
  input_button: (ha) => [serviceAction("press", "Press", "input_button", "press", ha)],
  button: (ha) => [serviceAction("press", "Press", "button", "press", ha)],
  counter: (ha) => [
    serviceAction("increment", "Increment", "counter", "increment", ha),
    serviceAction("decrement", "Decrement", "counter", "decrement", ha),
    serviceAction("reset", "Reset", "counter", "reset", ha),
  ],
  timer: (ha) => [
    serviceAction("start", "Start", "timer", "start", ha),
    serviceAction("pause", "Pause", "timer", "pause", ha),
    serviceAction("cancel", "Cancel", "timer", "cancel", ha),
  ],
  scene: (ha) => [serviceAction("turn_on", "Activate", "scene", "turn_on", ha)],
  script: (ha) => [serviceAction("turn_on", "Run", "script", "turn_on", ha)],
  automation: (ha) => [
    serviceAction("turn_on", "Enable", "automation", "turn_on", ha),
    serviceAction("turn_off", "Disable", "automation", "turn_off", ha),
    serviceAction("toggle", "Toggle", "automation", "toggle", ha),
    serviceAction("trigger", "Trigger", "automation", "trigger", ha),
  ],
  vacuum: (ha) => [
    serviceAction("start", "Start", "vacuum", "start", ha),
    serviceAction("pause", "Pause", "vacuum", "pause", ha),
    serviceAction("stop", "Stop", "vacuum", "stop", ha),
    serviceAction("return_to_base", "Return to base", "vacuum", "return_to_base", ha),
    serviceAction("locate", "Locate", "vacuum", "locate", ha),
  ],
  valve: (ha) => [
    serviceAction("open_valve", "Open", "valve", "open_valve", ha),
    serviceAction("close_valve", "Close", "valve", "close_valve", ha),
  ],
  number: (ha) => [
    serviceAction("set_value", "Set value", "number", "set_value", ha, [
      { id: "value", name: "Value", type: "number", required: true },
    ]),
  ],
  select: (ha) => [
    serviceAction("select_option", "Select option", "select", "select_option", ha, [
      { id: "option", name: "Option", type: "string", required: true },
    ]),
  ],
  text: (ha) => [
    serviceAction("set_value", "Set value", "text", "set_value", ha, [
      { id: "value", name: "Value", type: "string", required: true },
    ]),
  ],
};

const actionCache = new Map();

/**
 * @param {import('./haClient.js').HaClient} haClient
 * @param {string} domain
 * @returns {import('@sclera/sdk').default[]}
 */
export function getActionsForDomain(haClient, domain) {
  const cacheKey = domain;
  if (actionCache.has(cacheKey)) {
    return actionCache.get(cacheKey);
  }

  let actions = [];
  const builder = DOMAIN_BUILDERS[domain];
  if (builder) {
    actions = builder(haClient);
  } else if (servicesCatalog?.[domain]) {
    actions = buildAutoActionsFromHaServices(haClient, domain, servicesCatalog[domain]);
  }

  if (actions.length === 0) {
    actions = [createGenericCallServiceAction(haClient, domain)];
  }

  actionCache.set(cacheKey, actions);
  return actions;
}

/**
 * @param {import('./haClient.js').HaClient} haClient
 * @param {string} [defaultDomain]
 */
export function createGenericCallServiceAction(haClient, defaultDomain) {
  return new Action("call_service")
    .setName("Call service")
    .setDescription("Call any Home Assistant service on this entity")
    .addParameter(
      new ActionParameter("service").setName("Service").setType("string").setRequired(true),
    )
    .addParameter(
      new ActionParameter("data").setName("Service data").setType("object").setRequired(false),
    )
    .setExec(async (params, _caller, ctx) => {
      const entityId = ctx.externalId;
      const [domainFromEntity, _objectId] = entityId.split(".", 2);
      const domain = defaultDomain || domainFromEntity;
      const service = params.service;
      const serviceData = { ...(params.data || {}), entity_id: entityId };
      await haClient.callService(domain, service, { entity_id: entityId }, params.data || {});
      return { success: true, domain, service, entity_id: entityId, service_data: serviceData };
    });
}

/** Clear cached actions (e.g. on haClient reconnect with new instance). */
export function clearActionCache() {
  actionCache.clear();
}

export { DOMAIN_BUILDERS };
