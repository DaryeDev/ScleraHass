const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

let currentLevel = "info";

export function setLogLevel(level) {
  if (level in LEVELS) currentLevel = level;
}

function shouldLog(level) {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function fmt(level, args) {
  const ts = new Date().toISOString();
  return [`[${ts}] [${level.toUpperCase()}]`, ...args];
}

export const log = {
  debug: (...args) => {
    if (shouldLog("debug")) console.log(...fmt("debug", args));
  },
  info: (...args) => {
    if (shouldLog("info")) console.log(...fmt("info", args));
  },
  warn: (...args) => {
    if (shouldLog("warn")) console.warn(...fmt("warn", args));
  },
  error: (...args) => {
    if (shouldLog("error")) console.error(...fmt("error", args));
  },
};
