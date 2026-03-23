/**
 * HANFA Ingestion Crawler
 *
 * Scrapes the Croatian Financial Services Supervisory Agency
 * (HANFA — Hrvatska agencija za nadzor financijskih usluga)
 * website (hanfa.hr) and populates the SQLite database with:
 *
 *   1. Pravilnici (rulebooks) — binding regulations issued by HANFA
 *      covering capital markets, investment firms, investment funds,
 *      insurance, pensions, leasing, factoring, AML/CFT, DORA, MiCA
 *   2. Smjernice (guidelines) — non-binding guidance from HANFA
 *   3. HNB odluke (decisions) — binding decisions issued by the
 *      Croatian National Bank (Hrvatska narodna banka) on prudential
 *      requirements for credit institutions
 *   4. Enforcement actions — HANFA supervisory measures (rjesenja),
 *      fines (novcane kazne), licence revocations, warnings, and
 *      other administrative sanctions published via Management Board
 *      (Upravno vijece) session minutes
 *
 * The HANFA website organises regulations by sector under
 * hanfa.hr/regulativa/<sector>/. Each sector page lists relevant
 * laws, pravilnici, and smjernice with links to Narodne novine
 * (official gazette) or PDF downloads. Enforcement actions are
 * published as Management Board session reports at
 * hanfa.hr/sjednice-upravnog-vijeca/<year>/.
 *
 * All content is in Croatian, as issued by HANFA.
 *
 * Usage:
 *   npx tsx scripts/ingest-hanfa.ts                 # full crawl
 *   npx tsx scripts/ingest-hanfa.ts --resume        # resume from last checkpoint
 *   npx tsx scripts/ingest-hanfa.ts --dry-run       # log what would be inserted
 *   npx tsx scripts/ingest-hanfa.ts --force         # drop and recreate DB first
 *   npx tsx scripts/ingest-hanfa.ts --enforcement-only  # only crawl enforcement
 *   npx tsx scripts/ingest-hanfa.ts --docs-only     # only crawl documents
 */

import Database from "better-sqlite3";
import * as cheerio from "cheerio";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { SCHEMA_SQL } from "../src/db.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DB_PATH = process.env["HANFA_DB_PATH"] ?? "data/hanfa.db";
const PROGRESS_FILE = resolve(dirname(DB_PATH), "ingest-progress.json");
const BASE_URL = "https://www.hanfa.hr";

const RATE_LIMIT_MS = 1500;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 2000;
const FETCH_TIMEOUT_MS = 30_000;

// Browser-like UA to avoid bot blocks
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";

// CLI flags
const cliArgs = process.argv.slice(2);
const force = cliArgs.includes("--force");
const dryRun = cliArgs.includes("--dry-run");
const resume = cliArgs.includes("--resume");
const enforcementOnly = cliArgs.includes("--enforcement-only");
const docsOnly = cliArgs.includes("--docs-only");

// ---------------------------------------------------------------------------
// Sector listing-page URLs
// ---------------------------------------------------------------------------

/**
 * HANFA regulation pages — one per supervised sector.
 * Each page lists laws, pravilnici, and smjernice for that sector.
 */
const REGULATION_SECTORS: Array<{
  sourcebookId: string;
  url: string;
  label: string;
  type: string;
}> = [
  {
    sourcebookId: "HANFA_PRAVILNICI",
    url: `${BASE_URL}/regulativa/trziste-kapitala/`,
    label: "Trziste kapitala (Kapitalmarkt)",
    type: "Pravilnik",
  },
  {
    sourcebookId: "HANFA_PRAVILNICI",
    url: `${BASE_URL}/regulativa/investicijski-fondovi/`,
    label: "Investicijski fondovi",
    type: "Pravilnik",
  },
  {
    sourcebookId: "HANFA_PRAVILNICI",
    url: `${BASE_URL}/regulativa/investicijska-drustva/`,
    label: "Investicijska drustva",
    type: "Pravilnik",
  },
  {
    sourcebookId: "HANFA_PRAVILNICI",
    url: `${BASE_URL}/regulativa/mirovinski-sustav/`,
    label: "Mirovinski sustav",
    type: "Pravilnik",
  },
  {
    sourcebookId: "HANFA_PRAVILNICI",
    url: `${BASE_URL}/regulativa/trziste-osiguranja/`,
    label: "Trziste osiguranja",
    type: "Pravilnik",
  },
  {
    sourcebookId: "HANFA_PRAVILNICI",
    url: `${BASE_URL}/regulativa/leasing-trziste/`,
    label: "Leasing trziste",
    type: "Pravilnik",
  },
  {
    sourcebookId: "HANFA_PRAVILNICI",
    url: `${BASE_URL}/regulativa/faktoring-trziste/`,
    label: "Faktoring trziste",
    type: "Pravilnik",
  },
  {
    sourcebookId: "HANFA_PRAVILNICI",
    url: `${BASE_URL}/regulativa/sprjecavanje-pranja-novca-i-financiranja-terorizma/`,
    label: "Sprjecavanje pranja novca i financiranja terorizma (AML/CFT)",
    type: "Pravilnik",
  },
  {
    sourcebookId: "HANFA_PRAVILNICI",
    url: `${BASE_URL}/regulativa/digitalna-otpornost/`,
    label: "Digitalna otpornost (DORA)",
    type: "Pravilnik",
  },
  {
    sourcebookId: "HANFA_PRAVILNICI",
    url: `${BASE_URL}/regulativa/trziste-kriptoimovine/`,
    label: "Trziste kriptoimovine (MiCA)",
    type: "Pravilnik",
  },
  {
    sourcebookId: "HANFA_PRAVILNICI",
    url: `${BASE_URL}/regulativa/sanacija/`,
    label: "Sanacija (restrukturiranje)",
    type: "Pravilnik",
  },
  {
    sourcebookId: "HANFA_PRAVILNICI",
    url: `${BASE_URL}/regulativa/zakon-o-hanfi/`,
    label: "Zakon o HANFA-i",
    type: "Pravilnik",
  },
  {
    sourcebookId: "HANFA_PRAVILNICI",
    url: `${BASE_URL}/regulativa/potrosaci/`,
    label: "Potrosaci (zastita potrosaca)",
    type: "Pravilnik",
  },
  {
    sourcebookId: "HANFA_SMJERNICE",
    url: `${BASE_URL}/regulativa/uskladenje-sa-smjernicama-esma-e/`,
    label: "Uskladenje sa smjernicama ESMA-e",
    type: "Smjernice",
  },
];

