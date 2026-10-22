// bazaar-discovery.test.ts — validates each declaration against
// @x402/extensions/bazaar's OWN validator, not a hand-rolled shape check.
// self-check-server's own x402-seller.ts documents exactly why this matters:
// a catalogue entry that looks fine by eye and fails the real spec validator
// is "worse than no promise", and was found only by running the real
// validator, not by reading the code.
import { describe, it, expect } from "vitest";
import { validateDiscoveryExtension } from "@x402/extensions/bazaar";
import { declareRecordDeliveryBazaarDiscovery, declarePublishReputationFeedbackBazaarDiscovery } from "./bazaar-discovery.js";

describe("bazaar discovery declarations validate against @x402/extensions/bazaar's real validator", () => {
  it("record_delivery", () => {
    const declaration = declareRecordDeliveryBazaarDiscovery();
    const bazaarEntry = Object.values(declaration)[0];
    const result = validateDiscoveryExtension(bazaarEntry as never);
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
  });

  it("publish_reputation_feedback", () => {
    const declaration = declarePublishReputationFeedbackBazaarDiscovery();
    const bazaarEntry = Object.values(declaration)[0];
    const result = validateDiscoveryExtension(bazaarEntry as never);
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
  });

  it("each declared inputSchema actually has real properties, not an empty object from a bad zod call", () => {
    const recordDelivery = Object.values(declareRecordDeliveryBazaarDiscovery())[0] as never as { info: { input: { inputSchema: { properties?: Record<string, unknown> } } } };
    const feedback = Object.values(declarePublishReputationFeedbackBazaarDiscovery())[0] as never as { info: { input: { inputSchema: { properties?: Record<string, unknown> } } } };
    expect(Object.keys(recordDelivery.info.input.inputSchema.properties ?? {}).length).toBeGreaterThan(5);
    expect(Object.keys(feedback.info.input.inputSchema.properties ?? {}).length).toBeGreaterThan(3);
  });
});
