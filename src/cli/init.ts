// CLI: bootstrap a target repo with the devloop CI binding anchor + config skeleton.
// Usage: init <targetRepoPath>   (defaults to cwd). Thin wrapper over the tested core.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initRepo } from "../core/init.js";

const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(
  join(here, "..", "..", "templates", "ci-precondition-check.yml"),
  "utf8",
);
const repo = process.argv[2] ?? ".";
const result = initRepo(repo, template);
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