/**
 * Management Board session archive — enforcement decisions are
 * published as numbered session reports organised by year.
 */
const ENFORCEMENT_YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
const ENFORCEMENT_BASE = `${BASE_URL}/sjednice-upravnog-vijeca`;
const ENFORCEMENT_MAX_SESSIONS = 60; // safety cap per year

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProvisionRow {
  sourcebook_id: string;
  reference: string;
  title: string;
  text: string;
  type: string;
  status: string;
  effective_date: string | null;
  chapter: string | null;
  section: string | null;
}

interface EnforcementRow {
  firm_name: string;
  reference_number: string | null;
  action_type: string;
  amount: number | null;
  date: string | null;
  summary: string;
  sourcebook_references: string | null;
}

interface DiscoveredDoc {
  sourcebookId: string;
  title: string;
  url: string;
  docId: string;
  type: string;
}

interface DiscoveredSession {
  title: string;
  url: string;
  year: number;
  sessionNumber: string | null;
}

interface Progress {
  completed_doc_urls: string[];
  completed_session_urls: string[];
  enforcement_last_year: number;
  last_updated: string;
}

// ---------------------------------------------------------------------------
// Utility: rate-limited fetch with retry
// ---------------------------------------------------------------------------

let lastRequestTime = 0;

async function rateLimitedFetch(
  url: string,
  opts?: RequestInit,
): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - elapsed);
  }

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      lastRequestTime = Date.now();
      const resp = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8",
          "Accept-Language": "hr-HR,hr;q=0.9,en;q=0.5",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        ...opts,
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} za ${url}`);
      }
      return resp;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `  [pokusaj ${attempt}/${MAX_RETRIES}] ${url}: ${lastError.message}`,
      );
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BACKOFF_MS * attempt);
      }
    }
  }
  throw lastError!;
}

async function fetchHtml(url: string): Promise<string> {
  const resp = await rateLimitedFetch(url);
  return resp.text();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------

function loadProgress(): Progress {
  if (resume && existsSync(PROGRESS_FILE)) {
    try {
      const raw = readFileSync(PROGRESS_FILE, "utf-8");
      const p = JSON.parse(raw) as Progress;
      console.log(
        `Napredak ucitan (${p.last_updated}): ` +
          `${p.completed_doc_urls.length} dokumenata, ` +
          `${p.completed_session_urls.length} sjednica, ` +
          `posljednja godina: ${p.enforcement_last_year}`,
      );
      return p;
    } catch {
      console.warn(
        "Datoteka napretka se ne moze procitati, pocinjem ispocetka",
      );
    }
  }
  return {
    completed_doc_urls: [],
    completed_session_urls: [],
    enforcement_last_year: 0,
    last_updated: new Date().toISOString(),
  };
}

function saveProgress(progress: Progress): void {
  progress.last_updated = new Date().toISOString();
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

function initDatabase(): Database.Database {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (force && existsSync(DB_PATH)) {
    unlinkSync(DB_PATH);
    console.log(`Postojeca baza podataka obrisana: ${DB_PATH}`);
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  console.log(`Baza podataka inicijalizirana: ${DB_PATH}`);
  return db;
}

// ---------------------------------------------------------------------------
// Sourcebook definitions
// ---------------------------------------------------------------------------

interface SourcebookDef {
  id: string;
  name: string;
  description: string;
}

const SOURCEBOOKS: SourcebookDef[] = [
  {
    id: "HANFA_PRAVILNICI",
    name: "HANFA Pravilnici (Pravilnici)",
    description:
      "Obvezujuci pravilnici koje je donijela HANFA za trziste kapitala, investicijske fondove, investicijska drustva, mirovinski sustav, osiguranje, leasing, faktoring, sprjecavanje pranja novca, digitalnu otpornost (DORA) i kriptoimovinu (MiCA).",
  },
  {
    id: "HANFA_SMJERNICE",
    name: "HANFA Smjernice (Smjernice)",
    description:
      "Neobvezujuce smjernice koje je donijela HANFA, ukljucujuci uskladenje s ESMA smjernicama, smjernice o procjeni prikladnosti, najboljoj izvrsbi, upravljanju rizicima informacijskih sustava i promidzbenim komunikacijama.",
  },
  {
    id: "HNB_ODLUKE",
    name: "HNB Odluke (Odluke HNB-a)",
    description:
      "Obvezujuce odluke Hrvatske narodne banke (HNB) o regulatornom kapitalu, likvidnosti, velikim izlozenostima i bonitetnim zahtjevima kreditnih institucija.",
  },
];

// ---------------------------------------------------------------------------
// 1. Discover documents from sector listing pages
// ---------------------------------------------------------------------------

/**
 * Scrape a HANFA regulation sector page and return discovered documents.
 *
 * HANFA sector pages typically contain:
 *   - Links to laws (zakoni) on Narodne novine (nn.hr)
 *   - Links to HANFA pravilnici (internal pages or PDFs)
 *   - Links to HANFA smjernice (PDF downloads or subpages)
 *   - Sections of inline text describing regulatory requirements
 */
async function discoverSectorDocuments(
  sourcebookId: string,
  sectorUrl: string,
  label: string,
  defaultType: string,
): Promise<DiscoveredDoc[]> {
  console.log(`\n--- ${label}: otkrivanje dokumenata ---`);
  console.log(`  URL: ${sectorUrl}`);

  const html = await fetchHtml(sectorUrl);
  const $ = cheerio.load(html);

  const docs: DiscoveredDoc[] = [];
  const seen = new Set<string>();

  // Pattern 1: PDF download links (media/ or getfile/ paths)
  $('a[href$=".pdf"], a[href*="/media/"], a[href*="/getfile/"]').each(
    (_i, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
      if (!fullUrl.includes("hanfa.hr")) return;

      const slug = fullUrl
        .replace(/\/$/, "")
        .split("/")
        .pop()
        ?.replace(/\.pdf$/i, "") ?? fullUrl;
      if (seen.has(slug)) return;
      seen.add(slug);

      const title = $(el).text().trim() || `${label} (${slug})`;
      if (title.length < 5) return;

      docs.push({
        sourcebookId,
        title,
        url: fullUrl,
        docId: slug,
        type: defaultType,
      });
    },
  );

  // Pattern 2: links to HANFA subpages (regulation detail pages)
  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    if (href.endsWith(".pdf") || href.includes("/media/") || href.includes("/getfile/")) return;

    const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    if (!fullUrl.includes("hanfa.hr")) return;

    const text = $(el).text().trim();
    if (text.length < 10) return;

    // Skip navigation, footer, breadcrumb, social links
    const parent = $(el).closest(
      "nav, footer, .breadcrumb, .menu, header, .social, .cookie",
    );
    if (parent.length > 0) return;

    // Only pick links that look like regulation or guidance documents
    const isRelevant =
      /pravilnik|smjernic|odluk|zakon|uredb|naputak|naredb|mišljenj|misljen|uputa/i.test(
        text,
      ) ||
      /pravilnik|smjernic|odluk|regulativ/i.test(fullUrl);
    if (!isRelevant) return;

    const slug = fullUrl.replace(/\/$/, "").split("/").pop() ?? fullUrl;
    if (seen.has(slug)) return;
    seen.add(slug);

    // Determine document type from text
    let type = defaultType;
    const textLower = text.toLowerCase();
    if (textLower.includes("smjernic")) {
      type = "Smjernice";
    } else if (textLower.includes("odluk")) {
      type = "Odluka";
    } else if (textLower.includes("naputak") || textLower.includes("naredb")) {
      type = "Naputak";
    } else if (textLower.includes("zakon")) {
      type = "Zakon";
    } else if (textLower.includes("uredb")) {
      type = "Uredba";
    }

    docs.push({
      sourcebookId,
      title: text,
      url: fullUrl,
      docId: slug,
      type,
    });
  });

  // Pattern 3: extract inline content sections from the page itself.
  // Many HANFA sector pages contain substantial regulatory text
  // directly on the page (not behind links).
  $("nav, header, footer, .sidebar, script, style, .menu, .breadcrumb, .cookie-bar").remove();

  const sections = $("h2, h3");
  if (sections.length > 0) {
    let sectionIdx = 0;
    sections.each((_i, heading) => {
      const headingText = $(heading).text().trim();
      if (headingText.length < 5) return;

      // Skip purely navigational headings
      if (
        /kontakt|impressum|kolacic|cookie|pretrazivanje|pretraga/i.test(
          headingText,
        )
      )
        return;

      // Collect sibling content until next heading
      let sectionText = "";
      let next = $(heading).next();
      while (next.length > 0 && !next.is("h2, h3")) {
        const nodeText = next.text().trim();
        if (nodeText.length > 0) {
          sectionText += nodeText + "\n";
        }
        next = next.next();
      }

      sectionText = sectionText.replace(/\s+/g, " ").trim();
      if (sectionText.length < 100) return;

      sectionIdx++;
      const sectorSlug = sectorUrl.replace(/\/$/, "").split("/").pop() ?? "sektor";
      const docId = `${sectorSlug}-odjeljak-${sectionIdx}`;

      if (seen.has(docId)) return;
      seen.add(docId);

      docs.push({
        sourcebookId,
        title: headingText,
        url: sectorUrl,
        docId,
        type: defaultType,
      });
    });
  }

  console.log(`  ${docs.length} dokumenata pronadeno`);
  return docs;
}

// ---------------------------------------------------------------------------
// 2. Crawl individual document pages
// ---------------------------------------------------------------------------

/**
 * Build a human-readable reference from a document.
 */
function buildReference(doc: DiscoveredDoc, sectionIndex: number): string {
  const sectorMap: Record<string, string> = {
    "trziste-kapitala": "TK",
    "investicijski-fondovi": "IF",
    "investicijska-drustva": "ID",
    "mirovinski-sustav": "MS",
    "trziste-osiguranja": "TO",
    "leasing-trziste": "LT",
    "faktoring-trziste": "FT",
    "sprjecavanje-pranja-novca-i-financiranja-terorizma": "AML",
    "digitalna-otpornost": "DORA",
    "trziste-kriptoimovine": "MiCA",
    "sanacija": "SAN",
    "zakon-o-hanfi": "ZOH",
    "potrosaci": "POT",
    "uskladenje-sa-smjernicama-esma-e": "ESMA",
  };

  let prefix = "HANFA";
  for (const [slug, code] of Object.entries(sectorMap)) {
    if (doc.url.includes(slug)) {
      prefix = code;
      break;
    }
  }

  const suffix = sectionIndex > 0 ? ` Odjeljak ${sectionIndex}` : "";
  return `${prefix}-${doc.docId}${suffix}`;
}

/**
 * Crawl a single document URL and return provision rows.
 * For HTML pages, extract main content and split into sections.
 * For PDFs, store metadata from the listing.
 */
async function crawlDocument(doc: DiscoveredDoc): Promise<ProvisionRow[]> {
  const provisions: ProvisionRow[] = [];

  try {
    const resp = await rateLimitedFetch(doc.url);
    const contentType = resp.headers.get("content-type") ?? "";

    if (contentType.includes("application/pdf")) {
      // PDF binary — store metadata only
      provisions.push({
        sourcebook_id: doc.sourcebookId,
        reference: buildReference(doc, 0),
        title: doc.title,
        text: `[PDF dokument] ${doc.title}. Izvor: ${doc.url}`,
        type: doc.type,
        status: "in_force",
        effective_date: null,
        chapter: null,
        section: null,
      });
      return provisions;
    }

    // HTML content — parse with cheerio
    const html = await resp.text();
    const $ = cheerio.load(html);

    // Remove non-content elements
    $(
      "nav, header, footer, .sidebar, script, style, .menu, .breadcrumb, .cookie-bar, .social-share",
    ).remove();

    // Extract effective date from page content
    const dateMatch = html.match(
      /(?:Stupanje\s+na\s+snagu|Datum\s+objave|Objavljeno|Na\s+snazi\s+od|NN\s+br\.\s*\d+\/)\s*[:\s]*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/i,
    );
    const effectiveDate = dateMatch
      ? `${dateMatch[3]}-${dateMatch[2]!.padStart(2, "0")}-${dateMatch[1]!.padStart(2, "0")}`
      : null;

    // Try to extract Narodne novine reference
    const nnMatch = html.match(
      /(?:Narodne\s+novine|NN)\s*(?:br\.?\s*)?(\d+\/\d{2,4}(?:\s*,\s*\d+\/\d{2,4})*)/i,
    );
    const nnRef = nnMatch ? `NN ${nnMatch[1]}` : null;

    // Strategy 1: split by headings (h2, h3) to create sections
    const headings = $("h2, h3");
    if (headings.length > 0) {
      let sectionIdx = 0;
      headings.each((_i, heading) => {
        const headingText = $(heading).text().trim();
        if (headingText.length < 3) return;

        // Collect sibling content until next heading
        let sectionText = "";
        let next = $(heading).next();
        while (next.length > 0 && !next.is("h2, h3")) {
          sectionText += next.text().trim() + "\n";
          next = next.next();
        }

        sectionText = sectionText.replace(/\s+/g, " ").trim();
        if (sectionText.length < 50) return;

        sectionIdx++;
        const chapterNum = String(sectionIdx);
        provisions.push({
          sourcebook_id: doc.sourcebookId,
          reference: nnRef
            ? `${nnRef} Odjeljak ${sectionIdx}`
            : buildReference(doc, sectionIdx),
          title: headingText,
          text: sectionText,
          type: doc.type,
          status: "in_force",
          effective_date: effectiveDate,
          chapter: chapterNum,
          section: `${chapterNum}.1`,
        });
      });
    }

    // Strategy 2: if no headings produced results, take the full content
    if (provisions.length === 0) {
      const mainText =
        $("main").text().trim() ||
        $(".content").text().trim() ||
        $("article").text().trim() ||
        $(".entry-content").text().trim() ||
        $("body").text().trim();

      const cleanText = mainText.replace(/\s+/g, " ").trim();
      if (cleanText.length > 100) {
        const pageTitle =
          $("h1").first().text().trim() || doc.title;
        provisions.push({
          sourcebook_id: doc.sourcebookId,
          reference: nnRef ?? buildReference(doc, 0),
          title: pageTitle,
          text: cleanText.slice(0, 50_000), // cap at 50k chars
          type: doc.type,
          status: "in_force",
          effective_date: effectiveDate,
          chapter: null,
          section: null,
        });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  Greska pri indeksiranju ${doc.url}: ${msg}`);
  }

  return provisions;
}

