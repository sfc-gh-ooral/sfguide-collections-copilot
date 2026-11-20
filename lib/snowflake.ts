// Live mode: a small pool of Snowflake connections. Server only.
// Every statement uses bind variables; nothing user-supplied is concatenated into SQL.
import snowflake from 'snowflake-sdk';

snowflake.configure({ logLevel: 'ERROR' });

export const DATABASE = process.env.SNOWFLAKE_DATABASE ?? 'COLLECTIONS_COPILOT';
export const COMPLETE_MODEL = process.env.SNOWFLAKE_COMPLETE_MODEL ?? 'claude-sonnet-4-5';

export function isSnowflakeConfigured(): boolean {
  return !!(process.env.SNOWFLAKE_ACCOUNT && process.env.SNOWFLAKE_USERNAME &&
    (process.env.SNOWFLAKE_PRIVATE_KEY_PATH || process.env.SNOWFLAKE_TOKEN));
}

function options(): snowflake.ConnectionOptions {
  const base: snowflake.ConnectionOptions = {
    account: process.env.SNOWFLAKE_ACCOUNT!,
    username: process.env.SNOWFLAKE_USERNAME!,
    role: process.env.SNOWFLAKE_ROLE ?? 'COLLECTIONS_COPILOT_ROLE',
    warehouse: process.env.SNOWFLAKE_WAREHOUSE ?? 'COLLECTIONS_COPILOT_WH',
    database: DATABASE,
    schema: 'APP',
    clientSessionKeepAlive: true,
  };
  if (process.env.SNOWFLAKE_PRIVATE_KEY_PATH) return { ...base, authenticator: 'SNOWFLAKE_JWT', privateKeyPath: process.env.SNOWFLAKE_PRIVATE_KEY_PATH };
  return { ...base, authenticator: 'PROGRAMMATIC_ACCESS_TOKEN', token: process.env.SNOWFLAKE_TOKEN };
}

type Pool = ReturnType<typeof snowflake.createPool>;
const g = globalThis as unknown as { __ccPool?: Pool };
function pool(): Pool {
  g.__ccPool ??= snowflake.createPool(options(), { max: 6, min: 0, evictionRunIntervalMillis: 60_000, idleTimeoutMillis: 600_000 });
  return g.__ccPool;
}

function exec<T>(conn: snowflake.Connection, sqlText: string, binds?: snowflake.Binds): Promise<T[]> {
  return new Promise((resolve, reject) => {
    conn.execute({ sqlText, binds, complete: (err, _s, rows) => (err ? reject(new Error(err.message)) : resolve((rows ?? []) as T[])) });
  });
}
const prepared = new WeakSet<snowflake.Connection>();

/** Runs one statement on a pooled connection with only the example role's privileges. */
export async function query<T = Record<string, unknown>>(sqlText: string, binds?: snowflake.Binds): Promise<T[]> {
  return pool().use(async (conn) => {
    if (!prepared.has(conn)) { await exec(conn, 'USE SECONDARY ROLES NONE'); prepared.add(conn); }
    return exec<T>(conn, sqlText, binds);
  });
}
