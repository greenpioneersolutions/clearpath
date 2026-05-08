"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(main_exports);
var DEFAULT_CONFIG = {
  greeting: "Hello from SDK Example!",
  enableDebugLogging: false,
  maxEventLogSize: 100
};
var activatedAt = null;
var ctx = null;
var registeredChannels = /* @__PURE__ */ new Set();
function appendEventLog(entry) {
  if (!ctx) return;
  const config = ctx.store.get("config", DEFAULT_CONFIG) ?? DEFAULT_CONFIG;
  const log = ctx.store.get("eventLog", []) ?? [];
  log.push(entry);
  while (log.length > config.maxEventLogSize) {
    log.shift();
  }
  ctx.store.set("eventLog", log);
}
async function activate(context) {
  ctx = context;
  activatedAt = Date.now();
  registeredChannels.clear();
  const origRegister = ctx.registerHandler.bind(ctx);
  ctx.registerHandler = (channel, handler) => {
    registeredChannels.add(channel);
    return origRegister(channel, handler);
  };
  ctx.log.info("SDK Example extension activating...");
  if (!ctx.store.get("config")) {
    ctx.store.set("config", DEFAULT_CONFIG);
  }
  if (!ctx.store.get("eventLog")) {
    ctx.store.set("eventLog", []);
  }
  if (!ctx.store.get("counter")) {
    ctx.store.set("counter", 0);
  }
  if (!ctx.store.get("demoData")) {
    ctx.store.set("demoData", {
      items: ["Alpha", "Bravo", "Charlie"],
      createdAt: Date.now()
    });
  }
  ctx.registerHandler("sdk-example:get-config", async () => {
    try {
      const config = ctx.store.get("config", DEFAULT_CONFIG);
      return { success: true, data: config };
    } catch (err) {
      ctx.log.error("get-config failed: %s", err.message);
      return { success: false, error: err.message };
    }
  });
  ctx.registerHandler("sdk-example:set-config", async (_e, args) => {
    try {
      const current = ctx.store.get("config", DEFAULT_CONFIG) ?? DEFAULT_CONFIG;
      const merged = { ...current, ...args };
      ctx.store.set("config", merged);
      ctx.log.info("Config updated: %o", merged);
      return { success: true, data: merged };
    } catch (err) {
      ctx.log.error("set-config failed: %s", err.message);
      return { success: false, error: err.message };
    }
  });
  ctx.registerHandler("sdk-example:get-demo-data", async () => {
    try {
      const eventLog = ctx.store.get("eventLog", []) ?? [];
      const sessionCount = eventLog.filter((e) => e.event === "session:started").length;
      const turnCount = eventLog.filter((e) => e.event === "turn:started").length;
      return {
        success: true,
        data: {
          extensionId: ctx.extensionId,
          sessionCount,
          turnCount,
          uptime: activatedAt ? Date.now() - activatedAt : 0
        }
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ctx.registerHandler("sdk-example:get-event-log", async () => {
    try {
      const log = ctx.store.get("eventLog", []) ?? [];
      return { success: true, data: log };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ctx.registerHandler("sdk-example:clear-event-log", async () => {
    try {
      ctx.store.set("eventLog", []);
      ctx.log.info("Event log cleared");
      return { success: true, data: null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ctx.registerHandler("sdk-example:increment-counter", async () => {
    try {
      const current = ctx.store.get("counter", 0) ?? 0;
      const next = current + 1;
      ctx.store.set("counter", next);
      return { success: true, data: { counter: next } };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ctx.registerHandler("sdk-example:get-storage-stats", async () => {
    try {
      const keys = ctx.store.keys();
      const stats = {
        keyCount: keys.length,
        keys,
        counter: ctx.store.get("counter", 0),
        activatedAt,
        uptimeMs: activatedAt ? Date.now() - activatedAt : 0
      };
      return { success: true, data: stats };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ctx.registerHandler("sdk-example:on-session-started", async (_e, args) => {
    ctx.log.info("Session started: %o", args);
    appendEventLog({ event: "session:started", timestamp: Date.now(), data: args });
    return { success: true, data: null };
  });
  ctx.registerHandler("sdk-example:on-session-stopped", async (_e, args) => {
    ctx.log.info("Session stopped: %o", args);
    appendEventLog({ event: "session:stopped", timestamp: Date.now(), data: args });
    return { success: true, data: null };
  });
  ctx.registerHandler("sdk-example:on-turn-started", async (_e, args) => {
    if (ctx.store.get("config", DEFAULT_CONFIG)?.enableDebugLogging) {
      ctx.log.debug("Turn started: %o", args);
    }
    appendEventLog({ event: "turn:started", timestamp: Date.now(), data: args });
    return { success: true, data: null };
  });
  ctx.registerHandler("sdk-example:on-turn-ended", async (_e, args) => {
    if (ctx.store.get("config", DEFAULT_CONFIG)?.enableDebugLogging) {
      ctx.log.debug("Turn ended: %o", args);
    }
    appendEventLog({ event: "turn:ended", timestamp: Date.now(), data: args });
    return { success: true, data: null };
  });
  ctx.registerHandler("sdk-example:ctx-demo", async (_e, args) => {
    try {
      const params = args;
      const config = ctx.store.get("config", DEFAULT_CONFIG) ?? DEFAULT_CONFIG;
      const eventLog = ctx.store.get("eventLog", []) ?? [];
      const counter = ctx.store.get("counter", 0) ?? 0;
      const sessionEvents = eventLog.filter(
        (e) => e.event === "session:started" || e.event === "session:stopped"
      );
      const turnEvents = eventLog.filter(
        (e) => e.event === "turn:started" || e.event === "turn:ended"
      );
      const lines = [
        "## SDK Example Extension Context",
        "",
        `**Greeting**: ${config.greeting}`,
        `**Counter**: ${counter}`,
        `**Total Events Logged**: ${eventLog.length}`,
        `**Sessions Observed**: ${sessionEvents.length}`,
        `**Turns Observed**: ${turnEvents.length}`,
        `**Activated At**: ${activatedAt ? new Date(activatedAt).toISOString() : "N/A"}`,
        `**Uptime**: ${activatedAt ? Math.round((Date.now() - activatedAt) / 1e3) : 0}s`
      ];
      if (params.topic) {
        lines.push("", `### Requested Topic: ${params.topic}`);
        lines.push(
          `This context provider received the topic "${params.topic}" as a user-supplied parameter.`
        );
      }
      if (eventLog.length > 0) {
        lines.push("", "### Recent Events");
        for (const entry of eventLog.slice(-5)) {
          lines.push(`- \`${entry.event}\` at ${new Date(entry.timestamp).toISOString()}`);
        }
      }
      const context2 = lines.join("\n");
      return {
        success: true,
        context: context2,
        tokenEstimate: Math.ceil(context2.length / 4),
        metadata: { truncated: false, eventCount: eventLog.length, topic: params.topic ?? null }
      };
    } catch (err) {
      ctx.log.error("ctx-demo failed: %s", err.message);
      return { success: false, error: err.message };
    }
  });
  ctx.registerHandler("sdk-example:health", async () => {
    return {
      success: true,
      data: {
        status: "healthy",
        handlers: [...registeredChannels],
        extensionId: ctx.extensionId,
        extensionPath: ctx.extensionPath,
        activatedAt,
        uptimeMs: activatedAt ? Date.now() - activatedAt : 0,
        storeKeys: ctx.store.keys().length
      }
    };
  });
  try {
    const appVersion = await ctx.invoke("app:get-version").catch(() => "unknown");
    ctx.log.info("Host app version: %s", appVersion);
  } catch {
    ctx.log.debug("Could not read host app version (expected during testing)");
  }
  ctx.log.info("SDK Example extension activated \u2014 13 handlers registered");
}
function deactivate() {
  if (ctx) {
    ctx.log.info(
      "SDK Example extension deactivating after %dms",
      activatedAt ? Date.now() - activatedAt : 0
    );
  }
  activatedAt = null;
  ctx = null;
  registeredChannels.clear();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
