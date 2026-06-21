// CLI: bootstrap a target repo with the devloop CI binding anchor + config skeleton.
// Usage: init <targetRepoPath> [--force]   (defaults to cwd). --force re-writes the workflow
// for a v0.1->v0.2 style migration. Thin wrapper over the tested core.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initRepo } from "../core/init.js";
const here = dirname(fileURLToPath(import.meta.url));
// Pin the reusable action to THIS devloop version (reproducible; bump via --force or by hand).
const version = JSON.parse(readFileSync(join(here, "..", "..", "package.json"), "utf8")).version;
const template = readFileSync(join(here, "..", "..", "templates", "ci-precondition-check.yml"), "utf8").replaceAll("${DEVLOOP_REF}", `v${version}`);
const force = process.argv.includes("--force");
const repo = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? ".";
const result = initRepo(repo, template, { force });
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
