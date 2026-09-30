/* eslint-disable */
// Runs mongod as a single-node replica set (Prisma needs one) on a fixed port
// and data directory, so the outage tests can kill it and start it again on
// the same data. The replica-set config lives in the data directory, so a
// restart needs no re-initialisation. Usage: node mongo-launcher.js <port> <dbPath>
const { spawn } = require('child_process');
const { MongoBinary } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');

(async () => {
  const [port, dbPath] = process.argv.slice(2);
  const bin = await MongoBinary.getPath({ version: process.env.MONGOMS_VERSION || '7.0.14' });
  const mongod = spawn(bin, ['--port', port, '--dbpath', dbPath, '--replSet', 'rs0', '--bind_ip', '127.0.0.1'], { stdio: 'ignore' });
  mongod.on('exit', (code) => process.exit(code ?? 0));
  const stop = () => mongod.kill('SIGTERM');
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  // Initiate once; on a restart the stored config is reused.
  for (let i = 0; i < 120; i++) {
    try {
      const c = await MongoClient.connect(`mongodb://127.0.0.1:${port}/?directConnection=true`, { serverSelectionTimeoutMS: 1000 });
      try {
        await c.db('admin').command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
      } catch (e) {
        if (!/already initialized/i.test(String(e.message))) throw e;
      }
      await c.close();
      console.log('READY');
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  console.error('mongod did not come up');
  process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
