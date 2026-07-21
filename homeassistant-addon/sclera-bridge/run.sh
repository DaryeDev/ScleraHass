#!/usr/bin/with-contenv bashio
# shellcheck shell=bash

bashio::log.info "Starting Sclera Bridge…"
exec node /app/src/index.js
