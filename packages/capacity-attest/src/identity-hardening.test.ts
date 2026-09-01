// identity-hardening.test.ts — regression tests for the six ways two
// materially DIFFERENT claims could end up with the SAME claimId, or one
// claim with two different claimIds.
//
// WHY THIS FILE EXISTS SEPARATELY, and why it imports only the public
// surface (recordDelivery / computeClaimId / canonicalize) and never
// StrictClaimContentSchema by name:
//
//   Every enforcing test below must FAIL against the previously published
//   0.1.2 code and PASS against this one. A test that names an internal
//   symbol which simply did not exist in 0.1.2 would fail there with an
//   import error, which proves nothing about behaviour. Written against
//   recordDelivery() — the one and only write path, present in both versions
//   with the same signature — each test instead fails for the real reason:
//   0.1.2 ACCEPTS the malformed claim, this version REFUSES it.
//
//   Verification actually performed (not just intended): src/schema.ts and
//   src/tools.ts were reverted to their 0.1.2 state with `git stash`, this
//   file was run, and the enforcing tests failed. See CHANGELOG 0.1.3.
//
// The tests come in pairs on purpose:
//   - a DOCUMENTING test that pins the collision/divergence itself on the
//     frozen hash route (passes in both versions — the preimage function is
//     deliberately unchanged, see schema.ts), and
//   - an ENFORCING test that the claim can no longer get INTO the ledger.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalize, computeClaimId, ClaimContentSchema, type ClaimContent, type DeliveryClaim } from "./schema.js";
import { signClaim, verifyClaim } from "./signing.js";
import { recordDelivery, getDeliveryHistory } from "./tools.js";
import { evidenceHash, testWallet } from "./test-helpers.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "capacity-attest-identity-test-"));
  process.env["CAPACITY_ATTEST_DATA_DIR"] = tmpDir;
});

