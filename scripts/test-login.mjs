const base = process.argv[2] || "http://localhost:3003";

async function main() {
  const loginRes = await fetch(`${base}/api/trpc/auth.login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { username: "nayef", password: "admin1987" } }),
  });
  const loginBody = await loginRes.text();
  console.log("login status:", loginRes.status);
  console.log("login body:", loginBody.slice(0, 500));
  const cookie = loginRes.headers.getSetCookie?.() ?? [loginRes.headers.get("set-cookie")].filter(Boolean);
  console.log("cookies:", cookie);

  const cookieHeader = Array.isArray(cookie) ? cookie.map((c) => c.split(";")[0]).join("; ") : "";
  const meRes = await fetch(`${base}/api/trpc/auth.me`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
  const meBody = await meRes.text();
  console.log("me status:", meRes.status);
  console.log("me body:", meBody.slice(0, 500));
}

main().catch(console.error);