// ---------------------------------------------------------------------------
// 3. Crawl enforcement actions (Upravno vijece sjednice)
// ---------------------------------------------------------------------------

/**
 * Discover Management Board session links for a given year.
 * Session pages are listed at hanfa.hr/sjednice-upravnog-vijeca/<year>/
 * with individual sessions at hanfa.hr/sjednice-upravnog-vijeca/<year>/<N>-sjednica-...
 */
async function discoverSessions(
  year: number,
): Promise<DiscoveredSession[]> {
  const url = `${ENFORCEMENT_BASE}/${year}/`;
  console.log(`  Sjednice za ${year}: ${url}`);

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  Godina ${year} preskocena: ${msg}`);
    return [];
  }

  const $ = cheerio.load(html);
  const sessions: DiscoveredSession[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    if (!fullUrl.includes("sjednice-upravnog-vijeca")) return;
    if (!fullUrl.includes(`/${year}/`)) return;

    // Must link to an individual session, not the year overview
    const slug = fullUrl.replace(/\/$/, "").split("/").pop() ?? "";
    if (!slug || slug === String(year)) return;

    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    const title = $(el).text().trim();
    if (title.length < 5) return;

    // Extract session number
    const numMatch = slug.match(/^(\d+)/);
    const sessionNumber = numMatch ? numMatch[1] ?? null : null;

    sessions.push({
      title,
      url: fullUrl,
      year,
      sessionNumber,
    });
  });

  // Cap to avoid runaway crawling
  const limited = sessions.slice(0, ENFORCEMENT_MAX_SESSIONS);
  console.log(`  ${limited.length} sjednica pronadeno za ${year}`);
  return limited;
}

/**
 * Croatian month name to number mapping.
 */
const HR_MONTHS: Record<string, string> = {
  sijecanj: "01", sijecnja: "01", sijecnju: "01",
  veljaca: "02", veljace: "02", veljaci: "02",
  ozujak: "03", ozujka: "03", ozujku: "03",
  travanj: "04", travnja: "04", travnju: "04",
  svibanj: "05", svibnja: "05", svibnju: "05",
  lipanj: "06", lipnja: "06", lipnju: "06",
  srpanj: "07", srpnja: "07", srpnju: "07",
  kolovoz: "08", kolovoza: "08", kolovozu: "08",
  rujan: "09", rujna: "09", rujnu: "09",
  listopad: "10", listopada: "10", listopadu: "10",
  studeni: "11", studenoga: "11", studenom: "11",
  prosinac: "12", prosinca: "12", prosincu: "12",
};

/**
 * Parse a Croatian date string (e.g., "12. ozujka 2024." or "12.03.2024")
 * into ISO format YYYY-MM-DD.
 */
function parseCroatianDate(text: string): string | null {
  // Numeric format: DD.MM.YYYY
  const numMatch = text.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (numMatch) {
    return `${numMatch[3]}-${numMatch[2]!.padStart(2, "0")}-${numMatch[1]!.padStart(2, "0")}`;
  }

  // Text format: DD. monthname YYYY
  const textMatch = text.match(
    /(\d{1,2})\.\s*([a-zA-ZčćšžđČĆŠŽĐ]+)\s+(\d{4})/,
  );
  if (textMatch) {
    const monthName = textMatch[2]!.toLowerCase()
      .replace(/č/g, "c")
      .replace(/ć/g, "c")
      .replace(/š/g, "s")
      .replace(/ž/g, "z")
      .replace(/đ/g, "d");
    const monthNum = HR_MONTHS[monthName];
    if (monthNum) {
      return `${textMatch[3]}-${monthNum}-${textMatch[1]!.padStart(2, "0")}`;
    }
  }

  return null;
}

/**
 * Parse a single Management Board session page and extract enforcement actions.
 *
 * Session pages contain summaries of decisions (rjesenja), including:
 *   - Nadzorne mjere (supervisory measures)
 *   - Novcane kazne (fines)
 *   - Oduzimanje odobrenja (licence revocations)
 *   - Upozorenja (warnings)
 *   - Odobrenja (approvals — not enforcement, skip these)
 */
async function crawlSessionPage(
  session: DiscoveredSession,
): Promise<EnforcementRow[]> {
  const results: EnforcementRow[] = [];

  try {
    const html = await fetchHtml(session.url);
    const $ = cheerio.load(html);

    // Remove non-content
    $(
      "nav, header, footer, .sidebar, script, style, .menu, .breadcrumb, .cookie-bar",
    ).remove();

    const bodyText =
      $(".content").text().trim() ||
      $("main").text().trim() ||
      $("article").text().trim() ||
      $(".entry-content").text().trim();

    if (bodyText.length < 50) return results;

    // Extract date from the session page
    let sessionDate = parseCroatianDate(bodyText);
    if (!sessionDate && session.year) {
      // Fallback: use year from URL
      sessionDate = `${session.year}-01-01`;
    }

    // Split the page into decision blocks.
    // HANFA sessions typically list decisions as numbered items or
    // paragraphs separated by firm names / decision descriptions.
    // We look for paragraphs that mention enforcement-related keywords.

    const paragraphs: string[] = [];

    // Collect text from list items and paragraphs
    $("li, p, .decision, .rjesenje").each((_i, el) => {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text.length > 50) {
        paragraphs.push(text);
      }
    });

    // If no structured content, split the body text by sentence groups
    if (paragraphs.length === 0) {
      const sentences = bodyText.split(/(?<=\.)\s+/);
      let current = "";
      for (const s of sentences) {
        current += s + " ";
        if (current.length > 200) {
          paragraphs.push(current.trim());
          current = "";
        }
      }
      if (current.length > 50) {
        paragraphs.push(current.trim());
      }
    }

    for (const para of paragraphs) {
      const paraLower = para.toLowerCase();

      // Skip paragraphs that are clearly not enforcement actions
      const isEnforcement =
        /nadzorn[aeiou]\s+mjer[aeiou]|novcana\s+kazn[aeiou]|novčana\s+kazn[aeiou]|oduzim|oduzet|upozoren|prekršaj|prekrsaj|sankcij|kažnj|kaznj|nepravilnost|nezakonit|povreda|rješenj|rjesenj|zabran/i.test(
          paraLower,
        );
      if (!isEnforcement) continue;

      // Extract firm name — look for d.d., d.o.o., or quoted names
      let firmName = "Nepoznato";
      const firmPatterns = [
        // "drustvo XYZ d.d." or "drustvu XYZ d.o.o."
        /(?:društv[aeiou]|drustvo|subjekat|subjekt[aeiou]|osob[aeiou])\s+(.+?)\s*(?:d\.d\.|d\.o\.o\.|j\.d\.o\.o\.)/i,
        // "XYZ d.d." standalone
        /([A-ZČĆŠŽĐ][^\n,]{3,50}?\s*(?:d\.d\.|d\.o\.o\.|j\.d\.o\.o\.))/,
        // "protiv XYZ" (against XYZ)
        /protiv\s+(.+?)(?:\s+zbog|\s+radi|\s+jer|\s*,|\s*\.)/i,
      ];

      for (const pat of firmPatterns) {
        const match = para.match(pat);
        if (match) {
          firmName = match[1]!.trim().replace(/\s+/g, " ");
          // Clean up trailing prepositions
          firmName = firmName.replace(
            /\s+(?:zbog|radi|jer|na|u|s|za|od)$/i,
            "",
          );
          if (firmName.length > 3 && firmName.length < 150) break;
          firmName = "Nepoznato";
        }
      }

      // Determine action type
      let actionType = "sanction";
      if (/novčan[aeiou]\s+kazn[aeiou]|novcana\s+kazn[aeiou]|prekršajn/i.test(paraLower)) {
        actionType = "fine";
      } else if (/oduzim|oduzet|ukinut|opozva/i.test(paraLower)) {
        actionType = "ban";
      } else if (/upozoren/i.test(paraLower)) {
        actionType = "warning";
      } else if (/ogranič|ogranic|zabran|suspenz/i.test(paraLower)) {
        actionType = "restriction";
      }

      // Try to extract monetary amount
      let amount: number | null = null;
      const amountPatterns = [
        /(?:kazn[aeiou]\s+(?:u\s+iznosu\s+od\s+)?|iznos[aeiou]\s+(?:od\s+)?)([\d.,]+)\s*(?:EUR|eur|kuna|HRK|kn)/i,
        /([\d.,]+)\s*(?:EUR|eur|kuna|HRK|kn)/i,
      ];
      for (const pat of amountPatterns) {
        const match = para.match(pat);
        if (match) {
          const raw = match[1]!.replace(/\./g, "").replace(",", ".");
          const parsed = parseFloat(raw);
          if (!isNaN(parsed) && parsed > 0) {
            amount = parsed;
            break;
          }
        }
      }

      // Extract date from paragraph if available
      const paraDate = parseCroatianDate(para);

      // Extract referenced law or regulation
      let sourcebookRefs: string | null = null;
      const lawRefs: string[] = [];
      const lawPatterns = [
        /ZTK|Zakon\s+o\s+trzištu\s+kapitala|Zakon\s+o\s+tržištu\s+kapitala/gi,
        /ZAIF|Zakon\s+o\s+alternativnim\s+investicijskim\s+fondovima/gi,
        /ZOO|Zakon\s+o\s+osiguranju/gi,
        /ZMOF|Zakon\s+o\s+mirovinskim\s+osiguravajucim\s+drustvima/gi,
        /ZSPNFT|Zakon\s+o\s+sprječavanju\s+pranja\s+novca/gi,
        /ZIF|Zakon\s+o\s+investicijskim\s+fondovima/gi,
        /ZL|Zakon\s+o\s+leasingu/gi,
        /ZF|Zakon\s+o\s+faktoringu/gi,
        /Zakon\s+o\s+HANFA/gi,
        /MiFID\s*II?/gi,
        /MAR/g,
        /CRR|CRD/gi,
        /DORA/gi,
        /MiCA/gi,
        /Solvency\s*II?/gi,
        /UCITS/gi,
        /AIFMD/gi,
        /IFR|IFD/gi,
      ];
      for (const pat of lawPatterns) {
        const matches = para.match(pat);
        if (matches) {
          for (const m of matches) {
            if (!lawRefs.includes(m)) lawRefs.push(m);
          }
        }
      }
      if (lawRefs.length > 0) {
        sourcebookRefs = lawRefs.join(", ");
      }

      // Build reference number from session
      const refNum = session.sessionNumber
        ? `${session.year}-HANFA-S${session.sessionNumber}`
        : `${session.year}-HANFA`;

      results.push({
        firm_name: firmName,
        reference_number: refNum,
        action_type: actionType,
        amount,
        date: paraDate ?? sessionDate,
        summary: para.slice(0, 10_000),
        sourcebook_references: sourcebookRefs,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  Greska pri sjednici ${session.url}: ${msg}`);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Database insertion helpers
