import { Client } from "ssh2";

const HOST = "34.142.233.15";
const USER = "ubuntu";
const PASSWORD = process.env.DEPLOY_PASSWORD || "";

function run(conn, cmd) {
  return new Promise((resolve) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return resolve({ code: 1, out: String(err) });
      let out = "";
      stream.on("data", (d) => { out += d; process.stdout.write(d); });
      stream.stderr.on("data", (d) => { out += d; process.stderr.write(d); });
      stream.on("close", (code) => resolve({ code, out }));
    });
  });
}

const conn = new Client();
conn.on("ready", async () => {
  console.log("=== containers ===");
  await run(conn, "sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'");
  console.log("\n=== local health ===");
  await run(conn, "curl -s -o /dev/null -w 'health:%{http_code}\\n' http://127.0.0.1:3000/api/health");
  console.log("\n=== listening ports ===");
  await run(conn, "sudo ss -tlnp | grep -E ':3000|:80|:443' || true");
  console.log("\n=== ufw ===");
  await run(conn, "sudo ufw status 2>/dev/null || echo ufw-not-installed");
  console.log("\n=== iptables INPUT (first 20) ===");
  await run(conn, "sudo iptables -L INPUT -n --line-numbers 2>/dev/null | head -20 || true");
  console.log("\n=== external IP ===");
  await run(conn, "curl -s -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip 2>/dev/null || hostname -I");
  conn.end();
});
conn.connect({ host: HOST, port: 22, username: USER, password: PASSWORD, readyTimeout: 20000 });
