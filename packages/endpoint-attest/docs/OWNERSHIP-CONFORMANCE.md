# Ownership proof: conformance vectors

An endpoint owner proves they control an endpoint by publishing a token we derive, the same way
ACME proves domain control before issuing a certificate. This document is the whole derivation,
written so that an independent implementation can check itself against ours without asking us for
anything.

The vectors live in [`examples/ownership-challenge-testvector.json`](../examples/ownership-challenge-testvector.json).
They are generated from this implementation and re-checked against it by `ownership-conformance.test.ts`
on every CI run, so the file cannot drift away from the code it claims to describe.

The secret in that file is public on purpose. It exists so the vectors are reproducible by anyone.
Never use it for a real attester.

## Normalising the endpoint

Before anything is hashed, the endpoint is reduced to a canonical form:

1. Parse it as a URL. Only `http` and `https` are accepted. A URL carrying credentials is rejected.
2. Drop the query and the fragment.
3. Strip a trailing slash from the path, unless the path is exactly `/`.
4. Result: `scheme://host[:port]path`.

The port is part of the identity. `https://mcp.example.com/sse` and `https://mcp.example.com:8443/sse`
are different endpoints and get different tokens.

This matters more than it looks. A token bound only to the host would authorise an attestation, and a
consent-gated active probe, for every scheme, port and path on that host. Anyone who could read a
published proof could then point the attester at `http://victim:6379/anything` and use it as a probe.

## Deriving the tokens

Two tokens exist, and they are deliberately different.

The ownership token, which proves control of the endpoint:

```
message = normalizedEndpoint + LF + lowercase(ownerAddress)
token   = "tok_" + hex(HMAC_SHA256(secret, message))
```

The active test consent token, which authorises an actual probe of the endpoint:

```
message = "active-test-consent" + LF + normalizedEndpoint + LF + lowercase(ownerAddress)
token   = "consent_" + hex(HMAC_SHA256(secret, message))
```

`LF` is a single newline, U+000A. The hex is lowercase.

The prefixes differ too: an ownership token starts with `tok_` and a consent token with
`consent_`, so the two are distinguishable on sight as well as cryptographically.

The consent message is prefixed, which is what keeps the two apart. Because a hostname cannot contain
a newline and neither can an address, the two messages can never collide, so a consent token can never
equal an ownership token for the same pair and neither can be replayed as the other.

## Where the tokens are published

| Proof | DNS record | File |
| --- | --- | --- |
| Ownership | `_endpoint-attest.<host>` TXT | `/.well-known/endpoint-attest.txt` |
| Active test consent | `_endpoint-attest-active-consent.<host>` TXT | `/.well-known/endpoint-attest-active-consent.txt` |

The DNS label is prefixed to the endpoint's host. One host can carry many endpoints' tokens side by
side, because verification scans every record for an exact match rather than assuming there is one.

## Checking your own implementation

No dependencies, any language. Here it is in Python:

```python
import hmac, hashlib, json
from urllib.parse import urlsplit

def normalize(endpoint):
    u = urlsplit(endpoint)
    assert u.scheme in ("http", "https")
    path = u.path or ""
    if len(path) > 1 and path.endswith("/"):
        path = path[:-1]
    return f"{u.scheme}://{u.netloc}{path}"

def ownership_token(endpoint, owner, secret):
    msg = normalize(endpoint) + "\n" + owner.lower()
    mac = hmac.new(secret.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return "tok_" + mac

vectors = json.load(open("ownership-challenge-testvector.json"))
for case in vectors["cases"]:
    got = ownership_token(case["endpoint"], case["ownerAddress"], vectors["secret"])
    assert got == case["ownershipToken"], case["name"]
print("all vectors match")
```

If that prints `all vectors match`, your derivation agrees with ours on every case, including the
ones that are easy to get wrong: a trailing slash, a query string, a fragment, the case of the owner
address, and the fact that a port or a path changes the endpoint.

## What this proof does and does not establish

It establishes that whoever published the token controlled that DNS name or that web server at the
moment it was read. That is the same thing ACME establishes, and it is genuinely useful.

It does not establish that the endpoint is safe, well built, or honest. We never sign a verdict of
that kind, because a check can show that something is wrong and can never show that nothing is.

One honest limit, stated here rather than discovered later: a DNS record or a file that stays in place
after a domain changes hands keeps proving the old owner's control. This is inherent to every control
proof built on DNS or HTTP, ACME's included, and it is the reason certificates expire rather than a
reason not to use them. Our attestations expire for the same reason: control is re-proven at every
renewal, so a stale record can only carry a claim for the remaining life of one attestation.
