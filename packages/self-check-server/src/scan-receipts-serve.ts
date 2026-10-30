// scan-receipts-serve.ts: shows the public list of delivered scan reports (see scan-receipts.ts) over HTTP, read only.
//
// The daily run (bench/scan-receipts-daily.sh) writes into one directory: scan-receipts.jsonl, and a head-<day>.txt with its .ots stamp
// next to it. This serves exactly those files and nothing else. The visitor never chooses a path: the list is one fixed file name, and a head
// file is looked up by a name that must match one strict pattern, so ../ or an absolute path cannot get through. What the files hold is
// already public by design (hashes, outcome, coverage, time; no repository, no buyer, no report).

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Request, Response } from "express";

const LIST_FILE = "scan-receipts.jsonl";
const HEAD_NAME = /^head-\d{8}-\d{4}\.txt(\.ots)?$/;
const MAX_BYTES = 8 * 1024 * 1024;

const notFound = (res: Response, what: string): void => {
  res.status(404).json({ error: what });
};

async function readCapped(path: string): Promise<Buffer | null> {
  try {
    const data = await readFile(path);
    return data.length <= MAX_BYTES ? data : null;
  } catch {
    return null;
  }
}

/** Handlers for the three read-only routes. With no directory configured every route answers 404, as if it did not exist. */
export function scanReceiptsHandlers(dir: string | undefined) {
  return {
    list: async (_req: Request, res: Response): Promise<void> => {
      if (!dir) return notFound(res, "not found");
      const data = await readCapped(join(dir, LIST_FILE));
      if (!data) return notFound(res, "the list has not started yet");
      res.set("Cache-Control", "public, max-age=300");
      res.type("text/plain; charset=utf-8").status(200).send(data);
    },
    heads: async (_req: Request, res: Response): Promise<void> => {
      if (!dir) return notFound(res, "not found");
      let names: string[] = [];
      try {
        names = (await readdir(dir)).filter((n) => HEAD_NAME.test(n)).sort();
      } catch {
        return notFound(res, "the list has not started yet");
      }
      res.set("Cache-Control", "public, max-age=300");
      res.status(200).json({ files: names });
    },
    head: async (req: Request, res: Response): Promise<void> => {
      if (!dir) return notFound(res, "not found");
      const name = String(req.params.name ?? "");
      if (!HEAD_NAME.test(name)) return notFound(res, "not found");
      const data = await readCapped(join(dir, name));
      if (!data) return notFound(res, "not found");
      res.set("Cache-Control", "public, max-age=300");
      res.type(name.endsWith(".ots") ? "application/octet-stream" : "text/plain; charset=utf-8").status(200).send(data);
    },
  };
}
