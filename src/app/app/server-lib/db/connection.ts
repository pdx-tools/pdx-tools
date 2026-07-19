import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getCloudflare } from "../cloudflare-context";
import type { PdxRouteContext } from "../cloudflare-context";

export type DbConnection = ReturnType<typeof drizzle>;
export type DbTransaction = Parameters<Parameters<DbConnection["transaction"]>[0]>[0];
export type DbRoute = { dbConn: Promise<DbConnection> };

function dbConnect(connection: string) {
  const sql = postgres(connection);
  const orm = drizzle(sql);
  return {
    sql,
    orm,
  };
}

export function getDbOrm(connection: string) {
  return dbConnect(connection);
}

export function getDb(connection: string) {
  return getDbOrm(connection).orm;
}

export async function oneshotDb<R>(connection: string, fn: (db: DbConnection) => Promise<R>) {
  const { orm, sql } = getDbOrm(connection);
  try {
    return await fn(orm);
  } finally {
    await sql.end();
  }
}

export function usingDb(context: PdxRouteContext) {
  const cloudflare = getCloudflare(context);
  const { orm, sql } = getDbOrm(cloudflare.env.PDX_DB.connectionString);
  return {
    db: orm,
    close: () => cloudflare.ctx.waitUntil(sql.end()),
  };
}
