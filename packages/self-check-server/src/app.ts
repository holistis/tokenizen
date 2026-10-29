// app.ts — the HTTP surface behind tokenizen.nl/check.
//
// WHY THIS PACKAGE EXISTS AT ALL: the ownership-proof logic
// (challengeToken/verifyOwnership in endpoint-attest, getOwnershipChallenge
// in trust-attest-server) uses node:crypto and node:dns, which a browser
// cannot run. This is the thin, real (non-mock) backend a browser page can
// call instead — it does not reimplement any of that logic, only wires it up
// over HTTP, plus the two protections that logic never needed when its only
// caller was an MCP client: the net-guard egress choke-point (every real
// DNS/HTTP call goes through net-guard's IP-validating, IP-pinning guarded
// fetch/resolver) and a per-IP rate limit (rate-limit.ts), because this is
// now reachable by any anonymous visitor.
//
// THREE ROUTES, MATCHING THE FREE/PAID SPLIT IN trust-attest-server:
//   POST /api/challenge        — free, no network call, derives the token.
//   POST /api/verify-ownership — free, ONE real DNS/HTTP check of whatever
//                                 the visitor already published. This is the
//                                 ownership proof only — it does not run
//                                 trust-attest-server's paid checks and does
//                                 not sign an attestation. That is
//                                 deliberate: requestTrustAttestation is the
//                                 PAID tool (checks + signed attestation),
//                                 and this page must not trigger a paid
//                                 action from a free "verify" button. Wiring
//                                 request_trust_attestation behind real
//                                 payment (mcp-paywall / x402) is left for a
//                                 later, separate change — see the website's
//                                 /check page copy, which says so plainly
//                                 rather than hiding a stub behind a working
//                                 button.
//   POST /api/paid/verify-ownership — the same ownership proof, settled over
//                                 x402 first, answering with a signed
//                                 offer-receipt alongside the proof. The
//                                 receipt IS the product here: the answer
//                                 itself stays free above. Present only when a
//                                 seller is configured; see x402-seller.ts for
//                                 why a price we cannot settle must never be
//                                 advertised, and why this still does not
//                                 trigger trust-attest-server's paid checks or
//                                 sign an attestation.

import cors from "cors";
import express, { type Express, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import {
  ETH_ADDRESS_RE,
  OWNERSHIP_METHODS,
  endpointHost,
  verifyOwnership,
  type OwnershipCheckDeps,
  type OwnershipMethod,
} from "endpoint-attest";
import { getOwnershipChallenge, type GetOwnershipChallengeResult } from "trust-attest-server/dist/server.js";
import { loadOwnershipSecret, type OwnershipContext } from "trust-attest-server/dist/attester-identity.js";
import {
  assertPubliclyRoutableHost,
  assertHostnameLiteralSafe,
  UnsafeHostError,
  guardedFetch,
  resolveTxtGuarded,
  type RoutableHostDeps,
} from "tokenizen-net-guard";
import { readSellerConfig, buildPaymentMiddleware, type SellerConfig } from "./x402-seller.js";
import { createRateLimiter } from "./rate-limit.js";
import { handleConformance } from "./x402-conformance.js";
import { handleBadge, handleBadgeJson } from "./x402-badge.js";
import { createX402Checker, handleX402Check, type X402CheckerOptions } from "./x402-check.js";
import { createCraChecker, handleCraCheck, type CraCheckerOptions } from "./cra-check.js";
import { usageLog, type UsageWriter } from "./usage-log.js";
import { bodyCallsATool, craMcpLimitedAsToolResult, craMcpMethodNotAllowed, craMcpRejectBatch, handleCraMcp } from "./cra-mcp.js";

const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "https://tokenizen.nl", "https://www.tokenizen.nl"];

export interface CreateAppOptions {
  /**
   * x402 seller configuration. Omit to read it from the environment, which is
   * what production does. Pass null in a test to keep the paid route off even
   * when the environment happens to carry a key.
   */
  seller?: SellerConfig | null | undefined;

