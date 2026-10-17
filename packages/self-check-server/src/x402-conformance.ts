// x402-conformance.ts — een levende testbestemming voor offer-receipt §5.6.
//
// WAAROM EEN ENDPOINT EN GEEN DOCUMENTPAGINA. Wie §5.6 implementeert heeft iets
// echts nodig om tegenaan te testen, en op het moment van schrijven is er geen
// andere live verkoper die payload-versie 2 uitgeeft. Een stuk tekst wordt
// gelezen en vergeten; een URL komt in iemands testsuite terecht en blijft daar.
// Dat is het verschil tussen gelezen worden en in het pad zitten.
//
// TWEE MANIEREN OM TE TESTEN, en de tweede is de echte. De vaste bonnetjes
// hieronder laten iemand zijn link-procedure narekenen zonder te betalen. Maar
// een vast bonnetje blijft een fixture: de scherpe test is zelf een VERS
// bonnetje halen door de betaalde route aan te roepen, want dan toetst hij ook
// het stuk dat met geen fixture te raken is, namelijk of het zout op de plek van
// §5.6.3 in een echte antwoord-envelop staat.
//
// WAT HIER WEL EN NIET IN MAG. Alleen waarden die al publiek zijn: bonnetjes die
// wij zelf hebben uitgegeven, hun zout, het asset, en transacties die op de keten
// staan. Geen sleutel, geen omgevingswaarde, geen adres dat nog niet publiek is.
// Dit is een GET zonder parameters, dus er is geen invoer om te misbruiken, en
// dat moet zo blijven: zodra hier een parameter bij komt hoort er validatie bij.
//
// WAAROM DE VERWACHTE UITKOMST HIER WEL STAAT en in agent-receipt-verify se
// `examples/` NIET: daar is het doel aantonen dat ons gereedschap het antwoord
// zelf vindt, dus mag het antwoord er niet in staan. Hier is het doel dat een
// VREEMDE zijn eigen implementatie kan toetsen, en dan heeft hij iets nodig om
// tegen te vergelijken. Zelfde data, tegengesteld doel.

import type { Request, Response } from "express";
import { SELLER_NETWORK } from "./x402-seller.js";

/** Base Sepolia USDC, het asset van de accepts-regel die betaald is. */
const ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

/**
 * Drie echte betalingen met IDENTIEKE voorwaarden, minuten na elkaar.
 *
 * Dat is met opzet de moeilijkste vorm: zonder commitment zijn deze drie
 * bonnetjes niet van elkaar te onderscheiden, want payer, payee, bedrag en
 * resource zijn gelijk. Een implementatie die ze toch elk aan hun eigen
 * afrekening koppelt, doet §5.6.4 goed. Een implementatie die er een verwisselt,
 * of die er een "waarschijnlijk" aan koppelt, valt hier door de mand.
 */
const CASES = [
  {
    id: "same-terms-1",
    authorizationSalt: "0xea85b2473363fd8fff1ccdd7f8638be8b47c7c05023e3e2e3f81bebb085ba2ad",
    receipt: {
      format: "eip712",
      payload: {
        version: 2,
        network: "eip155:84532",
        resourceUrl: "https://api.tokenizen.nl/api/paid/verify-ownership",
        payer: "0x87f344b6Ec48A936373d774D3De8649DEEB66Ee1",
        issuedAt: 1792187030,
        transaction: "",
        authorizationMethod: "eip3009",
        authorizationCommitment: "0x5c35a61a09a566a9c284fad18a70ac2ddfff34d01d2a3ce776ce94e8d5b38ff8",
      },
      signature:
        "0x78615cb22986af0aad6e08b74ca78773bb58ece21660e84e4b35b3e5c1841b0075238ca9bfdf0f969ad3f2903af8f391fafd1b3fc7ebbf1fb5c949a3948fccde1c",
    },
    expected: {
      settlementTransaction: "0xed87b09bfb20a8c8b69908e163fcea6432d193d389640c0465afcb5561dfeb30",
      authorizationNonce: "0x1120412c78ea1b2e8bf9eacfc3264c71a23ecd9b1fa579eb16030693344d5dfe",
      receiptSigner: "0x4E1174b774643B6AD9EE966A81ea1e3665D1159a",
    },
  },
  {
    id: "same-terms-2",
    authorizationSalt: "0x63072ea656fe922bf04c9cefc4275314d695fff01e5b57f6628c8df0252cc5dc",
    receipt: {
      format: "eip712",
      payload: {
        version: 2,
        network: "eip155:84532",
        resourceUrl: "https://api.tokenizen.nl/api/paid/verify-ownership",
        payer: "0x87f344b6Ec48A936373d774D3De8649DEEB66Ee1",
        issuedAt: 1792187518,
        transaction: "",
        authorizationMethod: "eip3009",
        authorizationCommitment: "0xfecee93e1aec7d6858a218bf324f23e2a4eed07925d8d4542b9662c5026e3d22",
      },
      signature:
        "0x02f5ba0d2b7928a2dbb1d8845b664a79d38eebcd0a2c4532ed3c6b922051bf8d47c8aafb0520a875a708e3ed480d84a537962ea90d66ce2ee3811f4229aa8b401b",
    },
    expected: {
      settlementTransaction: "0x2898d0ceb97ddf60af98e19c94fc0adddbdf1e64f9032e62454085e37acfe36b",
      authorizationNonce: "0x515895dfac6f148a4cfdf5c4f8266b7859dbd6534cdf77104b1be9f484eb5005",
      receiptSigner: "0x4E1174b774643B6AD9EE966A81ea1e3665D1159a",
    },
  },
  {
    id: "same-terms-3",
    authorizationSalt: "0x349ddb90f38a3119817c5fc9cc253a2c20bcbe44aa845302df76889082b314d8",
    receipt: {
      format: "eip712",
      payload: {
        version: 2,
        network: "eip155:84532",
        resourceUrl: "https://api.tokenizen.nl/api/paid/verify-ownership",
        payer: "0x87f344b6Ec48A936373d774D3De8649DEEB66Ee1",
        issuedAt: 1792188211,
        transaction: "",
        authorizationMethod: "eip3009",
        authorizationCommitment: "0xea8dd34b8beac90f021a4e8d893a689c25249f86947770c8e6647c1cde206008",
      },
      signature:
        "0x5b3a70cce6978ab44e51828b5ebbc55522e98b015045d94559d369420698da3b5309b28050dcb00ce14d65c8b230a273f8ff5ebff6410c6ae2a308e422ed5a611b",
    },
    expected: {
      settlementTransaction: "0x2a9e95d63a5af8210767baa69143b364dad51caffc29a152c77e03bc508d7199",
      authorizationNonce: "0x4b133bbec3ce0d8177a9010784faedb459f04384b45316bb526a5f96c90a70de",
      receiptSigner: "0x4E1174b774643B6AD9EE966A81ea1e3665D1159a",
    },
  },
] as const;

