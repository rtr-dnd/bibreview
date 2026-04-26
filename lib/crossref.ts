// Thin CrossRef /works client.

const CROSSREF_URL = "https://api.crossref.org/works";

const POLITE_MAILTO = process.env.CROSSREF_MAILTO ?? "";
const USER_AGENT = `doireview/0.1 (${POLITE_MAILTO ? `mailto:${POLITE_MAILTO}` : "https://github.com/skysoyn/doireview"})`;

export type CrossrefItem = {
  DOI?: string;
  title?: string[];
  "container-title"?: string[];
  author?: { given?: string; family?: string }[];
  issued?: { "date-parts"?: number[][] };
  type?: string;
  score?: number;
  URL?: string;
};

export type SearchInput = {
  title: string;
  author: string;
  year: number | null;
  rows?: number;
};

export async function searchWorks(input: SearchInput): Promise<CrossrefItem[]> {
  const params = new URLSearchParams();
  params.set("rows", String(input.rows ?? 5));
  if (input.title) params.set("query.bibliographic", input.title);
  if (input.author) params.set("query.author", input.author);
  if (input.year) {
    params.set("filter", `from-pub-date:${input.year - 1},until-pub-date:${input.year + 1}`);
  }
  const url = `${CROSSREF_URL}?${params.toString()}`;

  // CrossRef occasionally returns 5xx/429 under burst load. Retry a couple of
  // times with jittered backoff; surface the final error otherwise.
  const maxAttempts = 3;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { message?: { items?: CrossrefItem[] } };
        return data.message?.items ?? [];
      }
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`CrossRef ${res.status}`);
      } else {
        const body = await res.text().catch(() => "");
        throw new Error(`CrossRef ${res.status}: ${body.slice(0, 200)}`);
      }
    } catch (err) {
      lastErr = err;
    }
    if (attempt < maxAttempts) {
      const delay = 250 * 2 ** (attempt - 1) + Math.floor(Math.random() * 150);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
