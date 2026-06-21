import { Client } from "ssh2";

const PASSWORD = process.env.DEPLOY_PASSWORD || "";
const HOST = "34.142.233.15";
const USER = "ubuntu";
const DIR = "/opt/legal-unit-platform";

function run(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      stream.on("data", (d) => { out += d; process.stdout.write(d); });
      stream.stderr.on("data", (d) => { out += d; process.stderr.write(d); });
      stream.on("close", (code) => resolve({ code, out }));
    });
  });
}

const conn = new Client();
conn.on("ready", async () => {
  console.log("=== images ===");
  await run(conn, "sudo docker images | head -20");
  console.log("\n=== starting compose ===");
  const r = await run(conn, `cd ${DIR} && sudo docker compose up -d`);
  console.log("\n=== ps ===");
  await run(conn, "sudo docker ps -a");
  console.log("\n=== wait + health ===");
  await run(conn, "sleep 40 && curl -sf http://127.0.0.1:3000/api/health && echo OK || (cd /opt/legal-unit-platform && sudo docker compose logs --tail=50 app)");
  if (r.code === 0) {
    await run(conn, `cd ${DIR} && sudo docker compose exec -T app node scripts/apply-pending-migrations.mjs`,);
    await run(conn, `cd ${DIR} && sudo docker compose exec -T app node scripts/seed-admin.mjs`);
  }
  conn.end();
});
conn.connect({ host: HOST, port: 22, username: USER, password: PASSWORD, readyTimeout: 30000 });
