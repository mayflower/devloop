import { test, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readTreeEntry, TreeEntryReadError } from "../../src/core/tree-entry.js";

let repo: string;
const git = (...a: string[]) =>
  execFileSync("git", ["-C", repo, ...a], {
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
  });
const put = (rel: string, c: string) => {
  mkdirSync(dirname(join(repo, rel)), { recursive: true });
  writeFileSync(join(repo, rel), c);
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "devloop-treeentry-"));
  git("init", "-q", "-b", "main");
  put("a.txt", "hello\n");
  put("dir/b.txt", "b");
  put("größe [x]*.txt", "odd");
  put("big.txt", "y".repeat(2 * 1024 * 1024));
  symlinkSync("a.txt", join(repo, "link"));
  git("add", "-A");
  git("update-index", "--add", "--cacheinfo", "160000,1234567890123456789012345678901234567890,sub");
  git("-c", "commit.gpgsign=false", "commit", "-q", "-m", "x");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

test("regular file: full content, also above 1 MiB", () => {
  expect(readTreeEntry(repo, "HEAD", "a.txt")).toEqual({ kind: "file", mode: "100644", content: "hello\n" });
  const big = readTreeEntry(repo, "HEAD", "big.txt");
  expect(big.kind === "file" && big.content.length).toBe(2 * 1024 * 1024);
});

test("symlink, submodule and directory are not read as files", () => {
  expect(readTreeEntry(repo, "HEAD", "link")).toEqual({ kind: "symlink" });
  expect(readTreeEntry(repo, "HEAD", "sub")).toEqual({ kind: "submodule" });
  expect(readTreeEntry(repo, "HEAD", "dir")).toEqual({ kind: "other", type: "tree" });
});

test("absent path is missing, not an error", () => {
  expect(readTreeEntry(repo, "HEAD", "nope.txt")).toEqual({ kind: "missing" });
  expect(readTreeEntry(repo, "HEAD", "a.txt/inside")).toEqual({ kind: "missing" });
});

test("special characters are literal, not pathspec magic", () => {
  expect(readTreeEntry(repo, "HEAD", "größe [x]*.txt")).toMatchObject({ kind: "file", content: "odd" });
  expect(readTreeEntry(repo, "HEAD", "*.txt")).toEqual({ kind: "missing" });
});

test("unresolvable ref and missing blob throw, naming path and ref", () => {
  expect(() => readTreeEntry(repo, "gibtsnicht", "a.txt")).toThrow(TreeEntryReadError);
  expect(() => readTreeEntry(repo, "gibtsnicht", "a.txt")).toThrow(/a\.txt @ gibtsnicht/);
  const sha = git("rev-parse", "HEAD:a.txt").trim();
  rmSync(join(repo, ".git/objects", sha.slice(0, 2), sha.slice(2)));
  expect(() => readTreeEntry(repo, "HEAD", "a.txt")).toThrow(/a\.txt @ HEAD/);
});
