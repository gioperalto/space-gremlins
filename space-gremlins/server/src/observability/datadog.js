'use strict'

// dd-trace must be initialized before any other require
let tracer = null
let StatsD = null

function init() {
  if (process.env.DD_API_KEY) {
    try {
      tracer = require('dd-trace').init({
        service: 'space-gremlins',
        env: process.env.DD_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
        logInjection: true,
      })
      console.log('[Datadog] APM tracer initialized')
    } catch (e) {
      console.warn('[Datadog] Failed to init tracer:', e.message)
    }
  } else {
    console.log('[Datadog] DD_API_KEY not set — tracing disabled')
  }
}

// Simple structured logger that emits JSON for Datadog log ingestion
function log(level, event, data = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    service: 'space-gremlins',
    env: process.env.DD_ENV || 'development',
    ...data,
  }
  if (level === 'error') {
    console.error(JSON.stringify(entry))
  } else {
    console.log(JSON.stringify(entry))
  }
}

// DogStatsD custom metrics via UDP (if agent running)
// Falls back to no-op if not available
const metrics = {
  _send(type, metric, value, tags = []) {
    // In production with DD agent, use hot-shots or dogstatsd client
    // Here we log metrics as structured events that Datadog log-based metrics can pick up
    log('info', 'metric', { metric_type: type, metric_name: metric, value, tags })
  },
  gauge(metric, value, tags) { this._send('gauge', metric, value, tags) },
  increment(metric, tags) { this._send('count', metric, 1, tags) },
  decrement(metric, tags) { this._send('count', metric, -1, tags) },
}

module.exports = { init, log, metrics, tracer: () => tracer }
