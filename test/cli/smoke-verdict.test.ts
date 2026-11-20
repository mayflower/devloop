import { test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const script = resolve(root, "dist/cli/smoke-verdict.js");
const run = (input: unknown) => {
  const r = spawnSync("node", [script], { encoding: "utf8", input: typeof input === "string" ? input : JSON.stringify(input), cwd: root });
  return { status: r.status, out: JSON.parse(r.stdout) };
};
const report = (pass: boolean) =>
  JSON.stringify({
    consumers: [{ changed: "a", caller: "b", evidence: "c:1" }],
    setup: { ok: true, steps: [] },
    cases: [{ id: "c1", req: null, mode: "api", action: "x", expected: "y", observed: "z", effect: "w", pass }],
    notApplicable: null,
    abnahme: "## Abnahme",
  });

test("[REQ-SMOKE-2] CLI leitet passed/failed ab und reicht die Abnahme-Anleitung durch", () => {
  expect(run({ rawOutput: report(true) }).out).toMatchObject({ smoke: { status: "passed" }, abnahme: "## Abnahme" });
  expect(run({ rawOutput: report(false) }).out).toMatchObject({ smoke: { status: "failed" }, failedCases: ["c1"] });
});

test("[REQ-SMOKE-3] CLI: ein status im Input wird ignoriert; not-run trägt retried", () => {
  expect(run({ rawOutput: "Müll", status: "passed" }).out.smoke).toEqual({ status: "not-run", retried: false });
  expect(run({ rawOutput: "Müll", retried: true }).out.smoke).toEqual({ status: "not-run", retried: true });
  expect(run("kein json").out.smoke).toEqual({ status: "not-run", retried: false });
});
