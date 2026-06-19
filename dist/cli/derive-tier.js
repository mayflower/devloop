// CLI: deterministic tier derivation. Reads {touched, tierMap} as JSON on stdin,
// writes {tier} on stdout. The tier map comes from the target repo's config.
// Thin wrapper over the tested core.
import { deriveTier } from "../core/tier.js";
import { readStdin } from "./_stdin.js";
const { touched, tierMap } = JSON.parse(await readStdin());
process.stdout.write(JSON.stringify({ tier: deriveTier(touched, tierMap) }) + "\n");
