# Croatian Financial Regulation MCP

MCP server for querying Croatian HANFA (Hrvatska agencija za nadzor financijskih usluga) pravilnici and smjernice, plus HNB (Hrvatska narodna banka) regulatory decisions and enforcement actions.

## Tools

| Tool | Description |
|------|-------------|
| `hr_fin_search_regulations` | Full-text search across HANFA and HNB provisions |
| `hr_fin_get_regulation` | Get a specific provision by sourcebook and reference |
| `hr_fin_list_sourcebooks` | List all sourcebook collections |
| `hr_fin_search_enforcement` | Search HANFA enforcement actions and sanctions |
| `hr_fin_check_currency` | Check whether a provision is currently in force |
| `hr_fin_about` | Server metadata and tool list |

## Sourcebooks

- `HANFA_PRAVILNICI` — HANFA Rulebooks (Pravilnici)
- `HANFA_SMJERNICE` — HANFA Guidelines (Smjernice)
- `HNB_ODLUKE` — HNB Decisions (Odluke)

## Setup

```bash
npm install
npm run build
npm run seed       # seed sample data
npm start          # HTTP server on port 3000
```

Set `HANFA_DB_PATH` to use a custom database location.

## Data Sources

- HANFA: https://www.hanfa.hr/
- HNB: https://www.hnb.hr/
