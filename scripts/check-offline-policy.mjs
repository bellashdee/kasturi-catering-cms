// Checks that the offline page lists of the service worker (public/sw.js) and of the app (src/lib/offline/policy.ts) are the same,
// so a page is never kept by one and treated as online-only by the other. Run: node scripts/check-offline-policy.mjs
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const list = (source, name) => {
  const m = source.match(new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!m) throw new Error(`${name} not found`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
};

const sw = read("public/sw.js");
const app = read("src/lib/offline/policy.ts");
let ok = true;
for (const name of ["OFFLINE_PAGES", "NEVER_OFFLINE"]) {
  const a = list(sw, name);
  const b = list(app, name);
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    ok = false;
    console.error(`${name} differs:\n  sw.js:     ${a.join(", ")}\n  policy.ts: ${b.join(", ")}`);
  }
}
// pages with private or finance data must never be in the kept list
const forbidden = ["/payroll-centre", "/hr", "/finance", "/reports", "/admin", "/settings", "/profile", "/ai-assistant"];
for (const p of list(sw, "OFFLINE_PAGES")) {
  if (forbidden.some((f) => p === f || p.startsWith(`${f}/`))) {
    ok = false;
    console.error(`${p} holds private or finance data and must not be kept offline`);
  }
}
console.log(ok ? "offline policy: OK" : "offline policy: MISMATCH");
process.exit(ok ? 0 : 1);
