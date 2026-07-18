#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const standaloneRoot = path.join(root, ".next", "standalone");
const serverPath = path.join(standaloneRoot, "server.js");

if (!fs.existsSync(serverPath)) {
  throw new Error("Missing .next/standalone/server.js. Run `pnpm build` before `pnpm start`.");
}

fs.cpSync(path.join(root, "public"), path.join(standaloneRoot, "public"), {
  recursive: true,
});
fs.cpSync(path.join(root, ".next", "static"), path.join(standaloneRoot, ".next", "static"), {
  recursive: true,
});
