import { Client } from "ssh2";

const HOST = "34.142.233.15";
const USER = "ubuntu";
const PASSWORD = process.env.DEPLOY_PASSWORD || "";

function run(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on("data", (d) => process.stdout.write(d));
      stream.stderr.on("data", (d) => process.stderr.write(d));
      stream.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    });
  });
}

const conn = new Client();
conn.on("ready", async () => {
  console.log("[fix] Opening port 3000 in UFW...");
  await run(conn, "sudo ufw allow 3000/tcp comment 'legal-unit-app'");
  await run(conn, "sudo ufw status numbered");
  console.log("\n[fix] Done");
  conn.end();
});
conn.connect({ host: HOST, port: 22, username: USER, password: PASSWORD, readyTimeout: 20000 });
