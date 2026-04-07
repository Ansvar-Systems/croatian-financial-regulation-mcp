#!/usr/bin/env node

/**
 * Croatian Financial Regulation MCP — stdio entry point.
 *
 * Provides MCP tools for querying HANFA pravilnici, smjernice,
 * and HNB odluke o regulatornom kapitalu.
 *
 * Tool prefix: hr_fin_
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  listSourcebooks,
  searchProvisions,
  getProvision,
  searchEnforcement,
  checkProvisionCurrency,
} from "./db.js";
import { buildCitation } from "./citation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let pkgVersion = "0.1.0";
try {
  const pkg = JSON.parse(
    readFileSync(join(__dirname, "..", "package.json"), "utf8"),
  ) as { version: string };
  pkgVersion = pkg.version;
} catch {
  // fallback to default
}

const SERVER_NAME = "croatian-financial-regulation-mcp";

// Tool definitions

const TOOLS = [
  {
    name: "hr_fin_search_regulations",
    description:
      "Full-text search across Croatian HANFA and HNB regulatory provisions. Returns matching pravilnici (rulebooks), smjernice (guidelines), and HNB odluke (decisions).",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query in Croatian or English (e.g., 'upravljanje rizicima', 'risk management', 'regulatorni kapital')",
        },
        sourcebook: {
          type: "string",
          description: "Filter by sourcebook ID (e.g., HANFA_PRAVILNICI, HANFA_SMJERNICE, HNB_ODLUKE). Optional.",
        },
        status: {
          type: "string",
          enum: ["in_force", "deleted", "not_yet_in_force"],
          description: "Filter by provision status. Defaults to all statuses.",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return. Defaults to 20.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "hr_fin_get_regulation",
    description:
      "Get a specific HANFA or HNB provision by sourcebook and reference (e.g., sourcebook 'HANFA_PRAVILNICI', reference 'Pravilnik o upravljanju rizicima').",
    inputSchema: {
      type: "object" as const,
      properties: {
        sourcebook: {
          type: "string",
          description: "Sourcebook identifier (e.g., HANFA_PRAVILNICI, HANFA_SMJERNICE, HNB_ODLUKE)",
        },
        reference: {
          type: "string",
          description: "Provision reference (e.g., 'Pravilnik o upravljanju rizicima', 'Odluka o regulatornom kapitalu')",
        },
      },
      required: ["sourcebook", "reference"],
    },
  },
  {
    name: "hr_fin_list_sourcebooks",
    description:
      "List all HANFA and HNB sourcebook collections with their names and descriptions.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "hr_fin_search_enforcement",
    description:
      "Search HANFA enforcement actions — rješenja (decisions), novčane kazne (fines), oduzimanja dozvola (licence revocations), and upozorenja (warnings).",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query (e.g., firm name, breach type, 'tržišna zlouporaba')",
        },
        action_type: {
          type: "string",
          enum: ["fine", "ban", "restriction", "warning"],
          description: "Filter by action type. Optional.",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return. Defaults to 20.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "hr_fin_check_currency",
    description:
      "Check whether a specific HANFA or HNB provision reference is currently in force. Returns status and effective date.",
    inputSchema: {
      type: "object" as const,
      properties: {
        reference: {
          type: "string",
          description: "Provision reference to check (e.g., 'Pravilnik o upravljanju rizicima')",
        },
      },
      required: ["reference"],
    },
  },
  {
    name: "hr_fin_about",
    description: "Return metadata about this MCP server: version, data source, tool list.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

// Zod schemas

const SearchRegulationsArgs = z.object({
  query: z.string().min(1),
  sourcebook: z.string().optional(),
  status: z.enum(["in_force", "deleted", "not_yet_in_force"]).optional(),
  limit: z.number().int().positive().max(100).optional(),
});

const GetRegulationArgs = z.object({
  sourcebook: z.string().min(1),
  reference: z.string().min(1),
});

const SearchEnforcementArgs = z.object({
  query: z.string().min(1),
  action_type: z.enum(["fine", "ban", "restriction", "warning"]).optional(),
  limit: z.number().int().positive().max(100).optional(),
});

const CheckCurrencyArgs = z.object({
  reference: z.string().min(1),
});

// Helper

function textContent(data: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(data, null, 2) },
    ],
  };
}

function errorContent(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

// Server setup

const server = new Server(
  { name: SERVER_NAME, version: pkgVersion },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case "hr_fin_search_regulations": {
        const parsed = SearchRegulationsArgs.parse(args);
        const results = searchProvisions({
          query: parsed.query,
          sourcebook: parsed.sourcebook,
          status: parsed.status,
          limit: parsed.limit,
        });
        return textContent({ results, count: results.length });
      }

      case "hr_fin_get_regulation": {
        const parsed = GetRegulationArgs.parse(args);
        const provision = getProvision(parsed.sourcebook, parsed.reference);
        if (!provision) {
          return errorContent(
            `Provision not found: ${parsed.sourcebook} ${parsed.reference}`,
          );
        }
        return textContent({
          ...(typeof provision === 'object' ? provision : { data: provision }),
          _citation: buildCitation(
            (provision as any).reference || parsed.reference,
            (provision as any).title || (provision as any).subject || '',
            'hr_fin_get_regulation',
            { sourcebook: parsed.sourcebook, reference: parsed.reference },
            (provision as any).url || null,
          ),
        });
      }

      case "hr_fin_list_sourcebooks": {
        const sourcebooks = listSourcebooks();
        return textContent({ sourcebooks, count: sourcebooks.length });
      }

      case "hr_fin_search_enforcement": {
        const parsed = SearchEnforcementArgs.parse(args);
        const results = searchEnforcement({
          query: parsed.query,
          action_type: parsed.action_type,
          limit: parsed.limit,
        });
        return textContent({ results, count: results.length });
      }

      case "hr_fin_check_currency": {
        const parsed = CheckCurrencyArgs.parse(args);
        const currency = checkProvisionCurrency(parsed.reference);
        return textContent(currency);
      }

      case "hr_fin_about": {
        return textContent({
          name: SERVER_NAME,
          version: pkgVersion,
          description:
            "Croatian HANFA and HNB (Hrvatska narodna banka) financial regulation MCP server. Provides access to HANFA pravilnici, smjernice, HNB decisions, and enforcement actions.",
          data_source: "HANFA (https://www.hanfa.hr/) and HNB (https://www.hnb.hr/)",
          tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
        });
      }

      default:
        return errorContent(`Unknown tool: ${name}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorContent(`Error executing ${name}: ${message}`);
  }
});

// Main

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`${SERVER_NAME} v${pkgVersion} running on stdio\n`);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
