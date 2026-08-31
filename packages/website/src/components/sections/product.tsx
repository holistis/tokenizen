import { Section } from "@/components/section";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "@/components/code-block";

function shorten(hex: string, head = 10, tail = 6): string {
  if (hex.length <= head + tail + 1) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

const SELLER = shorten("0x9f1C1a3b7E2d4F5a6B8c9D0e1F2a3B4c5D6e7F80");
const BUYER = shorten("0x1a2B3c4D5e6F7089aB0c1D2e3F4a5B6c7D8e9F01");

const recordDeliveryCall = {
  tool: "record_delivery",
  arguments: {
    sellerAddress: SELLER,
    buyerAddress: BUYER,
    assetType: "gpu-hours",
    promisedSpec: { gpuModel: "A100", hours: 4, region: "us-east" },
    delivered: "yes",
    evidenceHash: shorten("8f3a1c9e4b7d2f60a1c8e3b9d7f4a2c6e8b1d3f5a9c7e2b4d6f8a1c3e5b7d9f0"),
    settlementRef: shorten(`0x${"aa".repeat(32)}`),
    timestamp: "2026-08-31T09:14:02.000Z",
    claimId: shorten(`0x${"7c2ee1a4f9b6d3082c5e7a1f4b9d6c3e8a2f5b7d1c4e9a6f3b8d2c5e7a1f4b9"}`),
    signature: shorten(`0x${"4b91e2c7a5f8d3016b9e4a7c2f5d8b1e4a7c0f3b6d9e2a5c8f1b4e7a0d3c6f9b2e5a8".slice(0, 130)}`),
  },
};

const recordDeliveryResult = {
  ok: true,
  claimId: recordDeliveryCall.arguments.claimId,
};

const historyCall = {
  tool: "get_delivery_history",
  arguments: { sellerAddress: SELLER },
};

const historyResult = [
  {
    sellerAddress: SELLER,
    buyerAddress: BUYER,
    assetType: "gpu-hours",
    delivered: "yes",
    settlementRef: recordDeliveryCall.arguments.settlementRef,
    timestamp: recordDeliveryCall.arguments.timestamp,
    claimId: recordDeliveryCall.arguments.claimId,
  },
];

export function Product() {
  return (
    <Section id="product" index="03" eyebrow="Het product: Capacity Attest">
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Een ondertekende, feitelijke leveringsclaim. Geen oordeel, geen score.
      </h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
        Na een x402-afwikkeling voor capaciteit (GPU-uren, opslag, API-credits, bandbreedte) laat de betalende
        agent een cryptografisch ondertekende claim achter: <code className="font-mono text-foreground">delivered</code>{" "}
        (yes/no/partial) plus een hash van het bewijsmateriaal, content-addressed en op een append-only ledger.
        Andere agents kunnen die geschiedenis opvragen vóórdat ze zelf zaken doen met een verkoper.
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <CodeBlock label="MCP tool-call → record_delivery" code={JSON.stringify(recordDeliveryCall, null, 2)} />
          <CodeBlock label="antwoord" code={JSON.stringify(recordDeliveryResult, null, 2)} />
        </div>
        <div className="flex flex-col gap-3">
          <CodeBlock label="MCP tool-call → get_delivery_history" code={JSON.stringify(historyCall, null, 2)} />
          <CodeBlock label="antwoord" code={JSON.stringify(historyResult, null, 2)} />
        </div>
      </div>
      <p className="mt-3 font-mono text-xs text-muted-foreground">
        Hashes, adressen en de handtekening zijn ingekort voor leesbaarheid. Het volledige schema staat in{" "}
        <code>packages/capacity-attest/src/schema.ts</code>.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle>record_delivery</CardTitle>
          <CardContent className="text-muted-foreground">
            De betalende agent roept dit aan ná een x402-afwikkeling. De server valideert eerst het schema, dan of{" "}
            <code>claimId</code> echt de hash van de inhoud is, en dan of <code>signature</code> terugrekent naar{" "}
            <code>buyerAddress</code>. Pas dan komt de claim op de append-only ledger.
          </CardContent>
        </Card>
        <Card>
          <CardTitle>get_delivery_history</CardTitle>
          <CardContent className="text-muted-foreground">
            Gegeven een <code>sellerAddress</code>: alle bekende, handtekening-geverifieerde claims tegen die
            verkoper, chronologisch. Puur feitelijk: geen gemiddelde, geen percentage, geen trust score.
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}
