import { Client } from "ssh2";

const HOST = "34.142.233.15";
const USER = "ubuntu";
const PASSWORD = process.env.DEPLOY_PASSWORD || "";

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
  await run(conn, "cd /opt/legal-unit-platform && sudo docker compose logs --tail=50 app 2>&1");
  console.log("\n=== .env (redacted) ===");
  await run(conn, "cd /opt/legal-unit-platform && grep -E '^(MYSQL_|DATABASE)' .env 2>/dev/null | sed 's/=.*/=***/' || echo no-env");
  console.log("\n=== db ping from app ===");
  await run(conn, `cd /opt/legal-unit-platform && sudo docker compose exec -T app node -e "const mysql=require('mysql2/promise'); const u=process.env.DATABASE_URL; console.log('url host part:', u&&u.split('@').slice(1).join('@')); mysql.createConnection(u).then(c=>c.ping().then(()=>{console.log('OK');return c.end()})).catch(e=>console.error('ERR',e.message))" 2>&1`);
  conn.end();
});
conn.connect({ host: HOST, port: 22, username: USER, password: PASSWORD, readyTimeout: 20000 });