export function conformanceFixture() {
  return {
    about:
      "A live conformance target for the x402 offer-receipt extension, section 5.6 (authorization commitment). Point your implementation at this and check that it reaches the same settlements.",
    specification: {
      extension: "x402 offer-receipt, specs/extensions/extension-offer-and-receipt.md",
      sections: ["5.6.2 construction", "5.6.3 salt placement", "5.6.4 linking", "5.6.5 counting opened commitments only"],
      builtAgainstCommit: "0e492d6730bef14b9c722428386c114f3475a914",
      note: "Receipt payload version 2 is defined in x402-foundation/x402#3827, which is open at the time of writing, so the preimage can still change. The commit above is what these cases were produced against.",
    },

    // De scherpe route, en bewust eerst genoemd. Een vaste fixture toetst de
    // rekensom; alleen een echte aanroep toetst ook of het zout op de plek van
    // 5.6.3 in een levende antwoord-envelop staat.
    getYourOwnReceipt: {
      method: "POST",
      url: "https://api.tokenizen.nl/api/paid/verify-ownership",
      price: "0.001 USDC on Base Sepolia, which is test money",
      how: "Call it without payment to get a 402 carrying a signed offer, pay with any x402 client, and the settlement response carries a version 2 receipt with the salt beside it.",
      saltLocation: 'extensions["offer-receipt"].info.authorizationSalt',
      whyThisIsTheRealTest:
        "A fixture cannot tell you whether the salt arrives at the location 5.6.3 names, inside a real settlement envelope. Only a paid call can.",
    },

    replayableCases: {
      whatMakesTheseHard:
        "All three payments carry identical terms: same payer, same payee, same amount, same resource, minutes apart. Without the commitment these receipts cannot be told apart. An implementation that links each one to its own settlement has 5.6.4 right.",
      network: SELLER_NETWORK,
      asset: ASSET,
      youNeedAllThree:
        "Receipt, salt and asset. Section 5.6.4 is explicit that a receipt and a salt without the asset cannot link.",
      cases: CASES,
    },

    independentlyVerified: {
      by: "the author of the specification, using their own implementation, which shares no code with ours",
      where: "https://github.com/x402-foundation/x402/pull/3827#issuecomment-6230063003",
      result: "All three cases resolved to the settlements listed above.",
    },

    honestLimits: [
      "Buyer and seller are both us. This shows the construction works end to end, not that anyone else is using it.",
      "The transaction field in these receipts is empty, reported as x402-foundation/x402#3826, which is why the commitment is their only link route.",
      "Only the eip3009 method is covered here. The svm-memo rail is x402-foundation/x402#3830.",
    ],

    // Een artefact dat zijn eigen bronvermelding meedraagt. Wie hiertegen test
    // en er iets over zegt, heeft iets om naar te verwijzen, en dan hoeft die
    // verwijzing niet opnieuw bedacht te worden.
    citeAs:
      "tokenizen, x402 offer-receipt section 5.6 live conformance target, https://api.tokenizen.nl/api/x402/conformance",
    openSourceVerifier: "https://github.com/holistis/agent-receipt-verify",
    updated: "2026-10-17",
  };
}

/** GET zonder parameters, dus geen invoer om te valideren. Houd dat zo. */
export function handleConformance(_req: Request, res: Response): void {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(conformanceFixture());
}
