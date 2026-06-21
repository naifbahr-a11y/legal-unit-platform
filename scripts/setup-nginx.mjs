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
      stream.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}: ${cmd.slice(0, 80)}`))));
    });
  });
}

const nginxConf = `server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
`;

const conn = new Client();
conn.on("ready", async () => {
  console.log("[nginx] Installing nginx...");
  await run(conn, "sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx");

  console.log("[nginx] Writing site config...");
  await run(
    conn,
    `sudo tee /etc/nginx/sites-available/legal-unit > /dev/null << 'EOF'\n${nginxConf}EOF`,
  );
  await run(conn, "sudo ln -sf /etc/nginx/sites-available/legal-unit /etc/nginx/sites-enabled/legal-unit");
  await run(conn, "sudo rm -f /etc/nginx/sites-enabled/default");
  await run(conn, "sudo nginx -t");
  await run(conn, "sudo systemctl enable nginx && sudo systemctl restart nginx");

  console.log("[nginx] Opening port 80 in UFW...");
  await run(conn, "sudo ufw allow 80/tcp comment 'legal-unit-http'");
  await run(conn, "sudo ufw allow 443/tcp comment 'legal-unit-https-future'");

  console.log("\n[nginx] Local checks:");
  await run(conn, "curl -s -o /dev/null -w 'port80:%{http_code}\\n' http://127.0.0.1/api/health");
  await run(conn, "curl -s -o /dev/null -w 'port3000:%{http_code}\\n' http://127.0.0.1:3000/api/health");
  await run(conn, "sudo ufw status numbered");
  console.log("\n[nginx] DONE");
  conn.end();
});
conn.connect({ host: HOST, port: 22, username: USER, password: PASSWORD, readyTimeout: 30000 });
