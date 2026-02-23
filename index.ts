#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import {
  discoverFiles,
  extractLinks,
  validateInBatches,
  formatOutput,
  type LinkResult,
  type BrokenLink,
} from "./lib";

const server = new McpServer({
  name: "link-checker",
  version: "1.0.0",
});

server.tool(
  "check-links",
  "Recursively scan files in a directory for broken HTTP links",
  {
    directory: z.string().describe("Root directory to scan (Absolute path)"),
    extensions: z
      .array(z.string())
      .describe('File extensions to include (e.g. [".md", ".html", ".txt"])'),
  },
  async ({ directory, extensions }) => {
    // Resolve and validate directory
    const dir = resolve(directory);

    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Error: "${directory}" is not a valid directory.`,
          },
        ],
      };
    }

    if (extensions.length === 0) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: "Error: At least one file extension must be provided.",
          },
        ],
      };
    }

    // Normalize extensions
    const normalizedExts = extensions.map((e) =>
      e.startsWith(".") ? e : `.${e}`,
    );

    // Discover files
    const files = await discoverFiles(dir, normalizedExts);

    if (files.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No files found matching extensions [${normalizedExts.join(", ")}] in "${dir}".`,
          },
        ],
      };
    }

    // Extract links from all files
    const allLinks: LinkResult[] = [];
    for (const file of files) {
      const links = await extractLinks(file);
      allLinks.push(...links);
    }

    if (allLinks.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Found **${files.length}** file(s) but no HTTP links were detected.`,
          },
        ],
      };
    }

    // Deduplicate URLs for validation
    const uniqueUrls = [...new Set(allLinks.map((l) => l.url))];

    // Validate all unique URLs in batches
    const validationResults = await validateInBatches(uniqueUrls);

    // Collect broken links
    const brokenLinks: BrokenLink[] = [];
    for (const link of allLinks) {
      const result = validationResults.get(link.url);
      if (result && !result.ok) {
        brokenLinks.push({
          ...link,
          status: result.status,
          issue: result.issue,
        });
      }
    }

    // Format and return
    const output = formatOutput(
      brokenLinks,
      allLinks.length,
      files.length,
      dir,
    );

    return {
      content: [{ type: "text" as const, text: output }],
    };
  },
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
