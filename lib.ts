import { relative } from "node:path";

// --- Types ---

export interface LinkResult {
  file: string;
  line: number;
  url: string;
}

export interface ValidationResult {
  ok: boolean;
  status: number | null;
  issue: string;
}

export interface BrokenLink extends LinkResult {
  status: number | null;
  issue: string;
}

// --- Link extraction regexes ---

const MARKDOWN_LINK = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
const HTML_ANCHOR = /<a\s[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
const HTML_IMG = /<img\s[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
const PLAIN_URL = /(https?:\/\/[^\s<>\)\]"'`,;]+)/g;

// --- Helper functions ---

export async function discoverFiles(
  directory: string,
  extensions: string[],
): Promise<string[]> {
  const exts = extensions.map((e) => e.replace(/^\./, ""));
  const pattern =
    exts.length === 1 ? `**/*.${exts[0]}` : `**/*.{${exts.join(",")}}`;
  const glob = new Bun.Glob(pattern);
  const files: string[] = [];
  for await (const path of glob.scan({ cwd: directory, absolute: true })) {
    files.push(path);
  }
  return files.sort();
}

/**
 * Extract links from a string content. Useful for testing without needing real files.
 */
export function extractLinksFromContent(
  content: string,
  filePath: string,
): LinkResult[] {
  const results: LinkResult[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNum = i + 1;
    const seen = new Set<string>();

    for (const match of line.matchAll(MARKDOWN_LINK)) {
      const url = match[2] ?? "";
      if (url && !seen.has(url)) {
        seen.add(url);
        results.push({ file: filePath, line: lineNum, url });
      }
    }

    for (const match of line.matchAll(HTML_ANCHOR)) {
      const url = match[1] ?? "";
      if (url && !seen.has(url)) {
        seen.add(url);
        results.push({ file: filePath, line: lineNum, url });
      }
    }

    for (const match of line.matchAll(HTML_IMG)) {
      const url = match[1] ?? "";
      if (url && !seen.has(url)) {
        seen.add(url);
        results.push({ file: filePath, line: lineNum, url });
      }
    }

    for (const match of line.matchAll(PLAIN_URL)) {
      const url = match[1] ?? "";
      if (url && !seen.has(url)) {
        seen.add(url);
        results.push({ file: filePath, line: lineNum, url });
      }
    }
  }

  return results;
}

/**
 * Extract links from a file on disk.
 */
export async function extractLinks(filePath: string): Promise<LinkResult[]> {
  let content: string;
  try {
    content = await Bun.file(filePath).text();
  } catch {
    console.error(`[link-checker] Could not read file: ${filePath}`);
    return [];
  }
  return extractLinksFromContent(content, filePath);
}

export async function validateLink(url: string): Promise<ValidationResult> {
  const timeout = 10_000;

  try {
    // Try HEAD first
    const headRes = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(timeout),
    });

    if (headRes.status === 405) {
      // Method not allowed — fallback to GET
      const getRes = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(timeout),
      });
      if (getRes.ok) return { ok: true, status: getRes.status, issue: "" };
      return {
        ok: false,
        status: getRes.status,
        issue: `${getRes.status} ${getRes.statusText}`,
      };
    }

    if (headRes.ok) return { ok: true, status: headRes.status, issue: "" };
    return {
      ok: false,
      status: headRes.status,
      issue: `${headRes.status} ${headRes.statusText}`,
    };
  } catch (err: unknown) {
    // HEAD failed entirely — try GET as fallback
    try {
      const getRes = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(timeout),
      });
      if (getRes.ok) return { ok: true, status: getRes.status, issue: "" };
      return {
        ok: false,
        status: getRes.status,
        issue: `${getRes.status} ${getRes.statusText}`,
      };
    } catch (fallbackErr: unknown) {
      return { ok: false, status: null, issue: classifyError(fallbackErr) };
    }
  }
}

export function classifyError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError") {
      return "Timeout (10s)";
    }
    const msg = err.message.toLowerCase();
    if (msg.includes("dns") || msg.includes("getaddrinfo")) {
      return "DNS resolution failed";
    }
    if (msg.includes("econnrefused") || msg.includes("connection refused")) {
      return "Connection refused";
    }
    if (msg.includes("ssl") || msg.includes("cert") || msg.includes("tls")) {
      return "SSL/TLS error";
    }
    if (msg.includes("redirect")) {
      return "Too many redirects";
    }
    // Truncate long error messages
    return err.message.length > 100
      ? err.message.slice(0, 100) + "..."
      : err.message;
  }
  return "Unknown error";
}

export async function validateInBatches(
  urls: string[],
  batchSize = 10,
): Promise<Map<string, ValidationResult>> {
  const results = new Map<string, ValidationResult>();

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (url) => ({
        url,
        result: await validateLink(url),
      })),
    );
    for (const { url, result } of batchResults) {
      results.set(url, result);
    }
  }

  return results;
}

export function formatOutput(
  brokenLinks: BrokenLink[],
  totalLinks: number,
  totalFiles: number,
  directory: string,
): string {
  if (brokenLinks.length === 0) {
    return `All **${totalLinks}** link(s) across **${totalFiles}** file(s) are valid.`;
  }

  const rows = brokenLinks.map((link) => {
    const relPath = relative(directory, link.file);
    const statusStr = link.status !== null ? String(link.status) : "-";
    return `| ${relPath} | ${link.line} | ${link.url} | ${statusStr} | ${link.issue} |`;
  });

  const table = [
    "| File | Line | URL | Status | Issue |",
    "|------|------|-----|--------|-------|",
    ...rows,
  ].join("\n");

  const summary = `\nFound **${brokenLinks.length}** broken link(s) out of **${totalLinks}** total across **${totalFiles}** file(s).`;

  return table + "\n" + summary;
}
