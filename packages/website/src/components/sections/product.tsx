import { Section } from "@/components/section";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "@/components/code-block";
import { useLocale } from "@/i18n/context";
import { withInlineCode } from "@/i18n/inline-code";

function shorten(hex: string, head = 10, tail = 6): string {
  if (hex.length <= head + tail + 1) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

// Verzonnen voorbeeldwaarden, geen echte claim. Zie note-tekst hieronder en
// de "onafhankelijk geverifieerd"-sectie in Status voor de echte, live claim.
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

const historyResult = {
  sellerAddress: SELLER,
  count: 1,
  claims: [
    {
      sellerAddress: SELLER,
      buyerAddress: BUYER,
      assetType: "gpu-hours",
      delivered: "yes",
      settlementRef: recordDeliveryCall.arguments.settlementRef,
      timestamp: recordDeliveryCall.arguments.timestamp,
      claimId: recordDeliveryCall.arguments.claimId,
    },
  ],
  scope: "local-ledger",
  note: "This reflects only claims recorded on this installation's local ledger...",
};

export function Product() {
  const { t } = useLocale();

  return (
    <Section id="product" index="03" eyebrow={t.product.eyebrow}>
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{t.product.h2}</h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
        {withInlineCode(t.product.body)}
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <CodeBlock label={t.product.codeLabelRecordCall} code={JSON.stringify(recordDeliveryCall, null, 2)} />
          <CodeBlock label={t.product.codeLabelResult} code={JSON.stringify(recordDeliveryResult, null, 2)} />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <CodeBlock label={t.product.codeLabelHistoryCall} code={JSON.stringify(historyCall, null, 2)} />
          <CodeBlock label={t.product.codeLabelResult} code={JSON.stringify(historyResult, null, 2)} />
        </div>
      </div>
      <p className="mt-3 font-mono text-xs text-muted-foreground">{withInlineCode(t.product.note)}</p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {t.product.cards.map((card) => (
          <Card key={card.title}>
            <CardTitle>{card.title}</CardTitle>
            <CardContent className="text-muted-foreground">{withInlineCode(card.body)}</CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}
