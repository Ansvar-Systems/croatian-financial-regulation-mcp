# Tools Reference

This MCP server exposes **8 tools** with the prefix `hr_fin_`.

All tool responses include a `_meta` block with:
- `disclaimer` — research-only disclaimer
- `copyright` — data copyright notice
- `source_urls` — authoritative source URLs
- `data_age` — ISO timestamp of the last database update

---

## hr_fin_search_regulations

Full-text search across Croatian HANFA and HNB regulatory provisions — pravilnici (rulebooks), smjernice (guidelines), and HNB odluke (decisions).

**Required parameters:**
- `query` (string) — search query in Croatian or English (e.g., `upravljanje rizicima`, `risk management`, `regulatorni kapital`)

**Optional parameters:**
- `sourcebook` (string) — filter by sourcebook ID: `HANFA_PRAVILNICI`, `HANFA_SMJERNICE`, or `HNB_ODLUKE`
- `status` (enum) — `in_force` | `deleted` | `not_yet_in_force`
- `limit` (number) — max results, default 20, max 100

**Returns:** `{ results: Provision[], count: number, _meta }`

---

## hr_fin_get_regulation

Get a specific HANFA or HNB provision by sourcebook and reference.

**Required parameters:**
- `sourcebook` (string) — sourcebook identifier (e.g., `HANFA_PRAVILNICI`)
- `reference` (string) — provision reference (e.g., `Pravilnik o upravljanju rizicima`)

**Returns:** `{ ...provision, _meta }` or an error if not found.

---

## hr_fin_list_sourcebooks

List all HANFA and HNB sourcebook collections with their names and descriptions.

**No parameters required.**

**Returns:** `{ sourcebooks: Sourcebook[], count: number, _meta }`

---

## hr_fin_search_enforcement

Search HANFA enforcement actions — rješenja (decisions), novčane kazne (fines), oduzimanja dozvola (licence revocations), and upozorenja (warnings).

**Required parameters:**
- `query` (string) — search query (e.g., firm name, breach type, `tržišna zlouporaba`)

**Optional parameters:**
- `action_type` (enum) — `fine` | `ban` | `restriction` | `warning`
- `limit` (number) — max results, default 20, max 100

**Returns:** `{ results: EnforcementAction[], count: number, _meta }`

---

## hr_fin_check_currency

Check whether a specific HANFA or HNB provision reference is currently in force.

**Required parameters:**
- `reference` (string) — provision reference to check (e.g., `Pravilnik o upravljanju rizicima`)

**Returns:** `{ reference, status, effective_date, found, _meta }`

---

## hr_fin_about

Return metadata about this MCP server: version, data source, and tool list.

**No parameters required.**

**Returns:** `{ name, version, description, data_source, tools[], _meta }`

---

## hr_fin_list_sources

List authoritative data sources used by this MCP server, with provenance metadata including authority, URL, license, and coverage description.

**No parameters required.**

**Returns:**
```json
{
  "sources": [
    {
      "id": "HANFA_PRAVILNICI",
      "name": "HANFA Pravilnici (Rulebooks)",
      "authority": "HANFA — Hrvatska agencija za nadzor financijskih usluga",
      "url": "https://www.hanfa.hr/propisi-i-nadzor/propisi/",
      "license": "Public domain — official Croatian government publication",
      "coverage": "...",
      "update_frequency": "As published by HANFA"
    },
    ...
  ],
  "_meta": { ... }
}
```

---

## hr_fin_check_data_freshness

Check data freshness for each source. Reports database age, staleness status, and provides update instructions.

**No parameters required.**

**Returns:**
```json
{
  "database_path": "data/hanfa.db",
  "last_updated": "<ISO timestamp>",
  "age_days": 12,
  "staleness_threshold_days": 90,
  "is_stale": false,
  "status": "fresh",
  "update_instructions": "Run 'npm run ingest' to fetch new regulatory data from HANFA and HNB.",
  "_meta": { ... }
}
```

**Status values:**
- `fresh` — database is up to date (age ≤ 90 days)
- `stale` — database is older than 90 days and should be refreshed
- `database_not_found` — no database file found at the configured path