  /**
   * The ownership-challenge secret (HMAC) to use — NOT a full signing identity.
   * This edge issues and verifies ownership challenges but never signs an
   * attestation, so it deliberately holds only the secret, never the
   * attestation signing key (that key would be pure attack surface on the one
   * component any anonymous visitor can reach). Defaults to loadOwnershipSecret(),
   * which reads TRUST_ATTEST_OWNERSHIP_SECRET — set it to the SAME value the
   * signing server uses, so challenges issued here match what that server
   * expects. A full AttesterIdentity also satisfies this type (tests pass one).
   */
  identity?: OwnershipContext;
  /** Injected into verifyOwnership — lets tests supply a fake DNS/fetch instead of touching the network. In production this defaults to net-guard's guardedFetch + resolveTxtGuarded, so the real ownership fetch is IP-validated and pinned, not just pre-checked. */
  ownershipDeps?: OwnershipCheckDeps;
  /** Injected into the early host pre-check — lets tests supply a fake DNS lookup instead of touching the network. */
  routableHostDeps?: RoutableHostDeps;
  /** Origins allowed to call this API. Defaults to the production domains + the local Vite dev server. */
  allowedOrigins?: string[];
  /**
   * Express `trust proxy` setting, which decides how req.ip is resolved and
   * therefore what the per-IP rate limiter keys on. Default false (req.ip is
   * the direct socket address). Behind a proxy/CDN this MUST be set to the
   * exact number of trusted proxy hops (e.g. 1), NEVER `true`: `true` trusts a
   * client-supplied X-Forwarded-For end to end, so a caller could spoof it to
   * get a fresh rate-limit bucket per request. Left false, a proxied
   * deployment keys everyone on the proxy's IP (over-limiting, not bypass) —
   * fail-safe, but set the hop count for correct per-client limits.
   */
  trustProxy?: boolean | number | string;
  /** Rate limit for the (real network I/O) verify-ownership route. Defaults to 10 requests / 5 minutes per IP. */
  verifyRateLimit?: { windowMs: number; max: number };
  /**
   * Rate limit for the PAID verify-ownership route, with its OWN bucket.
   *
   * It shared the free route's bucket, which let anyone spend a paying customer's
   * budget with free calls. Falls back to verifyRateLimit when unset, so nothing
   * changes for an existing caller except that the two no longer drain each other.
   */
  paidRateLimit?: { windowMs: number; max: number };
  /** Rate limit for the (no network I/O) challenge route. Defaults to 30 requests / 5 minutes per IP — looser, since it is pure local HMAC, same posture trust-attest-server's own comments describe for get_ownership_challenge. */
  challengeRateLimit?: { windowMs: number; max: number };
  /**
   * The free live x402 check (POST /api/x402/check). `rateLimit` is the per-IP limit, 8 requests / 10 minutes
   * by default; the rest are the checker's own cache and per-host/global budgets, and the injectable egress
   * that tests use instead of the network. See x402-check.ts for why this route exists next to the badge.
   */
  x402Check?: X402CheckerOptions & { rateLimit?: { windowMs: number; max: number } };
  /**
   * The free CRA readiness check of a public GitHub repository (POST /api/cra/check). `rateLimit` is the per-IP
   * limit, 6 requests / 10 minutes by default. See cra-check.ts for the limits that sit behind it.
   */
  craCheck?: CraCheckerOptions & { rateLimit?: { windowMs: number; max: number } };
  /**
   * Where the one-line count of every free-check answer is written (usage-log.ts: route, status, own-client flag, nothing that identifies
   * a visitor). Unset means nothing is written, which is what the tests want; server.ts sets it to the process log.
   */
  usageWriter?: UsageWriter;
}

const ChallengeBody = z.object({
  endpoint: z.string().min(1).max(2048),
  ownerAddress: z.string().regex(ETH_ADDRESS_RE, "ownerAddress must be a 0x-prefixed 20-byte address"),
});

