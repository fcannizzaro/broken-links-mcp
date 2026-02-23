# @fcannizzaro/broken-links-mcp

[![publish](https://github.com/fcannizzaro/broken-links-mcp/actions/workflows/publish.yaml/badge.svg)](https://github.com/fcannizzaro/broken-links-mcp/actions/workflows/publish.yaml)
[![npm](https://img.shields.io/npm/v/@fcannizzaro/broken-links-mcp)](https://www.npmjs.com/package/@fcannizzaro/broken-links-mcp)

An MCP server that scans directories for files, extracts HTTP links, and validates them — reporting broken links in a markdown table.

## Features

- Recursively scans directories for files matching specified extensions
- Extracts links from five formats:
  - **Markdown links** — `[text](https://...)`
  - **Markdown images** — `![alt](https://...)`
  - **HTML anchors** — `<a href="https://...">`
  - **HTML images** — `<img src="https://...">`
  - **Plain URLs** — `https://...`
- Validates each unique URL via HTTP HEAD (with GET fallback)
- Deduplicates URLs to avoid redundant requests
- Batches requests (10 concurrent) to avoid overwhelming servers
- Returns a markdown table of broken links with file, line number, status, and issue

## Tool

### `check-links`

Recursively scan files in a directory for broken HTTP links.

| Parameter    | Type       | Description                                        |
|--------------|------------|----------------------------------------------------|
| `directory`  | `string`   | Root directory to scan                             |
| `extensions` | `string[]` | File extensions to include (e.g. `[".md", ".html"]`) |

### Example Output

When broken links are found:

```
| File       | Line | URL                              | Status | Issue         |
|------------|------|----------------------------------|--------|---------------|
| readme.md  | 10   | https://httpbin.org/status/404   | 404    | 404 Not Found |
| docs/api.md| 25   | https://dead.example.com         | -      | DNS resolution failed |

Found **2** broken link(s) out of **15** total across **3** file(s).
```

When all links are valid:

```
All **15** link(s) across **3** file(s) are valid.
```

## Usage (examples)

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "broken-links": {
      "command": "bunx",
      "args": ["--bun", "@fcannizzaro/broken-links-mcp"]
    }
  }
}
```

### OpenCode

Add to your `opencode.json`:

```json
{
  "mcp": {
    "broken-links": {
      "type": "local",
      "command": ["bunx", "--bun", "@fcannizzaro/broken-links-mcp"]
    }
  }
}
```

The server communicates over stdio using the MCP protocol (JSON-RPC).

## License

MIT
