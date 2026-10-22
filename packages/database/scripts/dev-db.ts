import fs from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const port = Number(process.env.EMBEDDED_PG_PORT ?? 5433);
const database = process.env.EMBEDDED_PG_DATABASE ?? 'clarity_vault';
const user = process.env.EMBEDDED_PG_USER ?? 'clarity';
const password = process.env.EMBEDDED_PG_PASSWORD ?? 'clarity';
const databaseDir = path.resolve(process.cwd(), '.pgdata');

async function main(): Promise<void> {
  const pg = new EmbeddedPostgres({
    databaseDir,
    port,
    user,
    password,
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  });

  const isInitialised = fs.existsSync(path.join(databaseDir, 'PG_VERSION'));
  if (!isInitialised) {
    console.log('Initialising embedded PostgreSQL data directory…');
    await pg.initialise();
  }

  await pg.start();

  try {
    await pg.createDatabase(database);
    console.log(`Created database "${database}".`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists/i.test(message)) {
      console.warn(`Database may already exist (${message}). Continuing.`);
    }
  }

  const url = `postgresql://${user}:${password}@127.0.0.1:${port}/${database}?schema=public`;
  console.log('\nEmbedded PostgreSQL is running (foreground).');
  console.log(`DATABASE_URL="${url}"`);
  console.log('Press Ctrl+C to stop. In another terminal run: pnpm db:push && pnpm db:seed');

  const shutdown = async () => {
    console.log('\nStopping embedded PostgreSQL…');
    try {
      await pg.stop();
    } catch {
      // ignore shutdown errors
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.stdin.resume();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