const VerifyBody = z.object({
  endpoint: z.string().min(1).max(2048),
  ownerAddress: z.string().regex(ETH_ADDRESS_RE, "ownerAddress must be a 0x-prefixed 20-byte address"),
  method: z.enum(OWNERSHIP_METHODS),
});

function badRequest(res: Response, message: string): void {
  res.status(400).json({ ok: false, error: message });
}

/** Resolves the host out of `endpoint` and rejects it if it is not publicly routable. Returns null (and has already responded) on failure, so callers can `if (!(await guard(...))) return;`. */
async function guardEndpointHost(endpoint: string, res: Response, deps?: RoutableHostDeps): Promise<boolean> {
  let host: string;
  try {
    host = endpointHost(endpoint);
  } catch (e) {
    badRequest(res, (e as Error).message);
    return false;
  }
  try {
    await assertPubliclyRoutableHost(host, deps);
  } catch (e) {
    if (e instanceof UnsafeHostError) {
      // Do NOT echo e.message: it embeds the RESOLVED address (e.g. "resolves
      // to 10.1.2.3, a private address"), which would turn this endpoint into
      // an internal-DNS recon oracle for an anonymous caller. A generic
      // rejection is enough for the legitimate user.
      badRequest(res, "endpoint host is not publicly routable");
      return false;
    }
    throw e;
  }
  return true;
}

/**
 * A NON-RESOLVING host guard for the challenge route: rejects an obviously
 * internal host LITERAL (loopback/private/metadata/.internal) cheaply, without
 * any DNS query. The challenge route opens no connection, so there is nothing
 * to SSRF-pre-filter by resolution — running a lookup there would be a
 * gratuitous internal-DNS recon oracle (and would leak the resolved IP). The
 * literal is caller-supplied, so refusing it leaks nothing.
 */
function guardEndpointLiteralOnly(endpoint: string, res: Response): boolean {
  let host: string;
  try {
    host = endpointHost(endpoint);
  } catch (e) {
    badRequest(res, (e as Error).message);
    return false;
  }
  try {
    assertHostnameLiteralSafe(host);
  } catch (e) {
    if (e instanceof UnsafeHostError) {
      badRequest(res, "endpoint host is not permitted");
      return false;
    }
    throw e;
  }
  return true;
}

/**
 * Zet een storing in de afrekening om in een eerlijk antwoord, en zet de res daarna terug.
 *
 * OP MODULEBEREIK EN GEEXPORTEERD, met opzet. Deze twee sluiten over niets uit createApp
 * heen, en binnen createApp waren ze niet te toetsen: onze eigen keuring moest de wrapper
 * letterlijk kopieren om hem te kunnen meten, en een test op een kopie meet de kopie. Nu
 * meet de test het echte ding.
 */
export const BETAAL_STORING = {
  ok: false,
  error: "settlement is temporarily unavailable, so no payment was taken and no receipt was issued",
};

export const betaalstoringNaar503 = (_req: Request, res: Response, next: NextFunction): void => {
  const origJson = res.json.bind(res);
  const origSend = res.send.bind(res);
  const origSendStatus = res.sendStatus.bind(res);

  // ALLE DRIE DE UITGANGEN, niet alleen res.json. Gemeten: @x402/express antwoordt met
  // res.send voor een html-lichaam, dus die weg liep gewoon om deze omzetting heen en
  // leverde de koper een kale 500. res.sendStatus idem.
  const naar503 = (watErGebeurde: unknown): boolean => {
    if (res.headersSent) return false;
    if (res.statusCode !== 500) return false;
    console.error("[app] the paid route answered 500, reported to the buyer as 503:", watErGebeurde);
    res.status(503);
    origJson(BETAAL_STORING);
    return true;
  };

  res.json = ((lichaam: unknown) => (naar503(lichaam) ? res : origJson(lichaam as never))) as typeof res.json;
  res.send = ((lichaam: unknown) => (naar503(lichaam) ? res : origSend(lichaam as never))) as typeof res.send;
  res.sendStatus = ((code: number) => {
    if (code === 500 && !res.headersSent) {
      console.error("[app] the paid route answered sendStatus 500, reported to the buyer as 503");
      res.status(503);
      origJson(BETAAL_STORING);
      return res;
    }
    return origSendStatus(code);
  }) as typeof res.sendStatus;

  // En de terugzetter hangt aan dit verzoek, zodat de volgende middleware hem kan
  // aanroepen zonder de sluitingen hierboven nog eens op te bouwen.
  (res as unknown as { __herstelAntwoord?: () => void }).__herstelAntwoord = () => {
    res.json = origJson as typeof res.json;
    res.send = origSend as typeof res.send;
    res.sendStatus = origSendStatus as typeof res.sendStatus;
  };
  next();
};

