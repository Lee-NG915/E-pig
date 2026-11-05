#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");

export const CONTRACT_ROOT = path.join(REPO_ROOT, "contracts/epig-after-sales");
export const DEFAULT_BUNDLE = path.join(CONTRACT_ROOT, "v1");
export const DEFAULT_LOCK = path.join(CONTRACT_ROOT, "source-lock.json");

export const REQUIRED_SOURCE_REPOSITORY = "https://github.com/Lee-NG915/dtc-support-agent.git";
export const REQUIRED_SOURCE_COMMIT = "d3cab389429ab27a2f0d5483fb6388afc9e05bed";
export const REQUIRED_SOURCE_SUMS_SHA256 =
  "b27f002fc639f0e5fee730651fdbf18c515a51a04de41324e6cfdf930f626752";
export const REQUIRED_PACKAGE_VERSION = "1.0.0";
export const REQUIRED_WIRE_MAJOR = "1";
export const REQUIRED_SOURCE_PATH = "contracts/epig-after-sales/v1";
export const REQUIRED_VENDOR_FILE_COUNT = 51;
export const REQUIRED_FIXTURE_COUNT = 49;

const CONTRACT_HEADER = "x-after-sales-contract-version";
const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head", "trace"]);
const REQUIRED_OPERATION_IDS = new Set([
  "uploadAttachment",
  "getAttachmentContent",
  "getServiceAttachmentContent",
  "createAfterSalesRequest",
  "getAfterSalesRequest",
  "getConsumerTicket",
  "getServiceOrder",
  "getServiceOrderShipment",
  "listServiceRequests",
  "getServiceRequest",
  "createServiceTicket",
  "getServiceTicket",
  "getServiceTicketByIdempotencyKey",
]);
const CONSUMER_ALLOWLIST_SCHEMAS = [
  "Attachment",
  "RequestProgress",
  "ConsumerAfterSalesRequest",
  "ConsumerTicketReceipt",
  "ConsumerTicket",
  "RecipientSummary",
  "ServiceOrder",
  "ErrorDetails",
  "Error",
  "ErrorResponse",
];
const ERROR_STATUSES = new Map([
  ["VALIDATION_ERROR", new Set([400])],
  ["UNSUPPORTED_CONTRACT_VERSION", new Set([400])],
  ["INVALID_CURSOR", new Set([400])],
  ["UNAUTHORIZED", new Set([401])],
  ["FORBIDDEN_MARKET", new Set([403])],
  ["NOT_FOUND", new Set([404])],
  ["IDEMPOTENCY_CONFLICT", new Set([409])],
  ["REQUEST_STATE_CONFLICT", new Set([409])],
  ["ORDER_VERSION_CONFLICT", new Set([409])],
  ["ATTACHMENT_EXPIRED", new Set([410])],
  ["ATTACHMENT_TOO_LARGE", new Set([413])],
  ["UNSUPPORTED_MEDIA_TYPE", new Set([415])],
  ["RATE_LIMITED", new Set([429])],
  ["INTERNAL_ERROR", new Set([500])],
  ["UPSTREAM_UNAVAILABLE", new Set([503])],
]);
const REQUIREMENT_ID = /^AS-REQ-[A-Z]+-\d{3}$/;
const ACCEPTANCE_ID = /^AS-ACC-\d{3}$/;

export class ContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "ContractError";
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new ContractError(message);
  }
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function readJson(filePath) {
  let source;
  try {
    source = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new ContractError(`${filePath}: cannot read JSON: ${error.message}`);
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new ContractError(`${filePath}: cannot parse JSON: ${error.message}`);
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function listFiles(root) {
  const result = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        result.push(path.relative(root, absolute).split(path.sep).join("/"));
      }
    }
  };
  visit(root);
  return result.sort();
}

function resolvePointer(document, pointer) {
  assert(
    typeof pointer === "string" && pointer.startsWith("#/"),
    `only local JSON pointers are supported: ${pointer}`,
  );
  let value = document;
  for (const rawPart of pointer.slice(2).split("/")) {
    const part = rawPart.replaceAll("~1", "/").replaceAll("~0", "~");
    assert(
      value !== null && typeof value === "object" && Object.hasOwn(value, part),
      `unresolved JSON pointer: ${pointer}`,
    );
    value = value[part];
  }
  return value;
}