// ---------------------------------------------------------------------------

function insertSourcebooks(db: Database.Database): void {
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO sourcebooks (id, name, description) VALUES (?, ?, ?)",
  );
  const tx = db.transaction(() => {
    for (const sb of SOURCEBOOKS) {
      stmt.run(sb.id, sb.name, sb.description);
    }
  });
  tx();
  console.log(`${SOURCEBOOKS.length} izvorna podrucja umetnuta/azurirana`);
}

function insertProvision(db: Database.Database, p: ProvisionRow): void {
  db.prepare(
    `INSERT INTO provisions (sourcebook_id, reference, title, text, type, status, effective_date, chapter, section)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    p.sourcebook_id,
    p.reference,
    p.title,
    p.text,
    p.type,
    p.status,
    p.effective_date,
    p.chapter,
    p.section,
  );
}

function referenceExists(db: Database.Database, reference: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM provisions WHERE reference = ? LIMIT 1")
    .get(reference);
  return row !== undefined;
}

function insertEnforcement(db: Database.Database, e: EnforcementRow): void {
  db.prepare(
    `INSERT INTO enforcement_actions
       (firm_name, reference_number, action_type, amount, date, summary, sourcebook_references)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    e.firm_name,
    e.reference_number,
    e.action_type,
    e.amount,
    e.date,
    e.summary,
    e.sourcebook_references,
  );
}

