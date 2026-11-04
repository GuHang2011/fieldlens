import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemoRecords,
  createDemoSession,
  DEMO_SESSION_KEY,
} from "../src/demo-session.js";
import {
  localDay,
  loadHistory,
  matchesTask,
  reportFor,
} from "../src/domain.js";
import { summarizeRecords } from "../src/dashboard.js";

const now = new Date(2026, 10, 5, 0, 5);
function memoryStorage(entries = []) {
  const data = new Map(entries);
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}

test("demo pack covers seven local days, review states and tasks without model claims", () => {
  const records = createDemoRecords(now);
  assert.equal(records.length, 12);
  assert.equal(new Set(records.map((r) => r.id)).size, 12);
  assert.equal(new Set(records.map((r) => r.sample.plot)).size, 3);
  assert.equal(new Set(records.map((r) => localDay(new Date(r.date)))).size, 7);
  assert.ok(
    records.every(
      (r) => r.mode === "demo" && Date.parse(r.date) <= now.getTime(),
    ),
  );
  assert.ok(records.every((r) => reportFor(r).notice.includes("预设")));
  assert.ok(records.some((r) => !r.detections.length));
  assert.ok(records.some((r) => r.reviewed && r.regionReviews.length));
  assert.equal(
    records.filter((r) => matchesTask(r.followUp, "today", localDay(now)))
      .length,
    1,
  );
  assert.equal(
    records.filter((r) => matchesTask(r.followUp, "overdue", localDay(now)))
      .length,
    1,
  );
  assert.equal(summarizeRecords(records, { now }).total, 12);
  assert.equal(summarizeRecords(records, { now }).model, 0);
  for (const record of records) {
    if (record.followUp?.linkedRecordId)
      assert.ok(records.some((r) => r.id === record.followUp.linkedRecordId));
  }
});

test("demo edits and reset stay isolated and an intentionally empty session remains empty", () => {
  const store = memoryStorage([
    ["fieldlens.history", "personal-data"],
    ["fieldlens.history.user.42", "account-data"],
  ]);
  const demo = createDemoSession(() => store);
  demo.initialize(now);
  const records = loadHistory(demo.storage);
  records[0].notes = "my demo review";
  demo.storage.setItem("fieldlens.history", JSON.stringify(records));
  const reloaded = createDemoSession(() => store);
  reloaded.initialize(now);
  assert.equal(loadHistory(reloaded.storage)[0].notes, "my demo review");
  reloaded.storage.setItem("fieldlens.history", "[]");
  const empty = createDemoSession(() => store);
  empty.initialize(now);
  assert.deepEqual(loadHistory(empty.storage), []);
  empty.reset(now);
  assert.equal(loadHistory(empty.storage).length, 12);
  assert.equal(store.getItem("fieldlens.history"), "personal-data");
  assert.equal(store.getItem("fieldlens.history.user.42"), "account-data");
});

test("blocked session storage supports honest in-memory use without touching personal data", () => {
  const demo = createDemoSession(() => {
    throw Error("storage denied");
  });
  demo.initialize(now);
  assert.equal(loadHistory(demo.storage).length, 12);
  demo.storage.setItem("fieldlens.history", "[]");
  assert.equal(loadHistory(demo.storage).length, 0);
  assert.match(demo.status(), /刷新可能丢失/);
  demo.reset(now);
  assert.equal(loadHistory(demo.storage).length, 12);
});

test("invalid or duplicate demo cache is recovered only in the demo namespace", () => {
  for (const value of [
    "broken",
    "{}",
    JSON.stringify(Array(31).fill(createDemoRecords(now)[0])),
    JSON.stringify(Array(2).fill(createDemoRecords(now)[0])),
  ]) {
    const store = memoryStorage([
      [DEMO_SESSION_KEY, value],
      ["fieldlens.history", "keep"],
    ]);
    const demo = createDemoSession(() => store);
    demo.initialize(now);
    assert.equal(loadHistory(demo.storage).length, 12);
    assert.match(demo.status(), /缓存无效/);
    assert.equal(store.getItem("fieldlens.history"), "keep");
  }
});
