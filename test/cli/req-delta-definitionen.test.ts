import { test, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist/cli/req-delta.js");
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

test("[REQ-REQDEF-5] CLI: fehlende alte Datei = leere Spec, zwei fette REQs -> beide added, Exit 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "reqdef-"));
  dirs.push(dir);
  const neu = join(dir, "neu.md");
  writeFileSync(
    neu,
    `# Spec

- **REQ-X-1** *(When)* — Wenn A,
  dann B.
- **REQ-X-2** *(If)* — Wenn C, dann D.

Siehe REQ-X-7 im Fliesstext.
`,
  );
  const r = spawnSync("node", [cli, join(dir, "gibt-es-nicht.md"), neu], { encoding: "utf8" });
  expect(r.status).toBe(0);
  expect(JSON.parse(r.stdout)).toEqual({ added: ["REQ-X-1", "REQ-X-2"], changed: [], removed: [] });
  expect(Object.keys(JSON.parse(r.stdout))).toEqual(["added", "changed", "removed"]);
});

test("[REQ-REQDEF-5] CLI: ohne neue Datei -> Exit 64 (unveraendert)", () => {
  const r = spawnSync("node", [cli], { encoding: "utf8" });
  expect(r.status).toBe(64);
});
