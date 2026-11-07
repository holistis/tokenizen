// test-euipo-auth.mjs — one-off connectivity check: can we get an OAuth2
// token from EUIPO with the credentials in .env? Prints only the HTTP
// status and a truncated, non-secret summary of the response, never the
// credentials themselves.
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const vars = Object.fromEntries(
  envText
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx), l.slice(idx + 1).trim()];
    }),
);

const tokenRes = await fetch("https://euipo.europa.eu/cas-server-webapp/oidc/accessToken", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: vars.EUIPO_CLIENT_ID,
    client_secret: vars.EUIPO_CLIENT_SECRET,
  }),
  signal: AbortSignal.timeout(15000),
});
const tokenJson = await tokenRes.json();
console.log("token status:", tokenRes.status, "| expires_in:", tokenJson.expires_in);
const accessToken = tokenJson.access_token;

const queries = [
  "https://api.euipo.europa.eu/trademark-search/trademarks?query=wordMarkSpecification.verbalElement==Kepler",
  "https://api.euipo.europa.eu/trademark-search/trademarks?query=Kepler",
  "https://api.euipo.europa.eu/trademark-search/",
];

for (const url of queries) {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, "X-IBM-Client-Id": vars.EUIPO_CLIENT_ID },
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    console.log(`\n=== ${url} ===`);
    console.log("status:", res.status);
    console.log("body (first 800 chars):", text.slice(0, 800));
  } catch (e) {
    console.log(`\n=== ${url} ===`);
    console.log("FOUT:", e.message);
  }
}
