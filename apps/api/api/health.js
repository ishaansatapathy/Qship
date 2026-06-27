"use strict";

/** Lightweight health probe — no bundled deps. */
module.exports = (_req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(
    JSON.stringify({
      healthy: true,
      ready: false,
      service: "shipflow-api",
      message: "ShipFlow API edge health — use /ready after cold start for DB check",
    }),
  );
};
