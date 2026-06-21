import { Client } from "ssh2";

const HOST = "34.142.233.15";
const PASSWORD = process.env.DEPLOY_PASSWORD || "";
const DIR = "/opt/legal-unit-platform";

function run(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on("data", (d) => process.stdout.write(d));
      stream.stderr.on("data", (d) => process.stderr.write(d));
      stream.on("close", (code) => (code === 0 ? resolve() : reject(new Error(String(code)))));
    });
  });
}

const conn = new Client();
conn.on("ready", async () => {
  await run(
    conn,
    `cd ${DIR} && grep -q '^CORS_ORIGINS=.*34.142.233.15$' .env || sed -i 's|^CORS_ORIGINS=.*|CORS_ORIGINS=http://${HOST}:3000,http://${HOST}|' .env && grep CORS_ORIGINS .env`,
  );
  await run(conn, `cd ${DIR} && sudo docker compose up -d app`);
  console.log("CORS updated");
  conn.end();
});
conn.connect({ host: HOST, port: 22, username: "ubuntu", password: PASSWORD, readyTimeout: 20000 });
