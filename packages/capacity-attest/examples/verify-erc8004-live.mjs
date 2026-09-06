// verify-erc8004-live.mjs — echte, netwerk-aanroepende controle van
// resolveAgentIdentity() (src/erc8004.ts) tegen de daadwerkelijk gedeployde
// ERC-8004 Identity Registry op Base mainnet. Geen mocks: dit bewijst dat de
// D-007-implementatie echt met "de grote jongens" kan praten, niet alleen
// tegen een fake ContractFactory in erc8004.test.ts.
//
// Registry-adres geverifieerd 2026-09-06: eth_getCode tegen
// 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 op https://mainnet.base.org
// geeft echte bytecode terug (geen leeg adres), en ownerOf(2290)/tokenURI(2290)
// gaven de hieronder verwachte, echte waarden terug via een losse curl-call
// voordat dit script bestond. Dit script hertoetst diezelfde twee waarden
// via de ECHTE package-code (niet via handmatige calldata), zodat een
// toekomstige regressie in erc8004.ts (verkeerde ABI, verkeerde selector,
// verkeerde argument-encoding) hier zou opvallen ook al slagen alle gemockte
// tests in erc8004.test.ts nog.
//
// Draai met: npm run build && node examples/verify-erc8004-live.mjs
// Kost niets (alleen read-only eth_call's tegen een gratis publieke RPC),
// raakt geen wallet, geen betaling, geen schrijfactie.

import { resolveAgentIdentity } from "../dist/erc8004.js";

const REGISTRY_REF = "eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const AGENT_ID = "2290";
const RPC_URL = "https://mainnet.base.org";

// Vastgelegd op 2026-09-06 via een losse curl-aanroep tegen dezelfde
// live registry, voordat resolveAgentIdentity() hierop werd losgelaten.
// Als de eigenaar van agent 2290 ooit wijzigt (een echte, legitieme
// on-chain transfer) faalt dit script terecht — dat is geen bug in dit
// script, dat is precies waarom dit een LIVE controle is en geen frozen
// regression anchor zoals external-refs.test.ts.
const EXPECTED_OWNER = "0x715Dc035fFb97dD7bB4095C6670138BA05BB4E6d";
const EXPECTED_TOKEN_URI = "ipfs://bafkreifa2kvzjrtozvznce2bc3rwc7uzronxkm3w5fe2v6bjyfp52tci6e";

async function main() {
  const result = await resolveAgentIdentity({ agentRegistryRef: REGISTRY_REF, agentId: AGENT_ID, rpcUrl: RPC_URL });
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    console.error("FAIL: on-chain lookup did not succeed at all.");
    process.exit(1);
  }
  if (result.owner !== EXPECTED_OWNER) {
    console.error(`FAIL: owner mismatch — expected ${EXPECTED_OWNER}, got ${result.owner}`);
    process.exit(1);
  }
  if (result.tokenUri !== EXPECTED_TOKEN_URI) {
    console.error(`FAIL: tokenUri mismatch — expected ${EXPECTED_TOKEN_URI}, got ${result.tokenUri}`);
    process.exit(1);
  }
  console.log("\nPASS: resolveAgentIdentity() matches the real, live ERC-8004 registry on Base mainnet.");
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
