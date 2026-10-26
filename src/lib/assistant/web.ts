/**
 * Web access for the AI Assistant, so it can answer with today's facts (news, prices, weather, rules, anything on the internet) without a paid search
 * plan: a Bing / DuckDuckGo search, Google News for news, and a reader for a page. Only public pages are read; nothing of this business is ever sent.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type WebResult = { title: string; url: string; snippet: string; date?: string };

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/\s+/g, " ")
    .trim();

async function fetchText(url: string, ms: number): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-MY,en;q=0.9,ms;q=0.8" }, signal: AbortSignal.timeout(ms), redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

const tag = (block: string, name: string) => block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "";

async function bingSearch(query: string): Promise<WebResult[]> {
  const xml = await fetchText(`https://www.bing.com/search?format=rss&count=8&q=${encodeURIComponent(query)}`, 8_000);
  return (xml.match(/<item>[\s\S]*?<\/item>/g) ?? [])
    .map((item) => ({ title: decode(tag(item, "title")), url: decode(tag(item, "link")), snippet: decode(tag(item, "description")), date: decode(tag(item, "pubDate")) || undefined }))
    .filter((r) => /^https?:\/\//.test(r.url));
}

async function duckSearch(query: string): Promise<WebResult[]> {
  const html = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, 8_000);
  const out: WebResult[] = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
  for (const m of html.matchAll(re)) {
    let url = m[1].replace(/&amp;/g, "&");
    const wrapped = url.match(/[?&]uddg=([^&]+)/);
    if (wrapped) url = decodeURIComponent(wrapped[1]);
    if (url.startsWith("//")) url = `https:${url}`;
    if (/^https?:\/\//.test(url) && !/duckduckgo\.com\/y\.js/.test(url)) out.push({ title: decode(m[2]), url, snippet: decode(m[3] ?? "") });
    if (out.length >= 8) break;
  }
  return out;
}

async function newsSearch(query: string): Promise<WebResult[]> {
  const xml = await fetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-MY&gl=MY&ceid=MY:en`, 8_000);
  return (xml.match(/<item>[\s\S]*?<\/item>/g) ?? []).slice(0, 8).map((item) => ({
    title: decode(tag(item, "title")),
    url: decode(tag(item, "link")),
    snippet: decode(tag(item, "source")),
    date: decode(tag(item, "pubDate")) || undefined,
  }));
}

/** A web search: the web results first (Bing, then DuckDuckGo when Bing gives nothing) and, for news, the newest headlines from Google News. */
export async function searchWeb(query: string, opts: { news?: boolean } = {}): Promise<WebResult[]> {
  const q = query.trim().slice(0, 300);
  if (!q) return [];
  const tasks: Promise<WebResult[]>[] = [];
  if (opts.news) tasks.push(newsSearch(q).catch(() => []));
  tasks.push(bingSearch(q).catch(() => []));
  const [first, second] = await Promise.all([tasks[0], tasks[1] ?? Promise.resolve<WebResult[]>([])]);
  let results = opts.news ? [...first.slice(0, 5), ...second] : first;
  if (results.length < 3) results = [...results, ...(await duckSearch(q).catch(() => []))];
  const seen = new Set<string>();
  return results.filter((r) => r.title && !seen.has(r.url) && seen.add(r.url)).slice(0, 8);
}

/** Only public web addresses: never this machine, a private network or a non-web address. */
function publicUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return null;
  if (/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return null;
  }
  if (h.startsWith("[")) return null;
  return u;
}

/** The text of a public web page (scripts, menus and styles removed), cut to what the AI needs to answer. */
export async function readWebPage(rawUrl: string, maxChars = 6000): Promise<{ url: string; title: string; text: string }> {
  const u = publicUrl(rawUrl);
  if (!u) throw new Error("This address cannot be opened (only public web pages can be read).");
  const html = await fetchText(u.toString(), 9_000);
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const text = decode(body.replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n"));
  return { url: u.toString(), title, text: text.slice(0, maxChars) };
}
