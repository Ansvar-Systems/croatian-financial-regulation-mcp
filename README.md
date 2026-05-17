# Croatian Financial Regulation MCP

<!-- ANSVAR-CTA-BEGIN -->
> ### ▶ Try this MCP instantly via Ansvar Gateway
> **50 free queries/day · no card required · OAuth signup at [ansvar.eu/gateway](https://ansvar.eu/gateway)**
>
> One endpoint, one OAuth signup, access from any MCP-compatible client.

### Connect

**Claude Code** (one line):

```bash
claude mcp add ansvar --transport http https://gateway.ansvar.eu/mcp
```

**Claude Desktop / Cursor** — add to `claude_desktop_config.json` (or `mcp.json`):

```json
{
  "mcpServers": {
    "ansvar": {
      "type": "url",
      "url": "https://gateway.ansvar.eu/mcp"
    }
  }
}
```

**Claude.ai** — Settings → Connectors → Add custom connector → paste `https://gateway.ansvar.eu/mcp`

First request opens an OAuth flow at [ansvar.eu/gateway](https://ansvar.eu/gateway). After signup, your client is bound to your account; tier (free / premium / team / company) determines fan-out, quota, and which downstream MCPs are reachable.

---

## Self-host this MCP

You can also clone this repo and build the corpus yourself. The schema,
fetcher, and tool implementations all live here. What is not in the repo is
the pre-built database — TDM and standards-licensing constraints on the
upstream sources mean we host the corpus on Ansvar infrastructure rather
than redistribute it as a public artifact.

Build your own: run this repo's ingestion script (entry-point varies per
repo — typically `scripts/ingest.sh`, `npm run ingest`, or `make ingest`;
check the repo root).
<!-- ANSVAR-CTA-END -->


**Croatian financial regulation data for AI compliance tools.**

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/Ansvar-Systems/croatian-financial-regulation-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/croatian-financial-regulation-mcp/actions/workflows/ci.yml)

Query Croatian financial regulation data -- regulations, decisions, and requirements from HANFA (Croatian Financial Services Supervisory Agency) -- directly from Claude, Cursor, or any MCP-compatible client.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Available Tools (8)

| Tool | Description |
|------|-------------|
| `hr_fin_search_regulations` | Full-text search across Croatian HANFA and HNB regulatory provisions. Returns matching pravilnici (rulebooks), smjern... |
| `hr_fin_get_regulation` | Get a specific HANFA or HNB provision by sourcebook and reference (e.g., sourcebook |
| `hr_fin_list_sourcebooks` | List all HANFA and HNB sourcebook collections with their names and descriptions. |
| `hr_fin_search_enforcement` | Search HANFA enforcement actions — rješenja (decisions), novčane kazne (fines), oduzimanja dozvola (licence revocatio... |
| `hr_fin_check_currency` | Check whether a specific HANFA or HNB provision reference is currently in force. Returns status and effective date. |
| `hr_fin_about` | Return metadata about this MCP server: version, data source, tool list. |
| `hr_fin_list_sources` | List authoritative data sources with provenance metadata (authority, URL, license, coverage). |
| `hr_fin_check_data_freshness` | Check data freshness — database age, staleness status, and update instructions. |

All tools return structured data with source references and timestamps.

---

## Data Sources and Freshness

All content is sourced from official Croatian regulatory publications:

- **HANFA (Croatian Financial Services Supervisory Agency)** -- Official regulatory authority

### Data Currency

- Database updates are periodic and may lag official publications
- Freshness checks run via GitHub Actions workflows
- Last-updated timestamps in tool responses indicate data age

See [COVERAGE.md](COVERAGE.md) and [data/coverage.json](data/coverage.json) for full provenance metadata.

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Docker Security** | Container image scanning + SBOM generation | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Not Regulatory Advice

> **THIS TOOL IS NOT REGULATORY OR LEGAL ADVICE**
>
> Regulatory data is sourced from official publications by HANFA (Croatian Financial Services Supervisory Agency). However:
> - This is a **research tool**, not a substitute for professional regulatory counsel
> - **Verify all references** against primary sources before making compliance decisions
> - **Coverage may be incomplete** -- do not rely solely on this for regulatory research

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [PRIVACY.md](PRIVACY.md)

### Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment. See [PRIVACY.md](PRIVACY.md) for details.

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/croatian-financial-regulation-mcp
cd croatian-financial-regulation-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Data Management

```bash
npm run seed    # Seed SQLite database with sample data
npm run ingest  # Fetch new regulatory data from HANFA and HNB
```

---

## More Ansvar MCPs

Full fleet at [ansvar.eu/gateway](https://ansvar.eu/gateway).
## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

Regulatory data sourced from official government publications. See [COVERAGE.md](COVERAGE.md) for per-source licensing details.

---

## About Ansvar Systems

We build AI-powered compliance and legal research tools for the European market. Our MCP fleet provides structured, verified regulatory data to AI assistants -- so compliance professionals can work with accurate sources instead of guessing.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
