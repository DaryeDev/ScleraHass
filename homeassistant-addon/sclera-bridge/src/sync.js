import { Event, EventPayloadVariable } from "@sclera/sdk";
import { buildEntityContexts, createSubdeviceFromEntity } from "./subdeviceFactory.js";
import { log } from "./logger.js";

export const stateChangedEvent = new Event("state_changed")
  .setName("State changed")
  .setDescription("Home Assistant entity state changed")
  .setAutoAccept(true)
  .addPayloadVariable(new EventPayloadVariable("state").setName("State").setType("string"))
  .addPayloadVariable(
    new EventPayloadVariable("attributes").setName("Attributes").setType("object"),
  )
  .addPayloadVariable(
    new EventPayloadVariable("old_state").setName("Previous state").setType("string"),
  );

/**
 * @typedef {object} SyncEngineOptions
 * @property {import('./haClient.js').HaClient} haClient
 * @property {import('@sclera/sdk').Device} hub
 */

export class SyncEngine {
  /** @type {Map<string, import('@sclera/sdk').Subdevice>} */
  #subdevices = new Map();
  /** @type {SyncEngineOptions} */
  #opts;

  constructor(opts) {
    this.#opts = opts;
  }

  get subdeviceCount() {
    return this.#subdevices.size;
  }

  /**
   * Full catalog sync from HA registries + states.
   */
  async fullSync() {
    const { haClient, hub } = this.#opts;
    log.info("Starting full HA → Sclera sync…");

    const [states, entityRegistry, deviceRegistry, areaRegistry] = await Promise.all([
      haClient.getStates(),
      haClient.getEntityRegistry(),
      haClient.getDeviceRegistry(),
      haClient.getAreaRegistry(),
    ]);

    const contexts = buildEntityContexts(
      entityRegistry,
      deviceRegistry,
      areaRegistry,
      states,
    );

    const nextIds = new Set(contexts.map((c) => c.entity.entity_id));
    const currentIds = new Set(this.#subdevices.keys());

    let added = 0;
    let removed = 0;
    let updated = 0;

    for (const id of currentIds) {
      if (!nextIds.has(id)) {
        hub.removeSubdevice(id);
        this.#subdevices.delete(id);
        removed++;
      }
    }

    for (const ctx of contexts) {
      const entityId = ctx.entity.entity_id;
      const existing = this.#subdevices.get(entityId);

      if (!existing) {
        const sd = createSubdeviceFromEntity(ctx, haClient, stateChangedEvent);
        if (sd) {
          hub.addSubdevice(sd);
          this.#subdevices.set(entityId, sd);
          added++;
        }
      } else {
        const newName = createSubdeviceFromEntity(ctx, haClient, stateChangedEvent)?.name;
        if (newName && existing.name !== newName) {
          existing.setName(newName);
          updated++;
        }
      }
    }

    log.info(
      `Sync complete: ${this.#subdevices.size} subdevices (+${added} -${removed} ~${updated})`,
    );
  }

  /**
   * Handle HA state_changed events → emit Sclera events.
   * @param {object} event
   */
  async handleStateChanged(event) {
    const entityId = event?.data?.entity_id;
    if (!entityId) return;

    const sd = this.#subdevices.get(entityId);
    if (!sd) return;

    const newState = event.data?.new_state;
    const oldState = event.data?.old_state;
    if (!newState) return;

    try {
      await stateChangedEvent.emit(
        {
          state: newState.state,
          attributes: newState.attributes ?? {},
          old_state: oldState?.state ?? null,
        },
        undefined,
        undefined,
        sd,
      );
      log.debug(`Emitted state_changed for ${entityId}: ${newState.state}`);
    } catch (err) {
      log.warn(`Failed to emit state_changed for ${entityId}:`, err.message);
    }
  }

  /**
   * Registry update → debounced full resync.
   */
  handleRegistryUpdate(eventType) {
    log.info(`HA registry update (${eventType}) — scheduling resync`);
    this.#scheduleResync();
  }

  #resyncTimer = null;

  #scheduleResync() {
    if (this.#resyncTimer) clearTimeout(this.#resyncTimer);
    this.#resyncTimer = setTimeout(async () => {
      this.#resyncTimer = null;
      try {
        await this.fullSync();
      } catch (err) {
        log.error("Resync after registry update failed:", err.message);
      }
    }, 2000);
  }
}

export default SyncEngine;
