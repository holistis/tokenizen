#!/usr/bin/env node
// bench/lock-holder-worker.mjs — helper child process spawned by
// event-loop-non-blocking.mjs. Not meant to be run standalone.
//
// Creates the claims.jsonl.lock file at the given path using the exact same
// primitive acquireLock() uses (openSync(path, "wx")), holds it for
// holdMs, then removes it and exits. This stands in for "some other
// process/request is mid-write and holding the lock" — the real-world
// condition that puts THIS process's appendClaim() calls onto
// acquireLock()'s contended-retry path for a known, controlled duration,
// so the parent script can measure whether ITS OWN event loop keeps
// running (interval ticks) while its appendClaim() calls wait.

import { openSync, closeSync, unlinkSync } from "node:fs";

const lockPath = process.argv[2];
const holdMs = Number(process.argv[3]);

closeSync(openSync(lockPath, "wx"));
console.error(`lock-holder: created ${lockPath}, holding for ${holdMs}ms`);

await new Promise((resolve) => setTimeout(resolve, holdMs));

unlinkSync(lockPath);
console.error(`lock-holder: released ${lockPath}`);
