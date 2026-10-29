// A count of how often the free checks are used, and nothing else.
//
// Until now the server stored nothing and logged nothing about a check, so nobody could say how many people used it. This writes ONE
// line per answered request on a free-check route: the route, the HTTP status and whether the request came from our own test client.
// It never writes an address, a repository name, a URL, a header value or anything that could identify a visitor.
//
// "Our own test client" is a request whose User-Agent starts with INTERNAL_AGENT. Anyone could send that, so it is not a security
// control: it only lets us keep our own tests out of the number we report as "used by others". A stranger who copies it makes the count of
// others a little lower, never higher.
//
// The line goes to stdout, which systemd keeps in the journal. It is a plain JSON object so a count is one grep away:
//   journalctl -u tokenizen-api -o cat | grep '"event":"free_check"'

import type { NextFunction, Request, RequestHandler, Response } from "express";

export const INTERNAL_AGENT = "tokenizen-internal-test";

export type UsageWriter = (line: string) => void;

/** The line for one answered request. Exported so a test can pin the exact keys: nothing else may ever be added without the privacy statement changing. */
export function usageLine(route: string, status: number, userAgent: string | undefined): string {
  return JSON.stringify({ event: "free_check", route, status, internal: (userAgent ?? "").startsWith(INTERNAL_AGENT) });
}

/** Counts every answer on the route it is placed in front of, including the ones the rate limiter turns away. */
export function usageLog(route: string, write: UsageWriter): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.on("finish", () => {
      try {
        write(usageLine(route, res.statusCode, req.get("user-agent")));
      } catch {
        // A failing log must never change an answer that is already sent.
      }
    });
    next();
  };
}
