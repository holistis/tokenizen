# How we check our own paid endpoints

A paid endpoint does not usually fall over. It keeps answering 200, keeps taking money,
and returns something quietly wrong. Uptime monitoring catches none of that, because
nothing is down.

On 18 October 2026 we found four of those on our own endpoints in a single day. None of
them would have triggered a heartbeat check:

1. Four paid routes accepted payment and returned `{"error":"use_special_handler"}`, an
   internal placeholder. The buyer paid and received a sentinel. One of those routes is
   priced at two dollars.
2. Our only row in the Coinbase discovery index carried another company's name, SDK and
   documentation links. We had adopted that company's self-description convention in
   August and never replaced the example values, so for months anyone who found us in
   that index learned their name instead of ours.
3. Our own conformance checker was wrongly failing 38 of the 59 sellers in a 60 host
   sample that do ask for payment, because it probed with POST and they serve GET.
4. Dutch placeholder text (`<titel van een geaccepteerde finding>`) sat in a response a
   paying customer received.

All four were found the same way: by buying our own product the way a stranger buys it.
So that is now a scheduled job.

## Three axes, kept apart

The job reports three results per route, separately, because they fail separately.

```
VORM        does the endpoint ask for payment the way x402 says (level 0)
IDENTITEIT  is our own name still in the self-description, and nobody else's
INHOUD      does a paying customer get a real answer, or a sentinel
```

Keeping them apart is the point. An endpoint that returns a correct 402 and then sells a
placeholder is broken in the way that costs the most and shows the least. If that
collapses into one green or red light, the expensive case hides behind the cheap one.

The identity axis has a forbidden list as well as a required one. That half is what would
have caught defect 2: the problem there was not a missing link, it was a present name
belonging to someone else.

One detail from building it, because it is the kind of thing that makes a check useless.
Our first forbidden list contained the bare word `piprail`. That also matches the
extension key we deliberately keep, since it is their published convention and it is
useful to agents. So the list now forbids the identity claims (`"name":"PipRail"`,
`@piprail/sdk`, `piprail.com`) and not the convention. Our own test found that, not us.

## A failure is not a finding

A 429 or a 5xx is our own rate limit or an outage, not a defect in the product. Those
report NOT MEASURED, never a deviation. A watchman that cries wolf gets ignored, and then
it protects nothing.

The same rule runs the other way. If the balance read that guards the paid round cannot
be performed, the round does not run. Not being able to measure is never permission.

## It does not repair anything, on purpose

For a bot, restarting is safe. For a paid answer, automatically rolling back your own
content is riskier than the fault. So the job compares against an approved snapshot of
price, recipient and network, and reports. A human repairs.

## The security shape, which is the part worth copying

An automated buyer needs a signing key. So the question is not whether that machine is
ever compromised. The question is what an intruder finds.

Two decisions follow from that, and both are checks rather than intentions.

The daily round runs without any key. It measures VORM and IDENTITEIT only, and those are
exactly the two that catch a changed name, a changed price and a changed payee. There is
nothing to steal from the task that runs every day.

The paid round refuses above a named ceiling:

```
MAX_SALDO_USDC = 2
```

Above that, it does not buy, and it says why. The balance is read from the chain rather
than from our own bookkeeping, because a number we maintain ourselves can be stale
exactly when it matters. That turns "keep the hot wallet empty" from a habit into a
condition, so nobody, ourselves included, can attach something valuable to a daily job by
accident.

## What an adversarial review found in the watchman itself

We ran three independent adversarial reviews over this job before trusting it. They found
four real defects in the checker, and they are worth naming because they are the kind a
checker is most likely to have.

The exit code could never fire. The alarm condition was gated on a flag the daily run
does not pass, so an endpoint that was completely unreachable reported NOT MEASURED and
then exited 0. Our product could have been down while this said nothing was wrong. That
is the same class of failure the job exists to catch, inside the job.

There was no recipient. The result went to a log file nobody reads and cron discarded
the exit code. A check with no recipient is theatre. It now sends a message, and only on a
deviation, because a watchman that reports good news daily gets filtered out within a week.

The watchman broke its own update path. Its log file was tracked in git and appended on
every run, which is exactly the state in which git pull aborts. The scheduled job would
then have quietly run yesterday code. The reviewer reproduced that on a fixture rather than
reasoning about it.

And the one that mattered most: we validated a different request than the one that pays.
The checker read the price and the payee from its own unpaid request. Payment happens in a
separate process making its own request, where the library selects the first entry of a
filtered list. Those are different entries as soon as the first one is filtered out, and
one of our own routes already returns two offers. So a party able to impersonate our domain
could have put a cheap offer carrying our real payee first, for the check, and an expensive
offer carrying their own payee behind it, for the payment. The check would have gone green.
The only real ceiling was a one dollar default inside a dependency, two hundred times the
price we expected, changeable by an update with no diff on our side.

The fix is not a better check in the same place. It is the same check in the only binding
place: the function that decides which offer gets paid. Network, scheme, payee, amount and
authorization lifetime are asserted there, and it refuses rather than chooses when anything
fails. We proved the refusal by triggering it: a ceiling of one atomic unit refuses with
the amount in the message, a foreign payee refuses with the address, and neither spends
anything.

If you take one thing from this section: a limit checked on an earlier request is not a
limit. It is an observation that happens to have been true once.

## What the job does not cover, which we found by looking

We publish eleven paid routes. The scheduled job checks two of them. That is worth
stating plainly, because a check with partial coverage reads from the outside like a check
with full coverage, and the difference is invisible until something breaks in the part
nobody looks at.

While writing this section we probed the other nine by hand and one answered oddly. A POST
to the site check route with no request body returns 400 and no payment requirements at
all, so an automated buyer cannot discover the price. With a valid body the same route
returns a correct 402 carrying its twenty thousand atomic units. The cause is ordering: the
route validates the request body before it looks at payment, which is right in itself, but
it means the one response a stranger is most likely to receive first is the one that does
not tell him what the thing costs.

We are not reporting that as a defect we fixed, because we have not fixed it yet. We are
reporting it as what partial coverage buys you: the two routes in the job are the two we
know about.

## Copy the shape, not our code

The code is specific to our endpoints. The shape is not:

- buy your own paid routes on a schedule, the way a stranger would
- check the answer, not the status code
- keep the axes apart, so the expensive failure cannot hide behind the cheap one
- let the automated path hold no secret, and cap what the secret can reach
- report, do not repair

If you run a paid endpoint, the first run is likely to find something. Ours found four.
