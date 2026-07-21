# Sclera Bridge

Connect your **Home Assistant** installation to [Sclera](https://github.com/DaryeDev/sclera) as a **Hub**. Every HA entity (devices, sensors, helpers like `input_boolean`, `input_number`, etc.) is exposed as a Sclera **subdevice** with domain-specific **actions** and live **state_changed** events.

## Requirements

- Home Assistant with **Supervisor** (Home Assistant OS, Supervised, or similar).
- A running Sclera server (self-hosted or hosted).
- Network access from the addon container to your Sclera WebSocket URL.

## Installation

### 1. Add the repository

1. Open **Settings → Add-ons → Add-on store**.
2. Click the **⋮** menu (top right) → **Repositories**.
3. Add this repository URL:

   ```
   https://github.com/DaryeDev/sclera
   ```

4. Click **Save**.

### 2. Install the addon

1. Refresh the add-on store.
2. Open **Sclera Bridge** under the new repository.
3. Click **Install**.
4. Configure options (see below).
5. Click **Start**.

### 3. Pair with Sclera

On first start the addon prints a **pairing code** in the logs:

1. Open **Settings → Add-ons → Sclera Bridge → Log**.
2. Copy the pairing code or open the URL shown in the log, e.g.  
   `https://sclera.example.com/clients/pair?code=XXXXXX`
3. Approve the new Hub device in the Sclera portal.

Credentials are stored in `/data/sclera_client_config.json` inside the addon and persist across restarts.

## Configuration

| Option | Description | Default |
|--------|-------------|---------|
| **Sclera WebSocket URL** | WebSocket endpoint of your Sclera server | `wss://apisclera.darye.dev/api/ws` |
| **Sclera frontend URL** | Used in logs for the pairing link | `https://sclera.darye.dev` |
| **Hub name in Sclera** | Display name of this bridge | `Home Assistant` |
| **Include domains** | If set, only sync these HA domains (e.g. `light`, `switch`) | *(empty = all)* |
| **Exclude domains** | Skip these domains (e.g. `update`, `device_tracker`) | *(empty)* |
| **Exclude entities** | Skip specific `entity_id`s | *(empty)* |
| **Full resync interval** | Periodic catalog resync in seconds (30–3600) | `300` |
| **Log level** | `debug`, `info`, `warn`, or `error` | `info` |

## What gets synced

- **All entities** from Home Assistant (unless filtered), including:
  - Device entities (`light`, `switch`, `climate`, …)
  - **Helpers** (`input_boolean`, `input_number`, `input_select`, `input_text`, `input_datetime`, `input_button`, `counter`, `timer`, …)
  - Scenes, scripts, automations, etc.
- Each entity becomes a Sclera subdevice with `externalId` = HA `entity_id` (e.g. `light.living_room`).

## Actions & events

### Actions (examples)

| HA domain | Sclera actions |
|-----------|----------------|
| `light` | `turn_on`, `turn_off`, `toggle` (+ brightness/color params) |
| `switch`, `input_boolean` | `turn_on`, `turn_off`, `toggle` |
| `climate` | `set_temperature`, `set_hvac_mode` |
| `lock` | `lock`, `unlock`, `open` |
| `input_number`, `input_text` | `set_value` |
| `input_select` | `select_option` |
| `counter` | `increment`, `decrement`, `reset` |
| *all entities* | `call_service` (generic fallback) |

Invoke from Sclera as:

```
turn_on@{hubClientId}:light.living_room
```

### Events

Every subdevice emits `state_changed` when the HA entity state updates:

```
state_changed@{hubClientId}:light.living_room
```

Payload: `{ state, attributes, old_state }`.

## Architecture

```
Home Assistant Core
        │  ws://supervisor/core/websocket (SUPERVISOR_TOKEN)
        ▼
  Sclera Bridge addon
        │  @sclera/sdk Device (Hub)
        ▼
  Sclera server  ←→  other clients / flows / agents
```

The addon uses Home Assistant's **Supervisor API proxy** — no Long-Lived Access Token is required.

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| `SUPERVISOR_TOKEN is not set` | Ensure `homeassistant_api: true` in addon config (default). Restart the addon. |
| HA auth failed | Supervisor token issue — restart Supervisor or the addon. |
| Pairing code not shown | Check addon logs at **info** level; ensure Sclera WS URL is reachable. |
| Entity missing in Sclera | Check exclude filters; invalid `entity_id` characters are skipped. |
| Actions fail | Check HA logs; use `call_service` action for unsupported domains. |

## Development (local)

Outside Home Assistant, set env vars and run:

```bash
cd homeassistant-addon/sclera-bridge
npm install
SCLERA_WS_URL=ws://localhost:3000/api/ws \
SCLERA_FRONTEND_URL=http://localhost:5173 \
SUPERVISOR_TOKEN=<token> \
HA_WS_URL=ws://localhost:8123/api/websocket \
node src/index.js
```

When not running inside Supervisor, options fall back to env vars (see `src/env.js`).

## License

Same as the Sclera project (MIT).