/**
 * Zet de originele res-uitgangen terug zodra de betaalmiddleware heeft doorgegeven.
 *
 * DIT IS DE HELE REPARATIE, en zonder deze stap herschreef de wrapper ook een 500 uit
 * ONZE EIGEN handler, die niets met afrekenen te maken heeft. Een echte fout kreeg dan
 * een vals excuus mee, en dat is erger dan een kale 500: de koper krijgt te horen dat
 * er niets is afgeschreven, terwijl de storing ergens anders zat. Van buitenaf is niet
 * te zien welke code een 500 gaf, maar wel WIE het antwoord op dat moment in handen
 * had, en dat is de grens die hier getrokken wordt.
 */
export const herstelAntwoord = (_req: Request, res: Response, next: NextFunction): void => {
  (res as unknown as { __herstelAntwoord?: () => void }).__herstelAntwoord?.();
  next();
};

export function createApp(options: CreateAppOptions = {}): Express {
  const identity = options.identity ?? loadOwnershipSecret();
  const allowedOrigins = options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS;
  // Production egress for the one real network call this server makes goes
  // through net-guard: the fetch is IP-validated and pinned, closing the gap
  // where the old code pre-checked the host but then fetched with a raw,
  // re-resolving global fetch. Tests inject their own stubs.
  const ownershipDeps: OwnershipCheckDeps =
    options.ownershipDeps ?? { fetchImpl: guardedFetch, resolveTxtRecords: (name) => resolveTxtGuarded(name) };
  const challengeLimiter = createRateLimiter({
    windowMs: options.challengeRateLimit?.windowMs ?? 5 * 60 * 1000,
    max: options.challengeRateLimit?.max ?? 30,
  });
  const verifyLimiter = createRateLimiter({
    windowMs: options.verifyRateLimit?.windowMs ?? 5 * 60 * 1000,
    max: options.verifyRateLimit?.max ?? 10,
  });
  // EEN EIGEN EMMER VOOR DE BETAALDE ROUTE. Hij deelde die met de gratis route, en
  // dat is tegen de regel die rate-limit.ts zelf opschrijft: een limiet PER AANROEPER
  // op alles wat echt werk doet. De betaalde route doet MEER werk dan de gratis
  // (hij praat ook met een facilitator), en een gedeelde emmer betekent dat iemand
  // met gratis verzoeken het budget van de betalende klant kan opmaken. Dat is geen
  // bescherming, dat is een dicht te drukken verdienroute.
  const paidLimiter = createRateLimiter({
    windowMs: options.paidRateLimit?.windowMs ?? options.verifyRateLimit?.windowMs ?? 5 * 60 * 1000,
    max: options.paidRateLimit?.max ?? options.verifyRateLimit?.max ?? 10,
  });

  const { rateLimit: x402CheckRateLimit, ...x402CheckerOptions } = options.x402Check ?? {};
  const x402CheckLimiter = createRateLimiter({
    windowMs: x402CheckRateLimit?.windowMs ?? 10 * 60 * 1000,
    max: x402CheckRateLimit?.max ?? 8,
  });
  const x402Checker = createX402Checker({ routableHostDeps: options.routableHostDeps, ...x402CheckerOptions });

  const { rateLimit: craCheckRateLimit, ...craCheckerOptions } = options.craCheck ?? {};
  const craCheckLimiter = createRateLimiter({
    windowMs: craCheckRateLimit?.windowMs ?? 10 * 60 * 1000,
    max: craCheckRateLimit?.max ?? 6,
  });
  const craChecker = createCraChecker(craCheckerOptions);

  // The one-line count of free-check answers (usage-log.ts). Nothing is written unless the server gave a writer.
  const counted = (route: string): RequestHandler[] => (options.usageWriter ? [usageLog(route, options.usageWriter)] : []);

  const app = express();
  app.disable("x-powered-by");
  // Decides how req.ip (the rate-limit key) is resolved. Default false; behind
  // a proxy set options.trustProxy to the exact hop count, never true (see the
  // option's doc — true lets a client spoof X-Forwarded-For past the limiter).
  app.set("trust proxy", options.trustProxy ?? false);
  app.use(
    cors({
      origin: allowedOrigins,
      methods: ["GET", "POST"],
    }),
  );
  // Small body limit: every field here is short (a URL, an address, a
  // method name) — nothing about this API legitimately needs a large body.
  app.use(express.json({ limit: "16kb" }));

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // Een levende testbestemming voor offer-receipt 5.6. Statische, al-publieke
  // waarden en een GET zonder parameters, dus geen invoer om te misbruiken.
  // Staat ACHTER de challenge-limiter: hij is goedkoop maar niet gratis, en een
  // publieke route zonder limiet is precies wat de rate-check verbiedt.
  app.get("/api/x402/conformance", challengeLimiter, handleConformance);

  // A badge an operator can paste in his own README, and its json twin. Both answer
  // from a dated, bundled measurement and never measure live: measuring on request
  // would let anyone use this server to probe arbitrary hosts, on our address. See
  // x402-badge.ts for why the caller's url never reaches the rendered svg.
  app.get("/api/x402/badge", challengeLimiter, handleBadge);
  app.get("/api/x402/badge.json", challengeLimiter, handleBadgeJson);

  // The live twin of the badge: measures the visitor's own endpoint now. It is the one place that
  // reverses the badge's "never measure live" rule, on purpose and behind its own limiter plus the
  // per-host and global budgets inside the checker. See the header of x402-check.ts.
  app.post("/api/x402/check", ...counted("x402"), x402CheckLimiter, handleX402Check(x402Checker));

  // The free CRA readiness check of a public GitHub repository. The visitor chooses an owner/repo pair, never
  // a host, and the egress is the same net-guard fetch. Behind its own limiter plus a global hourly budget and
  // a one hour cache inside the checker. See the header of cra-check.ts.
  app.post("/api/cra/check", ...counted("cra"), craCheckLimiter, handleCraCheck(craChecker));

  // The same check as an MCP tool for AI agents (cra-mcp.ts), stateless, POST only. A request that calls the tool costs a check, so it uses
  // the check limiter above (same six per ten minutes per address); the other messages of the protocol (initialize, tools/list, pings) use
  // a looser limiter so that one agent can connect and look around without using up its checks.
  const mcpOtherLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 60 });
  const mcpLimiter: RequestHandler = (req, res, next) => (bodyCallsATool(req.body) ? craCheckLimiter : mcpOtherLimiter)(req, res, next);
  // Only a tool call is counted as use: connecting, listing and pings are protocol traffic, four lines for one check would overstate it.
  const countedToolCalls: RequestHandler[] = options.usageWriter
    ? [(req, res, next) => (bodyCallsATool(req.body) ? usageLog("mcp", options.usageWriter!)(req, res, next) : next())]
    : [];
  app.post("/mcp", ...countedToolCalls, craMcpRejectBatch, craMcpLimitedAsToolResult, mcpLimiter, handleCraMcp(craChecker));
  app.get("/mcp", craMcpMethodNotAllowed);
  app.delete("/mcp", craMcpMethodNotAllowed);

  app.post("/api/challenge", challengeLimiter, async (req: Request, res: Response) => {
    const parsed = ChallengeBody.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const { endpoint, ownerAddress } = parsed.data;
    // Literal-only guard: reject an obviously-internal host LITERAL cheaply, but
    // do NOT resolve. This route opens no connection (pure local HMAC), so the
    // old resolving check was a gratuitous internal-DNS recon oracle on the
    // loose-limit tier; a name that merely RESOLVES to an internal address is
    // harmless to derive a token for and is blocked for real at verify time by
    // guardedFetch. getOwnershipChallenge also validates the URL shape.
    if (!guardEndpointLiteralOnly(endpoint, res)) return;

    const result: GetOwnershipChallengeResult = getOwnershipChallenge({ endpoint, ownerAddress }, identity);
    if (!result.ok) {
      badRequest(res, result.error);
      return;
    }
    res.status(200).json(result);
  });

  // One implementation, two routes. The paid route differs only in that a
  // payment is settled first and a signed receipt comes back with the answer;
  // a second copy of this logic would be a second thing to keep correct.
  const handleVerifyOwnership = async (req: Request, res: Response): Promise<void> => {
    const parsed = VerifyBody.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const { endpoint, ownerAddress, method } = parsed.data;
    if (!(await guardEndpointHost(endpoint, res, options.routableHostDeps))) return;

    const proof = await verifyOwnership(
      method as OwnershipMethod,
      endpoint,
      ownerAddress,
      identity.ownershipSecret,
      ownershipDeps,
    );
    res.status(200).json(proof);
  };

  app.post("/api/verify-ownership", verifyLimiter, async (req: Request, res: Response) => {
    await handleVerifyOwnership(req, res);
  });

  // The paid twin, and only when a seller is actually configured. Unconfigured
  // means no 402 and no route at all, because advertising a price we cannot
  // settle would be a false promise. See x402-seller.ts for why this exists:
  // the buyer's half of a delivery record has nothing to name while no seller
  // emits receipts.
  const seller = options.seller === undefined ? readSellerConfig(process.env) : options.seller;
  // A THIRD PARTY MUST NOT BE ABLE TO CLOSE OUR FREE DOOR. Building the payment
  // middleware constructs a facilitator client, so anything wrong out there (an
  // unusable url, a client that reaches for /supported while being constructed)
  // threw right here, at app construction, and took down every free route with it:
  // health, challenge, verify-ownership, the badge and the conformance endpoint.
  // The paid route is one route; the free ones are the reason this server exists.
  //
  // What we do NOT do is mount the paid route anyway. Advertising a price we cannot
  // settle is a false promise, which is the same reason an unconfigured seller has
  // no paid route at all. So: loud on the way out, and the paid door stays shut.
  let betaalmiddleware: ReturnType<typeof buildPaymentMiddleware> | null = null;
  if (seller) {
    try {
      betaalmiddleware = buildPaymentMiddleware(seller);
    } catch (error) {
      console.error(
        "[app] the paid route could not be built, so it is NOT mounted. Every free route stays up:",
        error,
      );
    }
  }

  /**
   * Een onbereikbare facilitator is onze storing, niet die van de koper, en hij
   * hoort dat te horen in plaats van een kale 500 te krijgen.
   *
   * GEMETEN, en anders dan de keuring vermoedde. Die dacht dat een kapotte
   * facilitator het hele proces kon afsluiten. Dat reproduceert NIET: de
   * betaalmiddleware wordt lui opgebouwd en reikt pas bij het eerste verzoek naar
   * buiten. Wat er wel gebeurde, met een adres dat niet oplost: de betaalde route
   * antwoordde `500 Internal Server Error` en niets meer. Voor een koper is dat niet
   * te onderscheiden van "dit product is stuk", terwijl het ware antwoord is "wij
   * kunnen nu niet afrekenen, er is niets betaald". 503 met een korte, ware regel.
   * De details blijven in ons eigen log, niet in het antwoord: daarin staat de naam
   * van onze facilitator en een stapeldump.
   */
  /**
   * Zet een storing in de afrekening om in een eerlijk antwoord, VOOR de
   * betaalmiddleware aan het woord komt.
   *
   * WAAROM DIT GEEN FOUTOPVANGER IS, en dat is gemeten in plaats van aangenomen. Een
   * express-foutopvanger kan hier niets, want de betaalmiddleware GOOIT niet: hij
   * antwoordt zelf, letterlijk `500 {"error":"Internal Server Error"}`, met een
   * onbereikbare facilitator. Voor een koper is dat niet te onderscheiden van "dit
   * product is stuk", terwijl het ware antwoord is dat wij nu niet kunnen afrekenen en
   * dat er niets is afgeschreven. Daarom wordt hier alleen dat ENE geval herschreven:
   * status 500 op de betaalde route. Al het andere gaat ongemoeid door, want een
   * middleware die meer herschrijft dan hij begrijpt verbergt de volgende storing.
   */


  // Tweede net, voor het geval de middleware ooit wel GOOIT in plaats van zelf te
  // antwoorden. Kost niets en vangt een vorm die de bovenstaande niet ziet.
  const betaalfoutmelder = (
    error: unknown,
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    if (res.headersSent) {
      next(error);
      return;
    }
    console.error("[app] the paid route could not settle:", error);
    res.status(503).json({
      ok: false,
      error: "settlement is temporarily unavailable, so no payment was taken and no receipt was issued",
    });
  };
  if (seller && betaalmiddleware) {
    // The payment middleware talks to a facilitator on every request it sees,
    // so it is mounted ON the paid path and BEHIND the limiter, never globally
    // with app.use. Mounted globally it would let an anonymous caller make this
    // server call out repeatedly, which is someone else's rate limit to pay.
    app.post(
      "/api/paid/verify-ownership",
      paidLimiter,
      betaalstoringNaar503,
      betaalmiddleware,
      herstelAntwoord,
      async (req: Request, res: Response) => {
        await handleVerifyOwnership(req, res);
      },
      betaalfoutmelder,
    );

    // A GET on the paid path used to fall through to Express's default handler,
    // which answers with an HTML page reading "Cannot GET /api/paid/...". That
    // page is what every person who clicks this URL in a browser sees, and this
    // URL is the one we hand to readers when we point at a live x402 route. The
    // first impression of the product was an error page.
    //
    // This answers 405 with an Allow header rather than 402, on purpose. A 402
    // would promise that paying gets you this resource by GET, and it does not;
    // 405 is what the method actually is, and the body says where to read the
    // terms. Naming the wrong status to look more x402-shaped would be the kind
    // of small untruth this whole project exists to avoid.
    app.get("/api/paid/verify-ownership", paidLimiter, (_req: Request, res: Response) => {
      res
        .status(405)
        .set("Allow", "POST")
        .json({
          ok: false,
          error: "method not allowed",
          detail:
            "This is a paid x402 endpoint and it answers POST. A GET cannot return the resource, so this is 405 rather than 402.",
          use: { method: "POST", contentType: "application/json" },
          terms: "/api/x402/conformance",
        });
    });
  }

  // A request the body parser refuses (malformed JSON, a body over the limit) is the caller's mistake,
  // not ours: answer it as such and log nothing. Falling through to the handler below logged the error
  // object, and the body parser's error carries the raw request body, which here is a URL that may hold
  // a secret in its query string. It also ran before any rate limit, so it was an unmetered log flood.
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const status = (err as { status?: unknown } | null)?.status;
    if (typeof status === "number" && status >= 400 && status < 500) {
      res.status(status).json({ ok: false, error: status === 413 ? "request body too large" : "request could not be read" });
      return;
    }
    next(err);
  });

  // Last resort: a route handler throwing (a bug, an unexpected rejection)
  // must never leak a stack trace to the caller (exposure-check) — respond
  // with a flat 500 and let the process's own logging capture the detail.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // eslint-disable-next-line no-console
    console.error("self-check-server: unhandled route error:", err);
    res.status(500).json({ ok: false, error: "internal error" });
  });

  return app;
}
