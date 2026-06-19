// CLI: guardian-precondition check. Exit 0 = all guardians present; exit 1 = missing.
// Usage: check-guardians <repoPath>   (defaults to cwd)
// Thin wrapper over the tested core — no logic here.
import { checkGuardians } from "../core/guardians.js";
const repo = process.argv[2] ?? ".";
const result = checkGuardians(repo);
process.stdout.write(JSON.stringify(result) + "\n");
process.exit(result.ok ? 0 : 1);
