/**
 * Reset MySQL volume so it matches .env passwords, then start app + seed.
 * Use when redeploy changed MYSQL_PASSWORD but the db volume kept old credentials.
 */
import { Client } from "ssh2";

const HOST = process.env.DEPLOY_HOST || "34.142.233.15";
const USER = process.env.DEPLOY_USER || "ubuntu";
const PASSWORD = process.env.DEPLOY_PASSWORD || "";
const DIR = process.env.DEPLOY_REMOTE_DIR || "/opt/legal-unit-platform";

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

const compose = `cd ${DIR} && sudo docker compose`;

const conn = new Client();
conn.on("ready", async () => {
  console.log("[fix] Stopping containers and removing db volume...");
  await run(conn, `${compose} down -v`);

  console.log("[fix] Starting containers...");
  await run(conn, `${compose} up -d`);

  console.log("[fix] Waiting for app (up to 90s)...");
  for (let i = 0; i < 18; i++) {
    const { code, out } = await run(conn, "curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/health || echo fail");
    if (out.includes("200")) {
      console.log("\n[fix] Health OK");
      await run(conn, `${compose} exec -T app node scripts/apply-pending-migrations.mjs`);
      await run(conn, `${compose} exec -T app node scripts/seed-admin.mjs`);
      console.log("\n[fix] DONE — http://" + HOST + ":3000");
      conn.end();
      return;
    }
    await run(conn, "sleep 5");
    process.stdout.write(".");
  }

  console.log("\n[fix] Health check failed — app logs:");
  await run(conn, `${compose} logs --tail=60 app`);
  conn.end();
  process.exit(1);
});
conn.connect({ host: HOST, port: 22, username: USER, password: PASSWORD, readyTimeout: 30000 });
