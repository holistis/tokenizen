// Proves the own-dependency guard can go BOTH green and red, and that its range
// logic follows npm's rule for 0.x versions. A gate that can only ever return one
// answer is not a gate.

import { test } from "node:test";
import assert from "node:assert/strict";
import { check, satisfies } from "./check-own-deps-published.mjs";

const pkg = (name, deps = {}, isPrivate = false) => [
  name,
  { dir: name, private: isPrivate, json: { name, dependencies: deps } },
];

test("green: an own-dependency that exists on npm at a satisfying version", async () => {
  const local = new Map([pkg("server", { lib: "^0.1.0" }), pkg("lib")]);
  const problems = await check(null, {
    localPackages: local,
    publishedVersions: async () => ["0.1.0", "0.1.3"],
  });
  assert.deepEqual(problems, []);
});

test("red: an own-dependency that is not on npm at all", async () => {
  const local = new Map([pkg("server", { lib: "^0.1.0" }), pkg("lib")]);
  const problems = await check(null, { localPackages: local, publishedVersions: async () => [] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not on npm at all/);
});

test("red: on npm, but no published version satisfies the range", async () => {
  const local = new Map([pkg("server", { lib: "^0.2.0" }), pkg("lib")]);
  const problems = await check(null, {
    localPackages: local,
    publishedVersions: async () => ["0.1.0"],
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /npm has only \[0\.1\.0\]/);
});

test("external dependencies are ignored, npm ci already proves those", async () => {
  const local = new Map([pkg("server", { ethers: "^6.13.0" })]);
  const problems = await check(null, {
    localPackages: local,
    publishedVersions: async () => {
      throw new Error("must not look up an external dependency");
    },
  });
  assert.deepEqual(problems, []);
});

test("a private package is skipped, it ships to nobody", async () => {
  const local = new Map([pkg("inhouse", { lib: "^9.9.9" }, true), pkg("lib")]);
  const problems = await check(null, { localPackages: local, publishedVersions: async () => [] });
  assert.deepEqual(problems, []);
});

test("caret on a 0.x version pins the minor, the way npm does", () => {
  // This is the case that would silently wave through a real mismatch.
  assert.equal(satisfies("0.1.9", "^0.1.0"), true);
  assert.equal(satisfies("0.2.0", "^0.1.0"), false);
  assert.equal(satisfies("0.0.9", "^0.1.0"), false);
  // Above 0.x the major is what is pinned.
  assert.equal(satisfies("1.9.0", "^1.2.0"), true);
  assert.equal(satisfies("2.0.0", "^1.2.0"), false);
  // An exact range means exact.
  assert.equal(satisfies("1.2.3", "1.2.3"), true);
  assert.equal(satisfies("1.2.4", "1.2.3"), false);
});
