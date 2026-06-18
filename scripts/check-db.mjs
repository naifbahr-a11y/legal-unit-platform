import mysql from "mysql2/promise";

const c = await mysql.createConnection("mysql://root@127.0.0.1:3306/legal_unit");
const [tables] = await c.query("SHOW TABLES");
console.log("tables:", tables.map((t) => Object.values(t)[0]).filter((n) => /debt|app_settings|forged/.test(n)));
const [caseCols] = await c.query("DESCRIBE cases");
console.log("cases cols:", caseCols.map((x) => x.Field).join(", "));
const [fcCols] = await c.query("DESCRIBE forged_checks");
console.log("forged_checks cols:", fcCols.map((x) => x.Field).join(", "));
await c.end();