function enforcementExists(
  db: Database.Database,
  firmName: string,
  date: string | null,
  summary: string,
): boolean {
  // Check by firm name + date first
  if (date) {
    const row = db
      .prepare(
        "SELECT 1 FROM enforcement_actions WHERE firm_name = ? AND date = ? LIMIT 1",
      )
      .get(firmName, date);
    if (row !== undefined) return true;
  }

  // Fallback: check by summary prefix to avoid exact-same decisions
  const summaryPrefix = summary.slice(0, 200);
  const row = db
    .prepare(
      "SELECT 1 FROM enforcement_actions WHERE summary LIKE ? LIMIT 1",
    )
    .get(`${summaryPrefix}%`);
  return row !== undefined;
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

interface Stats {
  docsDiscovered: number;
  docsSkipped: number;
  provisionsInserted: number;
  sessionsDiscovered: number;
  sessionsSkipped: number;
  enforcementInserted: number;
  enforcementSkipped: number;
  errors: number;
}

function newStats(): Stats {
  return {
    docsDiscovered: 0,
    docsSkipped: 0,
    provisionsInserted: 0,
    sessionsDiscovered: 0,
    sessionsSkipped: 0,
    enforcementInserted: 0,
    enforcementSkipped: 0,
    errors: 0,
  };
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== HANFA Ingestion Crawler ===");
  console.log(`  Baza podataka:   ${DB_PATH}`);
  console.log(`  Nacin rada:      ${dryRun ? "probni rad (dry-run)" : "produkcijski"}`);
  console.log(`  Nastavak:        ${resume ? "da" : "ne"}`);
  console.log(`  Forsiranje:      ${force ? "da" : "ne"}`);
  console.log("");

  const db = dryRun ? null : initDatabase();
  if (db && !dryRun) {
    insertSourcebooks(db);
  }

  const progress = loadProgress();
  const stats = newStats();

  // ---- Phase 1: Regulatory documents (Pravilnici, Smjernice) ----

  if (!enforcementOnly) {
    const allDocs: DiscoveredDoc[] = [];

    for (const sector of REGULATION_SECTORS) {
      try {
        const docs = await discoverSectorDocuments(
          sector.sourcebookId,
          sector.url,
          sector.label,
          sector.type,
        );
        allDocs.push(...docs);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  GRESKA pri sektoru ${sector.label}: ${msg}`);
        stats.errors++;
      }
    }

    stats.docsDiscovered = allDocs.length;
    console.log(`\nUkupno otkrivenih dokumenata: ${allDocs.length}`);

    // Crawl each document
    for (let i = 0; i < allDocs.length; i++) {
      const doc = allDocs[i]!;

      // Skip if already processed (resume mode)
      if (resume && progress.completed_doc_urls.includes(doc.url)) {
        stats.docsSkipped++;
        continue;
      }

      console.log(
        `\n[${i + 1}/${allDocs.length}] ${doc.title.slice(0, 80)}`,
      );
      console.log(`  URL: ${doc.url}`);

      const provisions = await crawlDocument(doc);

      if (dryRun) {
        console.log(
          `  -> ${provisions.length} odredbi (probni rad)`,
        );
        for (const p of provisions) {
          console.log(
            `     ${p.reference}: ${(p.title ?? "").slice(0, 60)} (${p.text.length} znakova)`,
          );
        }
      } else if (db) {
        let inserted = 0;
        for (const p of provisions) {
          if (!referenceExists(db, p.reference)) {
            insertProvision(db, p);
            inserted++;
          }
        }
        stats.provisionsInserted += inserted;
        console.log(
          `  -> ${inserted} odredbi umetnuto (${provisions.length} pronadeno)`,
        );
      }

      // Update progress
      progress.completed_doc_urls.push(doc.url);
      if (!dryRun) {
        saveProgress(progress);
      }
    }
  }

  // ---- Phase 2: Enforcement actions (Upravno vijece sjednice) ----

  if (!docsOnly) {
    console.log("\n\n=== Nadzorne mjere / Provedba ===");

    const startYear = resume
      ? Math.max(progress.enforcement_last_year, ENFORCEMENT_YEARS[0]!)
      : ENFORCEMENT_YEARS[0]!;

    for (const year of ENFORCEMENT_YEARS) {
      if (year < startYear) continue;

      let sessions: DiscoveredSession[];
      try {
        sessions = await discoverSessions(year);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  GRESKA za godinu ${year}: ${msg}`);
        stats.errors++;
        continue;
      }

      stats.sessionsDiscovered += sessions.length;

      for (const session of sessions) {
        // Skip if already processed
        if (
          resume &&
          progress.completed_session_urls.includes(session.url)
        ) {
          stats.sessionsSkipped++;
          continue;
        }

        console.log(
          `    -> ${session.title.slice(0, 80)}`,
        );

        const rows = await crawlSessionPage(session);

        if (dryRun) {
          for (const row of rows) {
            console.log(
              `       ${row.firm_name} | ${row.action_type} | ${row.amount ?? "-"} EUR | ${row.date ?? "nema datuma"}`,
            );
          }
        } else if (db) {
          for (const row of rows) {
            if (
              !enforcementExists(db, row.firm_name, row.date, row.summary)
            ) {
              insertEnforcement(db, row);
              stats.enforcementInserted++;
            } else {
              stats.enforcementSkipped++;
            }
          }
        }

        progress.completed_session_urls.push(session.url);
      }

      progress.enforcement_last_year = year;
      if (!dryRun) {
        saveProgress(progress);
      }
    }
  }

  // ---- Summary ----

  console.log("\n\n=== Sazetak ===");
  console.log(`  Dokumenata otkriveno:       ${stats.docsDiscovered}`);
  console.log(`  Dokumenata preskoceno:      ${stats.docsSkipped}`);
  console.log(`  Odredbi umetnuto:           ${stats.provisionsInserted}`);
  console.log(`  Sjednica otkriveno:         ${stats.sessionsDiscovered}`);
  console.log(`  Sjednica preskoceno:        ${stats.sessionsSkipped}`);
  console.log(`  Nadzornih mjera umetnuto:   ${stats.enforcementInserted}`);
  console.log(`  Nadzornih mjera preskoceno: ${stats.enforcementSkipped}`);
  console.log(`  Gresaka:                    ${stats.errors}`);

  if (!dryRun && db) {
    const provCount = (
      db.prepare("SELECT count(*) as cnt FROM provisions").get() as {
        cnt: number;
      }
    ).cnt;
    const sbCount = (
      db.prepare("SELECT count(*) as cnt FROM sourcebooks").get() as {
        cnt: number;
      }
    ).cnt;
    const enfCount = (
      db.prepare("SELECT count(*) as cnt FROM enforcement_actions").get() as {
        cnt: number;
      }
    ).cnt;
    const ftsCount = (
      db.prepare("SELECT count(*) as cnt FROM provisions_fts").get() as {
        cnt: number;
      }
    ).cnt;

    console.log("\nStanje baze podataka:");
    console.log(`  Izvorna podrucja:      ${sbCount}`);
    console.log(`  Odredbe:               ${provCount}`);
    console.log(`  Nadzorne mjere:        ${enfCount}`);
    console.log(`  FTS unosi:             ${ftsCount}`);

    db.close();
  }

  console.log(`\nZavrseno. Napredak spremljen: ${PROGRESS_FILE}`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error("Fatalna greska:", err);
  process.exit(1);
});
