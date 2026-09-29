# Metered delivery (`measured`), capacity-attest 0.2.0

A claim proves that a payment happened. It does not, by itself, say how much
was delivered when the resource is metered or spans a duration (GPU-hours,
storage over a period, bandwidth over a window) instead of a single-shot
payload. The optional `measured` block closes that gap without changing
anything about how an unmeasured claim hashes or verifies.

This document describes the rules the schema already enforces
(`packages/capacity-attest/src/schema.ts`, `MeasuredSchema`). A worked,
self-contained, independently verifiable example is in
[`examples/metered-claim-testvector.json`](../examples/metered-claim-testvector.json)
(`node examples/verify-metered-example.mjs` reproduces it offline, signing key
included, never funded).

## Where it sits

`measured` is an optional key inside `ClaimContent`, hashed as part of the
same canonical preimage as every other field. An absent `measured` is absent
from both the parsed object and the canonical form, so an unmeasured claim's
`claimId` is byte-identical to what it was before this field existed. A claim
with `measured` present always has a different `claimId` than its unmeasured
twin, and the two are separate, non-duplicate ledger entries even when every
other field matches.

Putting `measured` inside the hashed content, rather than alongside it as
unsigned metadata, is deliberate: an older reader that does not know the key
must refuse the claim (`claimId_mismatch`) rather than silently accept
unverified measurement data. Refusing is the safe failure direction.

## Fields

```typescript
measured: {
  unit: string,              // enum, see "Units" below
  basis: "supplied" | "consumed",
  promisedAmount: string,    // canonical decimal string, see CDEC below
  deliveredAmount: string,   // canonical decimal string
  period: {
    start: string,           // canonical UTC instant, see CINST below
    end: string,
  },
  method: {
    attribution: "buyer" | "seller" | "third-party" | "undisclosed",
    instrument: string,      // 1..200 chars, free text
    readingsHash?: string,   // lower-case sha256 hex, 64 chars, optional
  },
}
```

The object is strict at every level (`measured`, `period`, `method`): an
unknown key is refused, not silently stripped. Stripping would let a producer
believe it sent data that in fact fell out of the hash.

### `basis`

Whether the number counts what the seller made available (`supplied`) or what
the buyer actually drew (`consumed`). No cross-field rule ties this to
`delivered` at the top level: a seller can deliver a full allowance the buyer
never draws on (`delivered: "yes"`, `basis: "consumed"`,
`deliveredAmount: "0"`), and a partial, late delivery can still measure 100%
of the promised quantity (`delivered: "partial"`, `deliveredAmount` equal to
`promisedAmount`). `deliveredAmount` is never capped at `promisedAmount`
either; over-delivery is representable.

### `promisedAmount` / `deliveredAmount`, CDEC (canonical decimal string)

ASCII digits only, never a locale-aware `\d` (JavaScript's `\d` and Python's
`\d` disagree on characters like U+0664; the regex is `[0-9]` explicitly so
this is identical in any language). No sign, no exponent, no leading zeros,
integer part 1..30 digits, optional fraction of 1..18 digits whose last digit
is not `0`. There is exactly one legal spelling per value in both directions.
`promisedAmount` additionally refuses `"0"` (a promise of nothing is
meaningless); `deliveredAmount` accepts `"0"` (measuring nothing is a
meaningful, legal claim).

### `period.start` / `period.end`, CINST (canonical UTC instant)

Exactly 20 characters, `YYYY-MM-DDTHH:MM:SSZ`. No offsets (refused, not
converted, since converting would be a transformation on the hash route), no
fractional seconds, no `24:00:00`, no leap second `:60`, no date-only form,
and the calendar date must be real (`2026-02-30` is refused; leap years follow
the standard divisible-by-4-except-100-unless-400 rule). Because every field
is fixed-width and pinned to `Z`, a plain lexicographic byte comparison of two
CINST strings is identical to chronological ordering, so no rule here needs a
date library.

`period.start` must be strictly before `period.end` (a zero-length window is
refused). `period.end`'s first 19 characters must be `<=` the claim's own
`timestamp`'s first 19 characters, so a fractional-second timestamp in the
same second as `period.end` still validates (naive full-string comparison
gets this wrong, since `"."  < "Z"`).

Note that `measured` presence tightens the claim's own top-level `timestamp`
too: with `measured` present, `timestamp` must be exactly the strict form
`YYYY-MM-DDTHH:MM:SS.sssZ` (exactly three fractional digits). Without
`measured`, the older, looser timestamp forms are still accepted for backward
compatibility.

### `method.attribution`

Who produced the number: `buyer`, `seller`, `third-party`, or `undisclosed`.
Provenance only, never a quality or trust ranking; nothing in this package
treats `third-party` as more reliable than `seller`. `undisclosed` exists
because attribution is mandatory: without an escape hatch, a producer
unwilling to name the source would have to pick an untrue value. Withholding
should be visible, not silent.

### `method.instrument`

Free text, 1..200 characters, e.g. `"nvidia-smi accounting, 10s polling"`. No
C0 control characters, no U+007F, no lone UTF-16 surrogates.

### `method.readingsHash`

Optional. Lower-case sha256 hex digest (64 characters, no `0x` prefix) of the
raw meter dump; the dump itself is not stored. Distinct from the claim's own
`evidenceHash`, which is about delivery evidence in general, not the meter
reading specifically. Its absence is itself meaningful (there either is a
pinned meter dump or there is not), which is why it is the only optional key
in `method`.

## Units, and which `assetType` allows which

```text
gpu-hours:   gpu-second
storage:     byte, byte-second
bandwidth:   byte
api-credits: call, token, credit
```

A literal table, not a derivation, so there is nothing to infer and nothing
that can differ between reimplementations in other languages. A `unit` not in
the claim's `assetType` row is refused.

## Canonical form and hashing

`claimId` is `'0x' + lowercase-hex(sha256(utf8(canonicalPreimage)))`, where
`canonicalPreimage` is the JSON-canonicalized, parsed `ClaimContent`
(addresses lower-cased, unknown top-level keys stripped, object keys sorted).
Key insertion order anywhere inside `measured` does not affect the id: a
`measured` block with every key reordered, at every nesting level, produces
the identical `claimId`.

Signing is EIP-191 `personal_sign` over the 66-character ASCII string form of
`claimId` (the `"0x" + 64 hex chars"` string itself, with the standard
`"\x19Ethereum Signed Message:\n66"` prefix), not over the 32 raw bytes. This
is the most likely mistake in an independent reimplementation, and the worked
example in `examples/metered-claim-testvector.json` exists specifically so it
can be checked against a known-good vector rather than re-derived from prose.

## Worked example

See [`examples/metered-claim-testvector.json`](../examples/metered-claim-testvector.json)
for a complete claim (2 x A100-80GB, 4 hours promised, 25230 of 28800
gpu-seconds actually supplied per `nvidia-smi` accounting), its exact
canonical preimage, byte length, `claimId`, and a valid signature from a
publicly known, never-funded test key. `node examples/verify-metered-example.mjs`
recomputes and checks every one of those values independently of this
package's own test suite.
