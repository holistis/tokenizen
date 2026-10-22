// net-guard — the one place tokenizen's public servers are allowed to reach
// the network. Import guardedFetch (or inject it into a library's fetchImpl
// seam) instead of calling global fetch; resolve TXT only through
// resolveTxtGuarded. The build guard (no-raw-egress.test.ts) fails the build
// if any server path reaches the network without going through here.

export { UnsafeHostError, isBlockedAddress, assertHostnameLiteralSafe } from "./ip-rules.js";
export { guardedFetch, makeGuardedFetch, createGuardedLookup, type GuardedFetchDeps } from "./guarded-fetch.js";
export {
  resolveTxtGuarded,
  assertPubliclyRoutableHost,
  type ResolveTxtDeps,
  type RoutableHostDeps,
} from "./dns.js";
export { guardedEthersFetchRequest } from "./guarded-ethers.js";
