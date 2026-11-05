import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CONTRACT_ROOT,
  ContractError,
  REQUIRED_SOURCE_COMMIT,
  assertImmutableSourceCommit,
  checkTrackingFreshness,
  syncContract,
  validateContract,
} from "./contract.mjs";

function temporaryCopy(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "epig-after-sales-contract-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(CONTRACT_ROOT, root, { recursive: true });
  return {
    root,
    bundle: path.join(root, "v1"),
    lock: path.join(root, "source-lock.json"),
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("canonical vendor passes digest, OpenAPI, and all shared fixture checks", () => {
  const result = validateContract();
  assert.equal(result.operations, 13);
  assert.equal(result.fixtures, 49);
  assert.equal(result.files, 51);
  assert.equal(result.sourceCommit, REQUIRED_SOURCE_COMMIT);
});

test("check rejects a missing vendored file", (t) => {
  const copy = temporaryCopy(t);
  fs.rmSync(path.join(copy.bundle, "fixtures/responses/get_service_ticket.ok.json"));
  assert.throws(() => validateContract(copy), /SHA256SUMS|missing/i);
});

test("check rejects an extra vendored file", (t) => {
  const copy = temporaryCopy(t);
  fs.writeFileSync(path.join(copy.bundle, "fixtures/orphan.json"), "{}\n");
  assert.throws(() => validateContract(copy), /SHA256SUMS|extra|unreferenced/i);
});

test("check rejects content drift", (t) => {
  const copy = temporaryCopy(t);
  fs.appendFileSync(path.join(copy.bundle, "openapi.json"), "\n");
  assert.throws(() => validateContract(copy), /SHA256SUMS|digest|mismatch/i);
});

test("check rejects a source-lock digest mismatch", (t) => {
  const copy = temporaryCopy(t);
  const lock = readJson(copy.lock);
  lock.source_sums_sha256 = "0".repeat(64);
  writeJson(copy.lock, lock);
  assert.throws(() => validateContract(copy), /source_sums_sha256/);
});

test("check rejects a corrupted positive fixture", (t) => {
  const copy = temporaryCopy(t);
  const fixturePath = path.join(
    copy.bundle,
    "fixtures/requests/create_after_sales_request.valid.json",
  );
  const fixture = readJson(fixturePath);
  delete fixture.description;
  writeJson(fixturePath, fixture);
  assert.throws(
    () => validateContract({ ...copy, checkDigests: false }),
    /expected valid fixture failed/,
  );
});

test("check rejects a corrupted binary fixture", (t) => {
  const copy = temporaryCopy(t);
  const manifestPath = path.join(copy.bundle, "fixtures/manifest.json");
  const manifest = readJson(manifestPath);
  const entry = manifest.fixtures.find((fixture) => fixture.representation === "binary");
  entry.sha256 = "0".repeat(64);
  writeJson(manifestPath, manifest);
  assert.throws(
    () => validateContract({ ...copy, checkDigests: false }),
    /binary SHA-256 mismatch/,
  );
});

test("optional response version header cannot be weakened", (t) => {
  const copy = temporaryCopy(t);
  const openapiPath = path.join(copy.bundle, "openapi.json");
  const document = readJson(openapiPath);
  document.components.headers.AfterSalesContractVersion.required = false;
  writeJson(openapiPath, document);
  assert.throws(
    () => validateContract({ ...copy, checkDigests: false }),
    /response wire-major header must be required/,
  );
});

test("consumer response cannot become an open DTO", (t) => {
  const copy = temporaryCopy(t);
  const openapiPath = path.join(copy.bundle, "openapi.json");
  const document = readJson(openapiPath);
  document.components.schemas.ConsumerTicket.additionalProperties = true;
  writeJson(openapiPath, document);
  assert.throws(
    () => validateContract({ ...copy, checkDigests: false }),
    /producer allowlist/,
  );
});

test("non-whitespace text invariants cannot be weakened", (t) => {
  const copy = temporaryCopy(t);
  const openapiPath = path.join(copy.bundle, "openapi.json");
  const document = readJson(openapiPath);
  delete document.components.schemas.CreateAfterSalesRequestInput.properties.description.pattern;
  writeJson(openapiPath, document);
  assert.throws(
    () => validateContract({ ...copy, checkDigests: false }),
    /description must contain non-whitespace text/,
  );
});

test("request status and ticket linkage is executed against the fixture", (t) => {
  const copy = temporaryCopy(t);
  const fixturePath = path.join(copy.bundle, "fixtures/responses/get_after_sales_request.ok.json");
  const fixture = readJson(fixturePath);
  fixture.status = "pending";
  writeJson(fixturePath, fixture);
  assert.throws(
    () => validateContract({ ...copy, checkDigests: false }),
    /expected valid fixture failed/,
  );
});

test("error fixture status semantics are executed", (t) => {
  const copy = temporaryCopy(t);
  const manifestPath = path.join(copy.bundle, "fixtures/manifest.json");
  const manifest = readJson(manifestPath);
  const entry = manifest.fixtures.find(
    (fixture) => fixture.fixture_id === "create_after_sales_request_validation_error",
  );
  entry.http_status = 500;
  writeJson(manifestPath, manifest);
  assert.throws(
    () => validateContract({ ...copy, checkDigests: false }),
    /schema pointer|invalid HTTP status/,
  );
});

test("sync rejects a mutable revision expression before writing", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "epig-after-sales-invalid-source-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.throws(() => assertImmutableSourceCommit("HEAD"), /full 40-character immutable source commit/);
  assert.throws(
    () =>
      syncContract({
        source: root,
        commit: "HEAD",
        contractRoot: path.join(root, "contracts"),
      }),
    /full 40-character immutable source commit/,
  );
  assert.equal(fs.existsSync(path.join(root, "contracts")), false);
});

test("sync rejects a different full commit before writing", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "epig-after-sales-wrong-commit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const wrongCommit = "0".repeat(40);
  assert.throws(
    () =>
      syncContract({
        source: root,
        commit: wrongCommit,
        contractRoot: path.join(root, "contracts"),
      }),
    /source commit must be/,
  );
  assert.equal(fs.existsSync(path.join(root, "contracts")), false);
});

