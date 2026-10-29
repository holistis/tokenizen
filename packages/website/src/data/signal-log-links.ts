// The four payment links of the Signal log: Stripe payment links of generation v2, with the approved line next to the pay button.
// Created, read back and switched on on 29 October 2026. The prices behind them are the ones of the approved offer text
// (src/data/legal/signal-log.txt): Solo 9.95 euro per month or 99 euro per year, Team 29.95 euro per month or 299 euro per year, VAT included.

export const SIGNAL_LOG_LINKS = {
  solo: {
    month: "https://buy.stripe.com/00w9AT6cM2hZ7A79ib3oA05",
    year: "https://buy.stripe.com/9B6aEX30A3m3g6D3XR3oA06",
  },
  team: {
    month: "https://buy.stripe.com/eVq5kD0Ss8Gn2fN9ib3oA07",
    year: "https://buy.stripe.com/28EeVdfNm4q7dYv7a33oA08",
  },
} as const;
