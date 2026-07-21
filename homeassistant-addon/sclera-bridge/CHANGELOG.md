# Changelog

## 1.0.2

- Fix `run.sh` startup failure (`exec: /run.sh: not found`) caused by CRLF line endings in the script's shebang; Dockerfile now normalizes line endings at build time as a safeguard.

## 1.0.0

- Initial release: Home Assistant → Sclera Hub bridge addon.
- Mirrors all HA entities as Sclera subdevices with domain-specific actions.
- Emits `state_changed` events to Sclera on HA state updates.
- Pairing via Sclera portal (code shown in addon logs).