afterEach(() => {
  delete process.env["CAPACITY_ATTEST_DATA_DIR"];
  rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Build a claim whose signature is genuinely valid over its own (possibly
 * malformed) content. That matters: if the signature were wrong, every test
 * below would pass for the wrong reason — the claim would be refused as
 * signature_invalid rather than by the ingest rule under test.
 */
async function signedClaimWith(overrides: Record<string, unknown>): Promise<DeliveryClaim> {
  const wallet = testWallet();
  const content = {
    sellerAddress: "0x00000000000000000000000000000000000000aa",
    buyerAddress: wallet.address,
    assetType: "gpu-hours" as const,
    promisedSpec: "1x A100, 4 hours",
    delivered: "yes" as const,
    evidenceHash: evidenceHash("identity-hardening"),
    settlementRef: "0x" + "11".repeat(32),
    timestamp: "2026-08-30T12:00:00.000Z",
    ...overrides,
  } as unknown as ClaimContent;
  const { claimId, signature } = await signClaim(wallet, content);
  return { ...(content as object), claimId, signature } as DeliveryClaim;
}

/** The claim really is internally consistent — used to prove the setup is honest. */
async function assertSignatureIsValid(claim: DeliveryClaim): Promise<void> {
  expect(verifyClaim(claim)).toEqual({ ok: true });
}

// ---------------------------------------------------------------------------
// DEFECT 1 — evidenceHash was case-sensitive on the hash route.
// ---------------------------------------------------------------------------

describe("defect 1: evidenceHash hoofdlettergevoeligheid", () => {
  it("documenteert het lek: dezelfde evidenceHash in andere schrijfwijze geeft een andere claimId", () => {
    const base = {
      sellerAddress: "0x00000000000000000000000000000000000000aa",
      buyerAddress: "0x00000000000000000000000000000000000000bb",
      assetType: "gpu-hours" as const,
      promisedSpec: "1x A100, 4 hours",
      delivered: "yes" as const,
      settlementRef: "0x" + "11".repeat(32),
      timestamp: "2026-08-30T12:00:00.000Z",
    };
    const lower = computeClaimId({ ...base, evidenceHash: "a".repeat(64) } as ClaimContent);
    const upper = computeClaimId({ ...base, evidenceHash: "A".repeat(64) } as ClaimContent);
    // Still true, and deliberately so: the preimage function is frozen, so
    // this asymmetry is closed by refusing the input, not by re-hashing it.
    expect(lower).not.toBe(upper);
  });

  it("ENFORCING: een claim met upper-case evidenceHash komt de ledger niet meer in", async () => {
    const claim = await signedClaimWith({ evidenceHash: "A".repeat(64) });
    await assertSignatureIsValid(claim);

    const result = await recordDelivery(claim);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/evidenceHash must be lower-case hex/);
  });

  it("ENFORCING: de dubbele-claim-omzeiling is daarmee dicht", async () => {
    const hex = evidenceHash("same evidence, two spellings");
    const first = await signedClaimWith({ evidenceHash: hex });
    const recased = await signedClaimWith({ evidenceHash: hex.toUpperCase() });

    expect((await recordDelivery(first)).ok).toBe(true);
    // In 0.1.2 this second claim was accepted: different claimId, same
    // evidence, so appendClaim()'s duplicate check never saw it.
    expect((await recordDelivery(recased)).ok).toBe(false);
    expect((await getDeliveryHistory(first.sellerAddress)).count).toBe(1);
  });

  it("laat gewone lower-case evidenceHash ongemoeid", async () => {
    const claim = await signedClaimWith({ evidenceHash: evidenceHash("normal") });
    expect((await recordDelivery(claim)).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DEFECT 2 — NaN / Infinity / -Infinity / null / -0 / undefined collisions.
// ---------------------------------------------------------------------------

describe("defect 2: niet-eindige getallen botsen op dezelfde claimId", () => {
  const idFor = (spec: unknown) =>
    computeClaimId({
      sellerAddress: "0x00000000000000000000000000000000000000aa",
      buyerAddress: "0x00000000000000000000000000000000000000bb",
      assetType: "gpu-hours",
      promisedSpec: spec,
      delivered: "yes",
      evidenceHash: "a".repeat(64),
      settlementRef: "0x" + "11".repeat(32),
      timestamp: "2026-08-30T12:00:00.000Z",
    } as ClaimContent);

  it("documenteert de viervoudige botsing: NaN, Infinity, -Infinity en null hashen identiek", () => {
    const ids = [NaN, Infinity, -Infinity, null].map((v) => idFor({ x: v }));
    expect(new Set(ids).size).toBe(1);
  });

  it("documenteert de vijfde en zesde botsing: -0 met 0, en een undefined-waarde met een ontbrekende sleutel", () => {
    expect(idFor({ x: -0 })).toBe(idFor({ x: 0 }));
    // JSON.stringify laat een undefined-waarde helemaal weg, dus {a:undefined,b:1}
    // krijgt exact de identiteit van {b:1}.
    expect(idFor({ a: undefined, b: 1 })).toBe(idFor({ b: 1 }));
  });

  it.each([
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
  ])("ENFORCING: %s wordt geweigerd bij het opslaan", async (_label, value) => {
    const claim = await signedClaimWith({ promisedSpec: { x: value } });
    await assertSignatureIsValid(claim);

    const result = await recordDelivery(claim);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/NaN or Infinity/);
  });

  it("ENFORCING: -0 en een undefined-waarde worden ook geweigerd", async () => {
    const minusZero = await recordDelivery(await signedClaimWith({ promisedSpec: { x: -0 } }));
    expect(minusZero.ok).toBe(false);
    if (!minusZero.ok) expect(minusZero.reason).toMatch(/-0/);

    const undef = await recordDelivery(await signedClaimWith({ promisedSpec: { a: undefined, b: 1 } }));
    expect(undef.ok).toBe(false);
  });

  it("ENFORCING: de check werkt diep in geneste objecten en arrays, niet alleen op het bovenste niveau", async () => {
    const deep = await signedClaimWith({ promisedSpec: { a: { b: [{ c: [{ d: Infinity }] }] } } });
    const result = await recordDelivery(deep);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/NaN or Infinity/);
  });

  it("de diepte-check blijft niet-recursief: 5000 niveaus geeft een nette weigering, geen stack overflow", async () => {
    let deep: Record<string, unknown> = { end: 1 };
    for (let i = 0; i < 5000; i++) deep = { nest: deep };
    // Mag niet crashen; welke weigeringsreden precies (diepte of grootte)
    // is hier niet het punt, wél dat het proces overleeft.
    const result = await recordDelivery(await signedClaimWith({ promisedSpec: deep }).catch(() => ({}) as DeliveryClaim));
    expect(result.ok).toBe(false);
  });

  it("laat null zelf gewoon toe: het is een geldige JSON-waarde en moet onderscheidbaar blijven van NaN", async () => {
    const claim = await signedClaimWith({ promisedSpec: { x: null } });
    expect((await recordDelivery(claim)).ok).toBe(true);
  });

  it("laat gewone gehele getallen toe", async () => {
    const claim = await signedClaimWith({ promisedSpec: { hours: 4, gpus: 1 } });
    expect((await recordDelivery(claim)).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DEFECT 3 — key sort order diverges from a code-point sort in other languages.
// ---------------------------------------------------------------------------

describe("defect 3: sleutelvolgorde wijkt af van een code-point-sortering", () => {
  const KEYS = ["a", "é", "！", "\u{1F600}"];

  function codePointSort(keys: string[]): string[] {
    return [...keys].sort((a, b) => {
      const A = [...a];
      const B = [...b];
      for (let i = 0; i < Math.min(A.length, B.length); i++) {
        const d = A[i]!.codePointAt(0)! - B[i]!.codePointAt(0)!;
        if (d !== 0) return d;
      }
      return A.length - B.length;
    });
  }

  it("documenteert de divergentie: JS sorteert U+1F600 vóór U+FF01, een code-point-sortering andersom", () => {
    expect([...KEYS].sort()).toEqual(["a", "é", "\u{1F600}", "！"]);
    expect(codePointSort(KEYS)).toEqual(["a", "é", "！", "\u{1F600}"]);
    expect([...KEYS].sort()).not.toEqual(codePointSort(KEYS));
  });

  it("ENFORCING: een sleutel met een astraal teken komt de ledger niet meer in", async () => {
    const spec: Record<string, number> = {};
    for (const k of KEYS) spec[k] = 1;
    const claim = await signedClaimWith({ promisedSpec: spec });
    await assertSignatureIsValid(claim);

    const result = await recordDelivery(claim);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/surrogate code units/);
  });

  it("ENFORCING: ook een losse surrogate als sleutel, op elke diepte", async () => {
    const claim = await signedClaimWith({ promisedSpec: { a: { b: { ["x\uD800y"]: 1 } } } });
    const result = await recordDelivery(claim);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/surrogate code units/);
  });

  it("voor alle overgebleven (BMP-)sleutels is de JS-sortering per definitie gelijk aan een code-point-sortering", () => {
    // Dit is de eigenlijke reden dat S-5 defect 3 volledig sluit in plaats van
    // half: onder U+10000 zijn UTF-16-code-units en code points hetzelfde
    // getal, dus kan de standaard `.sort()` daar niet afwijken.
    const bmp = ["a", "Z", "0", "é", "！", "中", "~", "_", ""];
    expect([...bmp].sort()).toEqual(codePointSort(bmp));
    const spec: Record<string, number> = {};
    for (const k of bmp) spec[k] = 1;
    expect(canonicalize(spec)).toBe(JSON.stringify(Object.fromEntries(codePointSort(bmp).map((k) => [k, 1]))));
  });

  it("laat gewone niet-ASCII BMP-sleutels toe", async () => {
    const claim = await signedClaimWith({ promisedSpec: { "région": "eu-west", "中文": "ok" } });
    expect((await recordDelivery(claim)).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DEFECT 4 — timestamp accepted many forms for the same instant.
// ---------------------------------------------------------------------------

describe("defect 4: timestamp accepteert meerdere vormen voor hetzelfde moment", () => {
  it("documenteert het lek: vier vormen, vier verschillende claimIds op de bevroren route", () => {
    const forms = ["2026-09-01T10:00:00.000Z", "2026-09-01", "August 30, 2026", "2026-09-01T10:00:00+02:00"];
    const ids = forms.map((timestamp) =>
      computeClaimId({
        sellerAddress: "0x00000000000000000000000000000000000000aa",
        buyerAddress: "0x00000000000000000000000000000000000000bb",
        assetType: "gpu-hours",
        promisedSpec: "1x A100",
        delivered: "yes",
        evidenceHash: "a".repeat(64),
        settlementRef: "0x" + "11".repeat(32),
        timestamp,
      } as ClaimContent),
    );
    expect(new Set(ids).size).toBe(4);
  });

  it("maand 13 werd al door het bevroren schema geweigerd — Date.parse geeft daar NaN, dus die vorm was nooit ondertekenbaar", () => {
    expect(Number.isNaN(Date.parse("2026-13-01T00:00:00Z"))).toBe(true);
    // 30 februari daarentegen KOMT door Date.parse heen (de ISO-parser
    // controleert alleen dag 01-31, niet per maand), en werd dus wel
    // geaccepteerd. Die zit daarom in de lijst hieronder.
    expect(Number.isNaN(Date.parse("2026-02-30T00:00:00Z"))).toBe(false);
  });

  it.each(["2026-09-01", "August 30, 2026", "2026-09-01T10:00:00+02:00", "2026-09-01T10:00:00", "2026-02-30T00:00:00Z"])(
    "ENFORCING: timestamp %j wordt geweigerd bij het opslaan",
    async (timestamp) => {
      const claim = await signedClaimWith({ timestamp });
      await assertSignatureIsValid(claim);

      const result = await recordDelivery(claim);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/timestamp must be a strict UTC instant/);
    },
  );

  it("accepteert precies wat new Date().toISOString() produceert", async () => {
    const claim = await signedClaimWith({ timestamp: new Date().toISOString() });
    expect((await recordDelivery(claim)).ok).toBe(true);
  });

  it("weigert een instant zonder fractie, want dat is een tweede spelling van hetzelfde moment", async () => {
    // Deze test stond eerst omgekeerd (verwachtte true). Dat legde het gat
    // vast in plaats van het te dichten: zonder fractie, met een, twee of
    // negen cijfers zijn allemaal spellingen van hetzelfde moment, en elk
    // kreeg een eigen claimId. Een verkoper kon daarmee dezelfde levering
    // vijf keer vastleggen met dezelfde settlementRef, zonder dat de
    // dubbele-claim-check ooit afging. Nu geldt: precies drie cijfers, dus
    // precies een spelling per milliseconde.
    const claim = await signedClaimWith({ timestamp: "2026-09-01T10:00:00Z" });
    const r = await recordDelivery(claim);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/timestamp/i);
  });

  it("accepteert de vorm die de echte producent uitzendt (drie fractiecijfers)", async () => {
    const claim = await signedClaimWith({ timestamp: "2026-09-01T10:00:00.000Z" });
    expect((await recordDelivery(claim)).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DEFECT 5 (found while verifying defect 3) — S-6.
// ---------------------------------------------------------------------------

describe("defect 5 (nieuw gevonden): losse surrogates in promisedSpec-STRINGS", () => {
  const LONE = "gpu \uD800 spec";

  it("documenteert waarom dit dezelfde klasse fout is als defect 3: de string heeft geen UTF-8-codering", () => {
    expect(Buffer.from(LONE, "utf8").toString("utf8")).not.toBe(LONE);
    // JavaScript verbergt het probleem: JSON.stringify ontsnapt het netjes,
    // dus binnen JS lijkt alles in orde.
    expect(JSON.stringify(LONE)).toContain("\\ud800");
  });

  it("ENFORCING: een losse surrogate in de string-tak wordt geweigerd", async () => {
    const claim = await signedClaimWith({ promisedSpec: LONE });
    await assertSignatureIsValid(claim);

    const result = await recordDelivery(claim);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/lone surrogates/);
  });

  it("ENFORCING: ook in een string-waarde diep in de object-tak", async () => {
    const claim = await signedClaimWith({ promisedSpec: { a: { b: [{ note: LONE }] } } });
    const result = await recordDelivery(claim);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/lone surrogates/);
  });

  it("laat astrale tekens in string-WAARDEN wel toe: die coderen prima in UTF-8, alleen sleutelvolgorde was dubbelzinnig", async () => {
    const claim = await signedClaimWith({ promisedSpec: { note: "\u{1F600} geleverd" } });
    expect((await recordDelivery(claim)).ok).toBe(true);
  });

  it("laat C0-stuurtekens in promisedSpec bewust wel toe: JSON ontsnapt ze deterministisch en promisedSpec is vrije tekst", async () => {
    const claim = await signedClaimWith({ promisedSpec: "regel 1" + String.fromCharCode(10) + "regel 2" });
    expect((await recordDelivery(claim)).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// THE HARD REQUIREMENT — the real, already-recorded production claim.
// ---------------------------------------------------------------------------

describe("de echte, al opgeslagen claim uit data-selftest/claims.jsonl", () => {
  const REAL_CLAIM_ID = "0xc008b7b38e8a80061d525ac1cfe08c4f48244612dcf7f2a1b61b82c16fccac29";
  const REAL_SETTLEMENT_REF = "0xc00a638491986962ca125c01da4e3df8a07d715216694bb0a59ff257c88e6880";
  // De EXACTE bytes die gehasht worden. Dit is de scherpste vorm van de
  // bevriezing: verandert er iets aan sortKeysDeep(), aan een .transform() op
  // de hash-route, of aan welke sleutels in de preimage zitten, dan valt deze
  // ene vergelijking om, ook als de sha256 er per ongeluk toevallig nog uit
  // zou komen.
  const REAL_PREIMAGE =
    '{"assetType":"api-credits","buyerAddress":"0xf11ce7141daecec9624ec3ccf49b437d40a0ad20","delivered":"yes",' +
    '"evidenceHash":"b3f1577e906501b75df4a4e8eaf0bc7e57bd009113df52b492db01cbdd0b9baf",' +
    '"promisedSpec":{"description":"PoolTogether draw scans + recente claims (live self-test 2026-08-31)",' +
    '"endpoint":"https://wazir-x402.duckdns.org/api/pt","priceUsdc":"0.001"},' +
    '"sellerAddress":"0x015eb036560216b3051339061ff68a207e0fe88f",' +
    '"settlementRef":"0xc00a638491986962ca125c01da4e3df8a07d715216694bb0a59ff257c88e6880",' +
    '"timestamp":"2026-08-31T18:06:48.102Z"}';

  function loadReal(): DeliveryClaim {
    const line = readFileSync(new URL("../data-selftest/claims.jsonl", import.meta.url), "utf8").trim().split("\n")[0]!;
    return JSON.parse(line) as DeliveryClaim;
  }

  it("staat er nog en is de claim van de echte USDC-betaling op Base", () => {
    const real = loadReal();
    expect(real.claimId).toBe(REAL_CLAIM_ID);
    expect(real.settlementRef).toBe(REAL_SETTLEMENT_REF);
  });

  it("hasht nog steeds naar exact dezelfde claimId", () => {
    expect(computeClaimId(loadReal())).toBe(REAL_CLAIM_ID);
  });

  it("heeft nog exact dezelfde preimage-bytes", () => {
    const real = loadReal();
    expect(canonicalize(ClaimContentSchema.parse(real))).toBe(REAL_PREIMAGE);
    expect(Buffer.byteLength(REAL_PREIMAGE, "utf8")).toBe(545);
  });

  it("de handtekening erop is nog steeds geldig", () => {
    expect(verifyClaim(loadReal())).toEqual({ ok: true });
  });

  it("overleeft ALLE ingest-regels: hij zou vandaag opnieuw opgeslagen mogen worden", async () => {
    // De strengste vorm van de eis. Niet alleen "de hash klopt nog", maar:
    // geen van de zes verscherpingen hierboven raakt deze echte claim.
    const result = await recordDelivery(loadReal());
    expect(result).toEqual({ ok: true, claimId: REAL_CLAIM_ID });

    const history = await getDeliveryHistory("0x015eb036560216b3051339061ff68a207e0fe88f");
    expect(history.count).toBe(1);
    expect(history.claims[0]!.claimId).toBe(REAL_CLAIM_ID);
  });
});
