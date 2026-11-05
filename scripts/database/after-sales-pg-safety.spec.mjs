import { describe, expect, it } from "vitest";

import {
  buildChildEnv,
  createInstanceIdentity,
  LOOPBACK_HOST,
  parseDockerPortOutput,
  TEST_DATABASE,
  TEST_MARKER,
  TEST_USER,
  validateDedicatedDatabaseIdentity,
} from "./after-sales-pg-safety.mjs";

const PASSWORD = "runner-generated-password-123";
const CONTAINER = "e-pig-as5c-0123456789abcdef";

describe("after-sales PostgreSQL runner safety", () => {
  it("drops inherited database URLs and PG variables before starting the child", () => {
    const env = buildChildEnv({
      baseEnv: {
        PATH: "/usr/bin",
        HOME: "/tmp/home",
        DATABASE_URL: "postgres://production.example/app",
        NEON_DATABASE_URL: "postgres://neon.example/app",
        PGHOST: "production.example",
        PGPORT: "5432",
        PGDATABASE: "app",
        PGUSER: "app",
        PGPASSWORD: "production-password",
        PGSSLMODE: "require",
        POSTGRES_PASSWORD: "production-password",
        [TEST_MARKER]: "1",
      },
      port: 49153,
      password: PASSWORD,
      containerName: CONTAINER,
    });

    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/tmp/home");
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.NEON_DATABASE_URL).toBeUndefined();
    expect(env.POSTGRES_PASSWORD).toBeUndefined();
    expect(env.PGHOST).toBe(LOOPBACK_HOST);
    expect(env.PGPORT).toBe("49153");
    expect(env.PGDATABASE).toBe(TEST_DATABASE);
    expect(env.PGUSER).toBe(TEST_USER);
    expect(env.PGPASSWORD).toBe(PASSWORD);
    expect(env.PGSSLMODE).toBe("disable");
    expect(env[TEST_MARKER]).toBe("1");
  });

  it("rejects incomplete or non-owned child settings", () => {
    expect(() => buildChildEnv({ baseEnv: {}, port: 0, password: PASSWORD, containerName: CONTAINER }))
      .toThrow(/port/);
    expect(() => buildChildEnv({ baseEnv: {}, port: 49153, password: "short", containerName: CONTAINER }))
      .toThrow(/password/);
    expect(() => buildChildEnv({ baseEnv: {}, port: 49153, password: PASSWORD, containerName: "postgres" }))
      .toThrow(/container name/);
  });

  it("accepts only a single loopback Docker port mapping", () => {
    expect(parseDockerPortOutput("127.0.0.1:49153\n")).toEqual({
      host: "127.0.0.1",
      port: 49153,
    });
    expect(() => parseDockerPortOutput("0.0.0.0:49153")).toThrow(/loopback/);
    expect(() => parseDockerPortOutput("[::]:49153")).toThrow(/loopback/);
    expect(() => parseDockerPortOutput("127.0.0.1:49153\n127.0.0.1:49154")).toThrow(/ambiguous/);
    expect(() => parseDockerPortOutput("")).toThrow(/ambiguous/);
  });

  it("fails closed on an unexpected database, user or server port", () => {
    expect(validateDedicatedDatabaseIdentity({
      marker: "1",
      database: TEST_DATABASE,
      user: TEST_USER,
      serverPort: 5432,
    })).toEqual({ database: TEST_DATABASE, user: TEST_USER, serverPort: 5432 });

    expect(() => validateDedicatedDatabaseIdentity({
      marker: undefined,
      database: TEST_DATABASE,
      user: TEST_USER,
      serverPort: 5432,
    })).toThrow(/dedicated runner/);
    expect(() => validateDedicatedDatabaseIdentity({
      marker: "1",
      database: "production",
      user: TEST_USER,
      serverPort: 5432,
    })).toThrow(/dedicated database/);
    expect(() => validateDedicatedDatabaseIdentity({
      marker: "1",
      database: TEST_DATABASE,
      user: "postgres",
      serverPort: 5432,
    })).toThrow(/dedicated user/);
    expect(() => validateDedicatedDatabaseIdentity({
      marker: "1",
      database: TEST_DATABASE,
      user: TEST_USER,
      serverPort: 5433,
    })).toThrow(/container port/);
  });

  it("creates unique runner-owned container names and labels", () => {
    const first = createInstanceIdentity();
    const second = createInstanceIdentity();
    expect(first.containerName).toMatch(/^e-pig-as5c-[0-9a-f]{16}$/);
    expect(first.containerName).not.toBe(second.containerName);
    expect(first.instanceLabel).toBe(`e-pig.after-sales.5c.instance=${first.id}`);
    expect(first.scopeLabel).toBe("e-pig.after-sales.5c=true");
  });
});
