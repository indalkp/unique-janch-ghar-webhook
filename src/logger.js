/**
 * src/logger.js — Tiny structured logger.
 *
 * Cloud Logging on GCF Gen 2 auto-parses JSON written to stdout — each
 * console.log line becomes a structured entry searchable by field. So we
 * just emit JSON. Severity field is the magic key that maps to log levels
 * in the Cloud Logging UI.
 *
 * Why not bunyan/pino: this function is small and we want zero extra deps.
 */

'use strict';

/** @typedef {'DEBUG'|'INFO'|'WARNING'|'ERROR'} Severity */

/**
 * Emit a single structured log entry.
 * @param {Severity} severity
 * @param {string} event       — short snake_case event name, e.g. "webhook.ack"
 * @param {Object} [fields]    — extra context (kept under ~10 keys)
 */
function emit(severity, event, fields = {}) {
  const entry = {
    severity,
    event,
    time: new Date().toISOString(),
    ...fields,
  };
  // One line per entry — Cloud Logging requires this.
  // We use stdout for INFO/DEBUG, stderr for WARNING/ERROR so local `node`
  // also surfaces them sensibly.
  const out = severity === 'ERROR' || severity === 'WARNING' ? process.stderr : process.stdout;
  out.write(JSON.stringify(entry) + '\n');
}

const log = {
  /** @param {string} event @param {Object} [fields] */
  debug: (event, fields) => emit('DEBUG', event, fields),
  /** @param {string} event @param {Object} [fields] */
  info: (event, fields) => emit('INFO', event, fields),
  /** @param {string} event @param {Object} [fields] */
  warn: (event, fields) => emit('WARNING', event, fields),
  /** @param {string} event @param {Object} [fields] */
  error: (event, fields) => emit('ERROR', event, fields),
};

module.exports = { log };
