import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import {
  applyTheme,
  getLocalTheme,
  initializeTheme,
  saveThemeLocally,
} from "./theme.js";

let classes;
let storage;
let originalDocument;
let originalLocalStorage;

beforeEach(() => {
  classes = new Set();
  storage = new Map();
  originalDocument = globalThis.document;
  originalLocalStorage = globalThis.localStorage;

  globalThis.document = {
    body: {
      classList: {
        add: (name) => classes.add(name),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
      },
    },
  };
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
});

afterEach(() => {
  if (originalDocument === undefined) {
    delete globalThis.document;
  } else {
    globalThis.document = originalDocument;
  }

  if (originalLocalStorage === undefined) {
    delete globalThis.localStorage;
  } else {
    globalThis.localStorage = originalLocalStorage;
  }
});

test("initializeTheme defaults invalid stored values to light", () => {
  storage.set("app_theme", "unknown");

  assert.equal(initializeTheme(), "light");
  assert.equal(storage.get("app_theme"), "light");
  assert.deepEqual([...classes], ["theme-light"]);
});

test("saveThemeLocally applies and persists an available theme", () => {
  assert.equal(saveThemeLocally("ocean"), "ocean");
  assert.equal(storage.get("app_theme"), "ocean");
  assert.deepEqual([...classes], ["theme-ocean"]);
  assert.equal(getLocalTheme(), "ocean");
});

test("applyTheme replaces the previously active theme class", () => {
  classes.add("theme-dark");

  assert.equal(applyTheme("light"), "light");
  assert.deepEqual([...classes], ["theme-light"]);
});
