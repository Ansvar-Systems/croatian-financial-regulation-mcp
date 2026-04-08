# Coverage

This file documents the corpus completeness of the Croatian Financial Regulation MCP.

## Sources

| Sourcebook ID | Authority | Type | Coverage |
|---------------|-----------|------|----------|
| `HANFA_PRAVILNICI` | HANFA (Croatian Financial Services Supervisory Agency) | Pravilnici (Rulebooks) | HANFA rulebooks covering investment services, capital markets, insurance, and pension funds. ~50+ documents ingested. |
| `HANFA_SMJERNICE` | HANFA | Smjernice (Guidelines) | HANFA supervisory guidelines and recommendations. |
| `HNB_ODLUKE` | HNB (Croatian National Bank) | Odluke (Decisions) | HNB decisions on regulatory capital, liquidity, and banking supervision. |

## Ingest Progress

The ingest pipeline has processed **1,229+ HANFA documents** from official HANFA publications
(see `data/ingest-progress.json` for the full list of ingested URLs).

## Known Gaps

- **HNB coverage** is currently limited. HNB banking decisions are partially indexed; ongoing ingest work is required.
- **Historical versions** of amended pravilnici are not systematically stored. The database primarily contains the most recent versions.
- **Enforcement actions** (HANFA rješenja, novčane kazne) are partially indexed. Systematic crawling of enforcement decisions is ongoing.

## Data Freshness

Run `npm run ingest` to re-fetch the latest HANFA documents.

The `hr_fin_check_data_freshness` tool returns the current database age. Data older than 90 days is flagged as stale.

## Coverage Policy

This MCP aims to cover:
- All HANFA pravilnici (rulebooks) in force
- All HANFA smjernice (supervisory guidelines)
- Major HNB decisions on prudential regulation
- HANFA enforcement actions (rješenja, sanctions)

Coverage is updated as new documents are published by HANFA and HNB.