function resolveReference(document, value) {
  const seen = new Set();
  let resolved = value;
  while (resolved !== null && typeof resolved === "object" && Object.hasOwn(resolved, "$ref")) {
    const reference = resolved.$ref;
    assert(!seen.has(reference), `cyclic reference: ${reference}`);
    seen.add(reference);
    resolved = resolvePointer(document, reference);
  }
  return resolved;
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function schemaTypeMatches(type, value) {
  switch (type) {
    case "null":
      return value === null;
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    default:
      return false;
  }
}

function validateSchema(document, schemaValue, value, location = "$", errors = []) {
  const schema = resolveReference(document, schemaValue);
  if (schema === true) {
    return errors;
  }
  if (schema === false) {
    errors.push(`${location}: schema rejects every value`);
    return errors;
  }
  assert(schema !== null && typeof schema === "object", `${location}: schema must be an object`);

  if (Object.hasOwn(schema, "const") && !deepEqual(value, schema.const)) {
    errors.push(`${location}: expected const ${JSON.stringify(schema.const)}`);
  }
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((candidate) => deepEqual(value, candidate))
  ) {
    errors.push(`${location}: value is not in enum`);
  }

  if (Array.isArray(schema.allOf)) {
    for (const child of schema.allOf) {
      validateSchema(document, child, value, location, errors);
    }
  }
  if (Array.isArray(schema.anyOf)) {
    const matches = schema.anyOf.some(
      (child) => validateSchema(document, child, value, location, []).length === 0,
    );
    if (!matches) {
      errors.push(`${location}: value does not match any allowed schema`);
    }
  }
  if (Object.hasOwn(schema, "if")) {
    const conditionMatches =
      validateSchema(document, schema.if, value, location, []).length === 0;
    if (conditionMatches && Object.hasOwn(schema, "then")) {
      validateSchema(document, schema.then, value, location, errors);
    } else if (!conditionMatches && Object.hasOwn(schema, "else")) {
      validateSchema(document, schema.else, value, location, errors);
    }
  }

  if (typeof schema.type === "string" && !schemaTypeMatches(schema.type, value)) {
    errors.push(`${location}: expected ${schema.type}`);
    return errors;
  }
  if (Array.isArray(schema.type) && !schema.type.some((type) => schemaTypeMatches(type, value))) {
    errors.push(`${location}: expected one of ${schema.type.join(", ")}`);
    return errors;
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${location}: ${value} is below minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(`${location}: ${value} exceeds maximum ${schema.maximum}`);
    }
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${location}: string is shorter than ${schema.minLength}`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      errors.push(`${location}: string is longer than ${schema.maxLength}`);
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) {
      errors.push(`${location}: string does not match ${schema.pattern}`);
    }
    if (schema.format === "date-time") {
      const parsed = Date.parse(value);
      if (!value.endsWith("Z") || Number.isNaN(parsed)) {
        errors.push(`${location}: invalid UTC date-time`);
      }
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${location}: array has fewer than ${schema.minItems} items`);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      errors.push(`${location}: array has more than ${schema.maxItems} items`);
    }
    if (schema.uniqueItems === true) {
      const serialized = value.map((item) => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) {
        errors.push(`${location}: array items are not unique`);
      }
    }
    if (Object.hasOwn(schema, "items")) {
      value.forEach((item, index) => {
        validateSchema(document, schema.items, item, `${location}[${index}]`, errors);
      });
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const properties = schema.properties ?? {};
    if (Array.isArray(schema.required)) {
      for (const required of schema.required) {
        if (!Object.hasOwn(value, required)) {
          errors.push(`${location}: missing required property ${required}`);
        }
      }
    }
    for (const [key, childValue] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) {
        validateSchema(document, properties[key], childValue, `${location}.${key}`, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${location}: unexpected property ${key}`);
      } else if (
        schema.additionalProperties !== null &&
        typeof schema.additionalProperties === "object"
      ) {
        validateSchema(
          document,
          schema.additionalProperties,
          childValue,
          `${location}.${key}`,
          errors,
        );
      }
    }
  }

  return errors;
}

function operations(document) {
  const result = new Map();
  for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
    assert(
      route.startsWith("/api/{market}/after-sales/"),
      `unexpected after-sales path: ${route}`,
    );
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) {
        continue;
      }
      const operationId = operation.operationId;
      assert(typeof operationId === "string" && operationId, `${method} ${route}: missing operationId`);
      assert(!result.has(operationId), `duplicate operationId: ${operationId}`);
      result.set(operationId, {
        ...operation,
        xPath: route,
        xMethod: method,
        xPathItem: pathItem,
      });
    }
  }

  const missing = [...REQUIRED_OPERATION_IDS].filter((id) => !result.has(id));
  const extra = [...result.keys()].filter((id) => !REQUIRED_OPERATION_IDS.has(id));
  assert(missing.length === 0, `required operations missing: ${missing.join(", ")}`);
  assert(extra.length === 0, `unexpected operations: ${extra.join(", ")}`);
  assert(result.size === 13, `expected 13 operations, found ${result.size}`);
  return result;
}

function parameterMap(document, operation) {
  const parameters = [
    ...(resolveReference(document, operation.xPathItem).parameters ?? []),
    ...(operation.parameters ?? []),
  ];
  return new Map(
    parameters.map((parameterValue) => {
      const parameter = resolveReference(document, parameterValue);
      return [`${parameter.in}:${String(parameter.name).toLowerCase()}`, parameter];
    }),
  );
}

function isWireMajorSchema(document, schemaValue) {
  const schema = resolveReference(document, schemaValue);
  return schema.const === REQUIRED_WIRE_MAJOR || deepEqual(schema.enum, [REQUIRED_WIRE_MAJOR]);
}

function assertContractHeaders(document, operation) {
  const parameter = parameterMap(document, operation).get(`header:${CONTRACT_HEADER}`);
  assert(
    parameter?.required === true,
    `${operation.operationId}: missing required wire-major request header`,
  );
  assert(
    isWireMajorSchema(document, parameter.schema),
    `${operation.operationId}: request header must allow only wire major 1`,
  );

  for (const [status, responseValue] of Object.entries(operation.responses ?? {})) {
    const response = resolveReference(document, responseValue);
    const headers = new Map(
      Object.entries(response.headers ?? {}).map(([name, headerValue]) => [
        name.toLowerCase(),
        resolveReference(document, headerValue),
      ]),
    );
    const header = headers.get(CONTRACT_HEADER);
    assert(header, `${operation.operationId}: ${status} response lacks wire-major header`);
    assert(
      header.required === true,
      `${operation.operationId}: ${status} response wire-major header must be required`,
    );
    assert(
      isWireMajorSchema(document, header.schema),
      `${operation.operationId}: ${status} response header must be wire major 1`,
    );
  }
}

function assertRequestAndAuthConstraints(document, operation) {
  const parameters = parameterMap(document, operation);
  const requestBody = resolveReference(document, operation.requestBody ?? {});
  for (const media of Object.values(requestBody.content ?? {})) {
    const schema = resolveReference(document, media.schema ?? {});
    if (schema.type === "object") {
      assert(
        schema.additionalProperties === false,
        `${operation.operationId}: request body must reject unknown fields`,
      );
    }
  }
  if (requestBody.content?.["application/json"] && operation.xMethod === "post") {
    assert(
      parameters.has("header:idempotency-key"),
      `${operation.operationId}: JSON POST requires Idempotency-Key`,
    );
  }

  const security = operation.security ?? document.security ?? [];
  const tags = new Set(operation.tags ?? []);
  const isServicePath = operation.xPath.includes("/service/");
  const hasServiceAuth = security.some((requirement) =>
    Object.hasOwn(requirement, "ServiceBearerAuth"),
  );
  const hasConsumerAuth = security.some((requirement) =>
    Object.hasOwn(requirement, "ConsumerOrderOwnershipCookie"),
  );
  if (isServicePath) {
    assert(
      hasServiceAuth && !hasConsumerAuth && tags.size === 1 && tags.has("service"),
      `${operation.operationId}: service path requires service-only auth and tag`,
    );
  } else {
    assert(
      hasConsumerAuth && !hasServiceAuth && tags.size === 1 && tags.has("consumer"),
      `${operation.operationId}: consumer path requires consumer-only auth and tag`,
    );
  }
}

function assertSpecialInvariants(document) {
  const schemas = document.components?.schemas ?? {};
  for (const name of CONSUMER_ALLOWLIST_SCHEMAS) {
    const schema = resolveReference(document, schemas[name] ?? {});
    assert(
      schema.type === "object" && schema.additionalProperties === false,
      `${name}: safety-critical DTO must be a producer allowlist`,
    );
  }

  for (const name of [
    "CreateAfterSalesRequestInput",
    "ConsumerAfterSalesRequest",
    "ServiceAfterSalesRequest",
  ]) {
    const schema = resolveReference(document, schemas[name] ?? {});
    assert(
      schema.properties?.description?.pattern === "\\S",
      `${name}: description must contain non-whitespace text`,
    );
  }
  for (const name of ["CreateServiceTicketInput", "ConsumerTicket", "ServiceTicket"]) {
    const schema = resolveReference(document, schemas[name] ?? {});
    assert(
      schema.properties?.reply?.pattern === "\\S",
      `${name}: reply must contain non-whitespace text`,
    );
  }
  for (const name of ["ConsumerAfterSalesRequest", "ServiceAfterSalesRequest"]) {
    const schema = resolveReference(document, schemas[name] ?? {});
    const linkage = schema.allOf?.[0];
    assert(
      linkage && Object.hasOwn(linkage, "then") && Object.hasOwn(linkage, "else"),
      `${name}: status and ticket_id must be consistent`,
    );
  }

  const upload = resolveReference(document, schemas.UploadAttachmentRequest ?? {});
  assert(
    upload.required?.includes("order_id"),
    "UploadAttachmentRequest: order_id binding is required",
  );

  const feed = resolveReference(document, schemas.ServiceRequestFeed ?? {});
  assert(
    ["high_watermark", "next_cursor"].every((key) => feed.required?.includes(key)),
    "ServiceRequestFeed: high_watermark and next_cursor are required",
  );
  const nextCursor = resolveReference(document, feed.properties?.next_cursor ?? {});
  assert(
    nextCursor.type !== "null" && !Object.hasOwn(nextCursor, "anyOf"),
    "ServiceRequestFeed: next_cursor must always be non-null",
  );

  const error = resolveReference(document, schemas.Error ?? {});
  assert(
    error.required?.includes("recovery_action"),
    "Error: recovery_action is required for deterministic recovery",
  );
}

function contentSchemaPointer(
  document,
  containerValue,
  containerPointer,
  contentType,
) {
  const container = resolveReference(document, containerValue);
  const media = container.content?.[contentType];
  assert(media, `declared operation lacks ${contentType} content`);
  const schemaValue = media.schema ?? {};
  if (schemaValue.$ref) {
    return { pointer: schemaValue.$ref, schema: resolveReference(document, schemaValue) };
  }
  assert(
    containerPointer,
    "inline operation schemas must use a manifest-addressable response component",
  );
  return {
    pointer: `${containerPointer}/content/${contentType.replaceAll("/", "~1")}/schema`,
    schema: resolveReference(document, schemaValue),
  };
}

function fixtureSchema(document, operation, entry) {
  if (entry.kind === "request") {
    assert(
      (entry.representation ?? "json") === "json",
      `${entry.fixture_id}: only JSON request fixtures are supported`,
    );
    const requestBody = operation.requestBody ?? {};
    return contentSchemaPointer(document, requestBody, requestBody.$ref, "application/json");
  }

  const status = String(entry.http_status ?? "");
  assert(
    Object.hasOwn(operation.responses ?? {}, status),
    `${entry.fixture_id}: ${status} not declared for ${operation.operationId}`,
  );
  const response = operation.responses[status];
  let contentType = "application/json";
  if ((entry.representation ?? "json") === "binary") {
    const resolvedResponse = resolveReference(document, response);
    const requestedMediaType = entry.media_type ?? "application/octet-stream";
    contentType = Object.hasOwn(resolvedResponse.content ?? {}, requestedMediaType)
      ? requestedMediaType
      : "application/octet-stream";
  }
  return contentSchemaPointer(document, response, response.$ref, contentType);
}

function binaryHasExpectedMagic(data, mediaType) {
  switch (mediaType) {
    case "image/png":
      return data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/jpeg":
      return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    case "image/webp":
      return data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP";
    default:
      return false;
  }
}

function validateBinaryFixture(filePath, entry) {
  const data = fs.readFileSync(filePath);
  assert(data.length === entry.size_bytes, `${entry.fixture_id}: binary size mismatch`);
  assert(sha256(data) === entry.sha256, `${entry.fixture_id}: binary SHA-256 mismatch`);
  assert(
    !entry.expected_valid || data.length <= 5 * 1024 * 1024,
    `${entry.fixture_id}: valid binary exceeds 5 MiB`,
  );
  const validMagic = binaryHasExpectedMagic(data, entry.media_type);
  assert(
    !entry.expected_valid || validMagic,
    `${entry.fixture_id}: binary magic bytes do not match ${entry.media_type}`,
  );
  if (!entry.expected_valid) {
    assert(
      !validMagic || data.length > 5 * 1024 * 1024,
      `${entry.fixture_id}: invalid binary unexpectedly passed`,
    );
  }
}

function validateErrorSemantics(operationId, status, fixture) {
  const error = fixture.error ?? {};
  const code = error.code;
  if (ERROR_STATUSES.has(code)) {
    assert(
      ERROR_STATUSES.get(code).has(status),
      `${code}: invalid HTTP status ${status}`,
    );
  }
  if (operationId === "createServiceTicket" && status >= 429) {
    assert(
      error.retryable === false && error.recovery_action === "LOOKUP_FIRST",
      "createServiceTicket uncertain errors must require LOOKUP_FIRST",
    );
  }
  if (operationId === "getServiceTicketByIdempotencyKey" && status === 404) {
    assert(
      error.retryable === false,
      "idempotency lookup 404 cannot be an immediate-retry signal",
    );
    assert(
      error.recovery_action === "RETRY_CREATE_WITH_SAME_KEY",
      "idempotency lookup 404 must require original-key recovery",
    );
  }
}

function validateFixtures(bundle, document, manifest, operationMap) {
  const entries = manifest.fixtures;
  assert(Array.isArray(entries) && entries.length > 0, "fixtures/manifest.json: fixtures must be a non-empty list");
  assert(
    entries.length === REQUIRED_FIXTURE_COUNT,
    `expected ${REQUIRED_FIXTURE_COUNT} fixtures, found ${entries.length}`,
  );

  const fixtureIds = new Set();
  const referencedPaths = new Set();
  const successfulOperations = new Set();

  for (const entry of entries) {
    const fixtureId = entry.fixture_id;
    assert(typeof fixtureId === "string" && fixtureId, "fixture entry lacks fixture_id");
    assert(!fixtureIds.has(fixtureId), `duplicate fixture_id: ${fixtureId}`);
    fixtureIds.add(fixtureId);

    const operation = operationMap.get(entry.operation_id);
    assert(operation, `${fixtureId}: unknown operation_id ${entry.operation_id}`);
    assert(
      entry.kind === "request" || entry.kind === "response",
      `${fixtureId}: kind must be request or response`,
    );
    assert(typeof entry.expected_valid === "boolean", `${fixtureId}: expected_valid must be boolean`);

    assert(
      Array.isArray(entry.requirement_ids) && entry.requirement_ids.length > 0,
      `${fixtureId}: requirement_ids are required`,
    );
    assert(
      Array.isArray(entry.acceptance_ids) && entry.acceptance_ids.length > 0,
      `${fixtureId}: acceptance_ids are required`,
    );
    for (const requirementId of entry.requirement_ids) {
      assert(REQUIREMENT_ID.test(requirementId), `${fixtureId}: invalid requirement ID ${requirementId}`);
      assert(
        operation["x-requirement-ids"]?.includes(requirementId),
        `${fixtureId}: requirement ID ${requirementId} not declared by ${entry.operation_id}`,
      );
    }
    for (const acceptanceId of entry.acceptance_ids) {
      assert(ACCEPTANCE_ID.test(acceptanceId), `${fixtureId}: invalid acceptance ID ${acceptanceId}`);
    }

    assert(
      typeof entry.path === "string" && entry.path && !path.isAbsolute(entry.path),
      `${fixtureId}: fixture path must be relative`,
    );
    const normalizedSegments = entry.path.split("/");
    assert(
      !normalizedSegments.includes("..") && !normalizedSegments.includes("."),
      `${fixtureId}: unsafe fixture path ${entry.path}`,
    );
    const fixturePath = path.join(bundle, "fixtures", entry.path);
    assert(fs.existsSync(fixturePath), `${fixtureId}: missing fixture ${entry.path}`);
    referencedPaths.add(path.resolve(fixturePath));

    const expected = fixtureSchema(document, operation, entry);
    assert(
      entry.schema === expected.pointer,
      `${fixtureId}: schema pointer ${entry.schema} does not match operation schema ${expected.pointer}`,
    );

    const representation = entry.representation ?? "json";
    if (representation === "binary") {
      assert(entry.kind === "response", `${fixtureId}: binary fixtures must be responses`);
      validateBinaryFixture(fixturePath, entry);
    } else {
      assert(representation === "json", `${fixtureId}: unsupported representation ${representation}`);
      const fixture = readJson(fixturePath);
      const errors = validateSchema(document, expected.schema, fixture);
      if (entry.expected_valid) {
        assert(
          errors.length === 0,
          `${fixtureId}: expected valid fixture failed: ${errors.slice(0, 3).join("; ")}`,
        );
      } else {
        assert(errors.length > 0, `${fixtureId}: invalid fixture unexpectedly passed`);
      }
      if (entry.kind === "response" && entry.expected_valid && expected.pointer === "#/components/schemas/ErrorResponse") {
        validateErrorSemantics(entry.operation_id, Number(entry.http_status), fixture);
      }
    }

    if (
      entry.kind === "response" &&
      entry.expected_valid &&
      Number(entry.http_status) >= 200 &&
      Number(entry.http_status) < 300
    ) {
      successfulOperations.add(entry.operation_id);
    }
  }

  const actualPaths = new Set(
    listFiles(path.join(bundle, "fixtures"))
      .filter((relativePath) => relativePath !== "manifest.json")
      .map((relativePath) => path.resolve(bundle, "fixtures", relativePath)),
  );
  const unreferenced = [...actualPaths].filter(
    (absolutePath) => !referencedPaths.has(absolutePath),
  );
  assert(
    unreferenced.length === 0,
    `fixtures not referenced by manifest: ${unreferenced
      .map((absolutePath) => path.relative(path.join(bundle, "fixtures"), absolutePath))
      .sort()
      .join(", ")}`,
  );

  const missingSuccess = [...operationMap.keys()].filter(
    (operationId) => !successfulOperations.has(operationId),
  );
  assert(
    missingSuccess.length === 0,
    `operations lacking success fixtures: ${missingSuccess.join(", ")}`,
  );
}

function expectedSumsText(bundle) {
  const lines = listFiles(bundle)
    .filter((relativePath) => relativePath !== "SHA256SUMS")
    .map((relativePath) => {
      const digest = sha256(fs.readFileSync(path.join(bundle, relativePath)));
      return `${digest}  ${relativePath}`;
    });
  return `${lines.join("\n")}\n`;
}

function parseSums(text) {
  const entries = new Map();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (line === "") {
      continue;
    }
    const match = /^([a-f0-9]{64}) {2}(.+)$/.exec(line);
    assert(match, `SHA256SUMS:${index + 1}: malformed checksum line`);
    assert(!entries.has(match[2]), `SHA256SUMS: duplicate path ${match[2]}`);
    entries.set(match[2], match[1]);
  }
  return entries;
}

function compareFileDigests(expectedEntries, bundle) {
  const actualFiles = listFiles(bundle).filter((relativePath) => relativePath !== "SHA256SUMS");
  const actualSet = new Set(actualFiles);
  const expectedSet = new Set(expectedEntries.keys());
  const missing = [...expectedSet].filter((relativePath) => !actualSet.has(relativePath));
  const extra = [...actualSet].filter((relativePath) => !expectedSet.has(relativePath));
  const drifted = actualFiles.filter((relativePath) => {
    if (!expectedEntries.has(relativePath)) {
      return false;
    }
    return sha256(fs.readFileSync(path.join(bundle, relativePath))) !== expectedEntries.get(relativePath);
  });
  assert(
    missing.length === 0 && extra.length === 0 && drifted.length === 0,
    `SHA256SUMS mismatch: missing [${missing.join(", ")}], extra [${extra.join(", ")}], digest [${drifted.join(", ")}]`,
  );
}

function assertLockedFileList(lock, bundle) {
  assert(Array.isArray(lock.files) && lock.files.length > 0, "source-lock.json: files must be a non-empty list");
  const actualFiles = listFiles(bundle);
  assert(
    actualFiles.length === REQUIRED_VENDOR_FILE_COUNT,
    `source-lock.json: missing or extra vendored files (expected ${REQUIRED_VENDOR_FILE_COUNT}, found ${actualFiles.length})`,
  );
  const locked = new Map();
  for (const file of lock.files) {
    assert(
      file !== null && typeof file === "object" && typeof file.path === "string" && typeof file.sha256 === "string",
      "source-lock.json: each file requires path and sha256",
    );
    assert(
      !path.isAbsolute(file.path) && !file.path.split("/").includes(".."),
      `source-lock.json: unsafe file path ${file.path}`,
    );
    assert(!locked.has(file.path), `source-lock.json: duplicate file path ${file.path}`);
    locked.set(file.path, file.sha256);
  }
  const missing = actualFiles.filter((relativePath) => !locked.has(relativePath));
  const extra = [...locked.keys()].filter((relativePath) => !actualFiles.includes(relativePath));
  const drifted = actualFiles.filter((relativePath) => {
    return locked.has(relativePath) && sha256(fs.readFileSync(path.join(bundle, relativePath))) !== locked.get(relativePath);
  });
  assert(
    missing.length === 0 && extra.length === 0 && drifted.length === 0,
    `source-lock.json file list mismatch: missing [${missing.join(", ")}], extra [${extra.join(", ")}], digest [${drifted.join(", ")}]`,
  );
}

function assertCoordination(lock) {
  const expected = {
    dtc: "https://github.com/Lee-NG915/dtc-support-agent/issues/2",
    epig: "https://github.com/Lee-NG915/E-pig/issues/2",
  };
  for (const repository of ["dtc", "epig"]) {
    assert(
      lock.coordination?.[repository]?.issue === expected[repository],
      `source-lock.json: ${repository} issue must be ${expected[repository]}`,
    );
    const pullRequest = lock.coordination[repository].pull_request;
    assert(
      pullRequest === null || (typeof pullRequest === "string" && pullRequest.length > 0),
      `source-lock.json: ${repository} pull_request must be a URL or null`,
    );
  }
}

function validateSourceLock(lock, bundle, { checkDigests }) {
  assert(lock !== null && typeof lock === "object", "source-lock.json must be an object");
  assert(lock.schema_version === "1.0.0", "source-lock.json: schema_version must be 1.0.0");
  assert(
    lock.source_repository === REQUIRED_SOURCE_REPOSITORY,
    `source-lock.json: source_repository must be ${REQUIRED_SOURCE_REPOSITORY}`,
  );
  assert(
    lock.source_commit === REQUIRED_SOURCE_COMMIT,
    `source-lock.json: source_commit must be ${REQUIRED_SOURCE_COMMIT}`,
  );
  assert(
    typeof lock.tracking_ref === "string" && lock.tracking_ref.startsWith("refs/remotes/origin/"),
    "source-lock.json: tracking_ref must be a remote tracking ref",
  );
  assert(
    typeof lock.synced_at === "string" && !Number.isNaN(Date.parse(lock.synced_at)),
    "source-lock.json: synced_at must be an ISO date-time",
  );
  assert(
    lock.contract_version === REQUIRED_PACKAGE_VERSION,
    `source-lock.json: contract_version must be ${REQUIRED_PACKAGE_VERSION}`,
  );
  assert(
    lock.wire_major === REQUIRED_WIRE_MAJOR,
    `source-lock.json: wire_major must be ${REQUIRED_WIRE_MAJOR}`,
  );
  assert(
    lock.source_path === REQUIRED_SOURCE_PATH,
    `source-lock.json: source_path must be ${REQUIRED_SOURCE_PATH}`,
  );

  const sumsPath = path.join(bundle, "SHA256SUMS");
  assert(fs.existsSync(sumsPath), "SHA256SUMS is missing");
  const sourceSumsDigest = sha256(fs.readFileSync(sumsPath));
  assert(
    sourceSumsDigest === REQUIRED_SOURCE_SUMS_SHA256,
    `SHA256SUMS self digest must be ${REQUIRED_SOURCE_SUMS_SHA256}, found ${sourceSumsDigest}`,
  );
  assert(
    lock.source_sums_sha256 === REQUIRED_SOURCE_SUMS_SHA256,
    `source-lock.json: source_sums_sha256 must be ${REQUIRED_SOURCE_SUMS_SHA256}`,
  );
  assertCoordination(lock);
  if (checkDigests) {
    assertLockedFileList(lock, bundle);
  }
}

export function validateContract({
  bundle = DEFAULT_BUNDLE,
  lock: lockPath = DEFAULT_LOCK,
  checkDigests = true,
} = {}) {
  assert(fs.existsSync(bundle), `contract bundle is missing: ${bundle}`);
  assert(fs.existsSync(lockPath), `source lock is missing: ${lockPath}`);
  const lock = readJson(lockPath);
  validateSourceLock(lock, bundle, { checkDigests });

  if (checkDigests) {
    const sumsPath = path.join(bundle, "SHA256SUMS");
    const sumsText = fs.readFileSync(sumsPath, "utf8");
    const expectedText = expectedSumsText(bundle);
    assert(
      sumsText === expectedText,
      "SHA256SUMS is stale: missing, extra, or content-drifted vendored files",
    );
    compareFileDigests(parseSums(sumsText), bundle);
  }

  const document = readJson(path.join(bundle, "openapi.json"));
  const manifest = readJson(path.join(bundle, "fixtures/manifest.json"));
  assert(document.openapi?.startsWith("3.1."), "contract must use OpenAPI 3.1.x");
  assert(
    document.info?.version === REQUIRED_PACKAGE_VERSION,
    `OpenAPI version must be ${REQUIRED_PACKAGE_VERSION}`,
  );
  assert(
    manifest.contract_version === document.info.version,
    "OpenAPI and fixture manifest package versions must match",
  );
  assert(manifest.schema_version === "1.0.0", "fixture manifest schema_version must be 1.0.0");

  const operationMap = operations(document);
  assert(
    document.components?.securitySchemes?.ConsumerOrderOwnershipCookie?.name ===
      "epig_cart_{market}",
    "consumer cookie must follow E-pig's epig_cart_{market} template",
  );
  assertSpecialInvariants(document);
  for (const operation of operationMap.values()) {
    assert(
      Array.isArray(operation["x-requirement-ids"]) &&
        operation["x-requirement-ids"].length > 0,
      `${operation.operationId}: x-requirement-ids must be non-empty`,
    );
    assertContractHeaders(document, operation);
    assertRequestAndAuthConstraints(document, operation);
  }
  validateFixtures(bundle, document, manifest, operationMap);

  return {
    contractVersion: document.info.version,
    operations: operationMap.size,
    fixtures: manifest.fixtures.length,
    files: listFiles(bundle).length,
    sourceCommit: lock.source_commit,
    sourceSumsSha256: REQUIRED_SOURCE_SUMS_SHA256,
  };
}

function runGit(source, args, options = {}) {
  const result = spawnSync("git", ["-C", source, ...args], {
    encoding: options.encoding === null ? null : (options.encoding ?? "utf8"),
    input: options.input,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString("utf8")
      : result.stderr;
    throw new ContractError(`git ${args.join(" ")} failed: ${stderr.trim()}`);
  }
  return result.stdout;
}

function normalizeGitRemote(remote) {
  const match = /^git@([^:]+):(.+)$/.exec(remote);
  if (match) {
    return `https://${match[1]}/${match[2]}`;
  }
  return remote;
}

export function assertImmutableSourceCommit(commit) {
  assert(
    typeof commit === "string" && /^[0-9a-f]{40}$/.test(commit),
    "sync requires a full 40-character immutable source commit, not a branch or tag",
  );
  assert(
    commit === REQUIRED_SOURCE_COMMIT,
    `source commit must be ${REQUIRED_SOURCE_COMMIT}`,
  );
}

function buildSourceLock(bundle, source, commit) {
  const remote = normalizeGitRemote(runGit(source, ["remote", "get-url", "origin"]).trim());
  assert(
    remote === REQUIRED_SOURCE_REPOSITORY,
    `unexpected source repository: ${remote}`,
  );
  const trackingRef = runGit(source, ["rev-parse", "--symbolic-full-name", "@{upstream}"]).trim();
  assert(
    trackingRef.startsWith("refs/remotes/origin/"),
    "source current branch must have a remote tracking ref",
  );
  const trackingCommit = runGit(source, ["rev-parse", `${trackingRef}^{commit}`]).trim();
  assert(
    trackingCommit === commit,
    `tracking ref ${trackingRef} is at ${trackingCommit}, not requested commit ${commit}`,
  );

  return {
    schema_version: "1.0.0",
    source_repository: remote,
    source_commit: commit,
    tracking_ref: trackingRef,
    contract_version: REQUIRED_PACKAGE_VERSION,
    wire_major: REQUIRED_WIRE_MAJOR,
    source_path: REQUIRED_SOURCE_PATH,
    source_sums_sha256: REQUIRED_SOURCE_SUMS_SHA256,
    synced_at: new Date().toISOString(),
    coordination: {
      dtc: {
        issue: "https://github.com/Lee-NG915/dtc-support-agent/issues/2",
        pull_request: null,
      },
      epig: {
        issue: "https://github.com/Lee-NG915/E-pig/issues/2",
        pull_request: null,
      },
    },
    files: listFiles(bundle).map((relativePath) => ({
      path: relativePath,
      sha256: sha256(fs.readFileSync(path.join(bundle, relativePath))),
    })),
  };
}

export function syncContract({
  source,
  commit,
  contractRoot = CONTRACT_ROOT,
  now = () => new Date().toISOString(),
}) {
  assert(typeof source === "string" && source, "sync requires --source <git-repository>");
  assertImmutableSourceCommit(commit);
  assert(fs.existsSync(source), `source repository does not exist: ${source}`);

  const resolvedCommit = runGit(source, ["rev-parse", `${commit}^{commit}`]).trim();
  assert(resolvedCommit === commit, `source commit resolved to ${resolvedCommit}`);
  const archive = runGit(source, ["archive", "--format=tar", commit, "--", REQUIRED_SOURCE_PATH], {
    encoding: null,
  });

  fs.mkdirSync(contractRoot, { recursive: true });
  const stageRoot = fs.mkdtempSync(path.join(contractRoot, ".sync-stage-"));
  const backupRoot = fs.mkdtempSync(path.join(contractRoot, ".sync-backup-"));
  let installedBundle = false;
  let installedLock = false;
  try {
    const extract = spawnSync("tar", ["-xf", "-", "-C", stageRoot], {
      input: archive,
      maxBuffer: 32 * 1024 * 1024,
    });
    assert(extract.status === 0, `tar extraction failed: ${extract.stderr?.toString("utf8") ?? ""}`);

    const stagedBundle = path.join(stageRoot, REQUIRED_SOURCE_PATH);
    assert(fs.existsSync(stagedBundle), "git archive did not contain the contract bundle");
    const lock = buildSourceLock(stagedBundle, source, commit);
    lock.synced_at = now();
    const stagedLock = path.join(stageRoot, "source-lock.json");
    writeJson(stagedLock, lock);
    validateContract({ bundle: stagedBundle, lock: stagedLock });

    const targetBundle = path.join(contractRoot, "v1");
    const targetLock = path.join(contractRoot, "source-lock.json");
    const backupBundle = path.join(backupRoot, "v1");
    const backupLock = path.join(backupRoot, "source-lock.json");
    const hadBundle = fs.existsSync(targetBundle);
    const hadLock = fs.existsSync(targetLock);
    if (hadBundle) {
      fs.renameSync(targetBundle, backupBundle);
    }
    if (hadLock) {
      fs.renameSync(targetLock, backupLock);
    }

    try {
      fs.renameSync(stagedBundle, targetBundle);
      installedBundle = true;
      fs.renameSync(stagedLock, targetLock);
      installedLock = true;
    } catch (error) {
      if (installedLock) {
        fs.rmSync(targetLock, { force: true });
      }
      if (installedBundle) {
        fs.rmSync(targetBundle, { recursive: true, force: true });
      }
      if (hadBundle) {
        fs.renameSync(backupBundle, targetBundle);
      }
      if (hadLock) {
        fs.renameSync(backupLock, targetLock);
      }
      throw error;
    }

    return lock;
  } finally {
    fs.rmSync(stageRoot, { recursive: true, force: true });
    fs.rmSync(backupRoot, { recursive: true, force: true });
  }
}

export function checkTrackingFreshness({
  source,
  lock: lockPath = DEFAULT_LOCK,
}) {
  assert(typeof source === "string" && source, "freshness requires --source <git-repository>");
  assert(fs.existsSync(source), `source repository does not exist: ${source}`);
  const lock = readJson(lockPath);
  assert(
    typeof lock.source_commit === "string" && /^[0-9a-f]{40}$/.test(lock.source_commit),
    "source lock commit must be a full 40-character commit",
  );
  assert(
    typeof lock.tracking_ref === "string" && lock.tracking_ref.startsWith("refs/"),
    "source lock tracking_ref must be a full ref",
  );
  const current = runGit(source, ["rev-parse", `${lock.tracking_ref}^{commit}`]).trim();
  if (current === lock.source_commit) {
    return {
      status: "fresh",
      trackingRef: lock.tracking_ref,
      lockedCommit: lock.source_commit,
      currentCommit: current,
    };
  }

  const ancestorResult = spawnSync(
    "git",
    ["-C", source, "merge-base", "--is-ancestor", lock.source_commit, current],
    { encoding: "utf8" },
  );
  const relationship = ancestorResult.status === 0 ? "ahead" : "diverged";
  throw new ContractError(
    `tracking source is ${relationship}: ${lock.tracking_ref} is ${current}, locked commit is ${lock.source_commit}`,
  );
}

function usage() {
  return [
    "Usage:",
    "  node scripts/after-sales/contract.mjs check",
    "  node scripts/after-sales/contract.mjs sync --source <git-repository> --commit <40-char-sha>",
    "  node scripts/after-sales/contract.mjs freshness --source <git-repository>",
  ].join("\n");
}

function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      source: { type: "string" },
      commit: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const command = positionals[0];
  if (command === "check") {
    const result = validateContract();
    process.stdout.write(
      `[after-sales-contract] PASS — ${result.operations} operations, ${result.fixtures} fixtures, ${result.files} files, source ${result.sourceCommit}\n`,
    );
    return;
  }
  if (command === "sync") {
    const lock = syncContract({ source: values.source, commit: values.commit });
    process.stdout.write(
      `[after-sales-contract] SYNCED — ${lock.source_commit} at ${lock.synced_at}\n`,
    );
    return;
  }
  if (command === "freshness") {
    const result = checkTrackingFreshness({ source: values.source });
    process.stdout.write(
      `[after-sales-contract] FRESH — ${result.trackingRef} at ${result.currentCommit}\n`,
    );
    return;
  }
  throw new ContractError(usage());
}

const isMain =
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[after-sales-contract] FAIL — ${error.message}\n`);
    process.exitCode = 1;
  }
}
