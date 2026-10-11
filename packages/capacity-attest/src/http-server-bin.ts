#!/usr/bin/env node
// http-server-bin.ts — the actual process entrypoint for capacity-attest-http.
// Deliberately does nothing but call startServer(): see the comment on that
// function in http-server.ts for why the entrypoint logic lives in its own
// file instead of a self-detection guard inside the library module itself.
import { startServer } from "./http-server.js";

startServer();
