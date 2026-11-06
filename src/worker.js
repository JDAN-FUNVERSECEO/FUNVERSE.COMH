{
  "$schema": "https://unpkg.com/wrangler/config-schema.json",
  "name": "funverse-com",
  "main": "src/worker.js",
  "compatibility_date": "2026-11-05",
  "workers_dev": true,
  "assets": {
    "directory": "./",
    "binding": "ASSETS",
    "run_worker_first": ["/api", "/api/*"]
  }
}
