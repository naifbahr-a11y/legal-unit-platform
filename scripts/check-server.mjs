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
  console.log("=== docker ps ===");
  await run(conn, "sudo docker ps -a");
  console.log("\n=== compose logs (last 30) ===");
  await run(conn, "cd /opt/legal-unit-platform && sudo docker compose logs --tail=30 app 2>&1");
  console.log("\n=== health local ===");
  await run(conn, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/health || echo fail");
  conn.end();
});
conn.connect({ host: HOST, port: 22, username: USER, password: PASSWORD, readyTimeout: 20000 });
