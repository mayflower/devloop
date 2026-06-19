// CLI: the driver's next action. Reads a DriverState as JSON on stdin, writes the next
// Action as JSON on stdout. This is the handoff point Command -> tested core: the
// Slash-Command calls this and OBEYS the result (the safety lives in the core, not the prompt).
import { nextAction } from "../core/driver.js";
import { readStdin } from "./_stdin.js";
const state = JSON.parse(await readStdin());
process.stdout.write(JSON.stringify(nextAction(state)) + "\n");
