import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);

test("service worker upgrades preserve model and unrelated caches", async () => {
  const source = await readFile(new URL("public/sw.js", root), "utf8");
  const listeners = new Map();
  const deleted = [];
  const context = {
    URL,
    location: { origin: "https://es.duo621.cn" },
    caches: {
      keys: async () => ["echoscribe-shell-v10", "echoscribe-shell-v11", "transformers-cache", "user-cache"],
      delete: async (key) => {
        deleted.push(key);
        return true;
      },
      open: async () => ({ addAll: async () => undefined, put: async () => undefined }),
      match: async () => undefined,
    },
    self: {
      addEventListener: (name, handler) => listeners.set(name, handler),
      clients: { claim: () => undefined },
      skipWaiting: () => undefined,
    },
  };
  vm.runInNewContext(source, context);
  let activation;
  listeners.get("activate")({ waitUntil: (promise) => { activation = promise; } });
  await activation;
  assert.deepEqual(deleted, ["echoscribe-shell-v10"]);
});
