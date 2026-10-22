// guarded-ethers.ts — lets a package build an ethers JsonRpcProvider against
// a caller-supplied rpcUrl without a raw, unguarded outbound fetch.
//
// Found 2026-10-22: capacity-attest's discover_delivery_history (an EAS
// source via eas.ts's rpcAttestationReader) and its httpClaimSource both
// take a CALLER-SUPPLIED URL and make a real outbound request to it,
// exactly the SSRF shape net-guard exists to close — but capacity-attest
// was never added to no-raw-egress.test.ts's GUARDED_PACKAGES, and neither
// file used guardedFetch. httpClaimSource already has a fetchImpl seam
// (inject guardedFetch there directly); ethers' JsonRpcProvider has no such
// seam on its constructor, only on the FetchRequest it is given. This file
// closes that second gap.
//
// ethers' JsonRpcProvider accepts a FetchRequest (instead of a plain URL
// string) as its first constructor argument, and FetchRequest exposes a
// settable getUrlFunc that fully replaces its own network layer — see
// ethers' own fetch.d.ts: `type FetchGetUrlFunc = (req: FetchRequest, signal?)
// => Promise<GetUrlResponse>`. Adapting guardedFetch to that exact shape
// means a provider built this way is pinned and validated on every RPC
// call (including any redirect), the same guarantee as every other guarded
// egress path in this monorepo.

import { FetchRequest, type GetUrlResponse } from "ethers";
import { guardedFetch } from "./guarded-fetch.js";

/**
 * A FetchRequest whose network layer is guardedFetch. Pass the result to
 * `new ethers.JsonRpcProvider(guardedEthersFetchRequest(rpcUrl), ...)`
 * instead of passing `rpcUrl` as a plain string — passing a plain string
 * there falls back to ethers' own, unguarded network layer.
 */
export function guardedEthersFetchRequest(url: string): FetchRequest {
  const req = new FetchRequest(url);
  req.getUrlFunc = async (request): Promise<GetUrlResponse> => {
    // ethers' own FetchCancelSignal (passed as this callback's 2nd argument)
    // is a distinct class, not a real AbortSignal — passing it straight
    // through makes undici's fetch throw ("member signal is not of type
    // AbortSignal"), confirmed by actually running this against a real RPC
    // call. Cancellation is a separate concern from the SSRF guard this
    // file exists for, so it is deliberately not wired through here rather
    // than risk a half-correct bridge between the two signal types.
    const res = await guardedFetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body ?? undefined,
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return {
      statusCode: res.status,
      statusMessage: res.statusText,
      headers,
      body: bytes.length > 0 ? bytes : null,
    };
  };
  return req;
}
