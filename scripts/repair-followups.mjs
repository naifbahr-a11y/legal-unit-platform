import { Client } from "ssh2";

const PASSWORD = process.env.DEPLOY_PASSWORD || "";

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
    `cd /opt/legal-unit-platform && sudo docker compose exec -T app node -e "
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await c.execute(
  \\\`SELECT lr.id FROM legal_reviews lr
   JOIN cases c ON c.id = lr.relatedCaseId
   WHERE lr.followupStatus IN ('awaiting_submission','rejected','pending_approval')
     AND lr.reviewStatus IN ('in_review','completed')
     AND c.lastActions IS NOT NULL AND TRIM(c.lastActions) <> ''\\\`
);
for (const r of rows) {
  await c.execute('UPDATE legal_reviews SET followupStatus=?, followupRejectNote=NULL WHERE id=?', ['approved', r.id]);
}
console.log('Repaired', rows.length, 'followups');
await c.end();
"`,
  );
  conn.end();
});
conn.connect({ host: "34.142.233.15", port: 22, username: "ubuntu", password: PASSWORD, readyTimeout: 20000 });