test("freshness reports when the tracking source advanced", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "epig-after-sales-freshness-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "-b", "tracking"], { cwd: root });
  execFileSync("git", ["config", "user.email", "contract-test@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Contract Test"], { cwd: root });
  fs.writeFileSync(path.join(root, "state.txt"), "one\n");
  execFileSync("git", ["add", "state.txt"], { cwd: root });
  execFileSync("git", ["commit", "-m", "first"], { cwd: root });
  const first = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  fs.writeFileSync(path.join(root, "state.txt"), "two\n");
  execFileSync("git", ["add", "state.txt"], { cwd: root });
  execFileSync("git", ["commit", "-m", "second"], { cwd: root });

  const lockPath = path.join(root, "source-lock.json");
  const lock = readJson(path.join(CONTRACT_ROOT, "source-lock.json"));
  lock.source_commit = first;
  lock.tracking_ref = "refs/heads/tracking";
  writeJson(lockPath, lock);

  assert.throws(
    () => checkTrackingFreshness({ source: root, lock: lockPath }),
    /tracking source is ahead/,
  );
});

test("freshness is read-only when the tracking source is unchanged", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "epig-after-sales-fresh-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "-b", "tracking"], { cwd: root });
  execFileSync("git", ["config", "user.email", "contract-test@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Contract Test"], { cwd: root });
  fs.writeFileSync(path.join(root, "state.txt"), "one\n");
  execFileSync("git", ["add", "state.txt"], { cwd: root });
  execFileSync("git", ["commit", "-m", "first"], { cwd: root });
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

  const lockPath = path.join(root, "source-lock.json");
  const lock = readJson(path.join(CONTRACT_ROOT, "source-lock.json"));
  lock.source_commit = commit;
  lock.tracking_ref = "refs/heads/tracking";
  writeJson(lockPath, lock);
  const before = fs.statSync(lockPath).mtimeMs;

  const result = checkTrackingFreshness({ source: root, lock: lockPath });
  assert.equal(result.status, "fresh");
  assert.equal(fs.statSync(lockPath).mtimeMs, before);
});

test("contract errors are explicit", () => {
  const error = new ContractError("boom");
  assert.equal(error.name, "ContractError");
  assert.equal(error.message, "boom");
});
