// Types for the two modules of agent-receipt-verify that x402-check.ts imports. The package is
// plain .mjs without type declarations, and a wrong guess at their shape would only show up at
// runtime, so the shape is written down here, once, next to the one place that uses it.

declare module "agent-receipt-verify/src/x402-conformance-check.mjs" {
  export type TredeStatus = "HAALT" | "HAALT_NIET" | "ONGEMETEN";
  export interface Meting {
    url: string;
    treden: Record<string, TredeStatus | undefined>;
    bewijs: Record<string, unknown>;
  }
  export function meetEindpunt(
    url: string,
    opties?: { fetchImpl?: typeof fetch; methode?: string; lichaam?: unknown },
  ): Promise<Meting>;
  export function hoogsteTrede(meting: Meting): number;
}

declare module "agent-receipt-verify/src/x402-conformance-treden.mjs" {
  export const TREDEN: ReadonlyArray<{ sleutel: string; nummer: number; naam: string; eis: string }>;
}
