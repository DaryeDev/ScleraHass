# Changelog

## 1.0.3

- Replace universal `call_service` fallback with named actions: curated for common domains, auto-generated from Home Assistant `get_services` for others.
- `call_service` remains only for domains without HA services (e.g. sensors).
- Expanded curated actions for `climate`, `media_player`, `fan`, `vacuum`, and `cover`.

## 1.0.2

- Fix `run.sh` startup failure (`exec: /run.sh: not found`) caused by CRLF line endings in the script's shebang; Dockerfile now normalizes line endings at build time as a safeguard.

## 1.0.0

- Initial release: Home Assistant → Sclera Hub bridge addon.
- Mirrors all HA entities as Sclera subdevices with domain-specific actions.
- Emits `state_changed` events to Sclera on HA state updates.
- Pairing via Sclera portal (code shown in addon logs).
