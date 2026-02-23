import { describe, it, expect } from "bun:test";
import { resolve, join } from "node:path";
import {
  discoverFiles,
  extractLinksFromContent,
  extractLinks,
  validateLink,
  classifyError,
  formatOutput,
  type BrokenLink,
} from "./lib";

const SAMPLES_DIR = resolve(import.meta.dir, "samples");

// ---------------------------------------------------------------------------
// extractLinksFromContent
// ---------------------------------------------------------------------------

describe("extractLinksFromContent", () => {
  it("extracts markdown links", () => {
    const content = "Check [Example](https://example.com) here.";
    const results = extractLinksFromContent(content, "test.md");
    expect(results).toHaveLength(1);
    expect(results[0]!.url).toBe("https://example.com");
    expect(results[0]!.line).toBe(1);
  });

  it("extracts HTML anchor links", () => {
    const content = '<a href="https://example.com">Example</a>';
    const results = extractLinksFromContent(content, "test.html");
    expect(results).toHaveLength(1);
    expect(results[0]!.url).toBe("https://example.com");
  });

  it("extracts HTML anchor links with single quotes", () => {
    const content = "<a href='https://example.com'>Example</a>";
    const results = extractLinksFromContent(content, "test.html");
    expect(results).toHaveLength(1);
    expect(results[0]!.url).toBe("https://example.com");
  });

  it("extracts HTML img src links", () => {
    const content = '<img src="https://example.com/image.png" alt="photo">';
    const results = extractLinksFromContent(content, "test.html");
    expect(results).toHaveLength(1);
    expect(results[0]!.url).toBe("https://example.com/image.png");
  });

  it("extracts HTML img src links with single quotes", () => {
    const content = "<img src='https://example.com/logo.svg' />";
    const results = extractLinksFromContent(content, "test.html");
    expect(results).toHaveLength(1);
    expect(results[0]!.url).toBe("https://example.com/logo.svg");
  });

  it("extracts HTML img src with extra attributes", () => {
    const content =
      '<img class="hero" src="https://example.com/banner.jpg" width="800">';
    const results = extractLinksFromContent(content, "test.html");
    expect(results).toHaveLength(1);
    expect(results[0]!.url).toBe("https://example.com/banner.jpg");
  });

  it("extracts markdown image links", () => {
    const content = "![alt text](https://example.com/photo.png)";
    const results = extractLinksFromContent(content, "test.md");
    expect(results).toHaveLength(1);
    expect(results[0]!.url).toBe("https://example.com/photo.png");
  });

  it("extracts plain HTTP URLs", () => {
    const content = "Visit https://example.com for more.";
    const results = extractLinksFromContent(content, "test.txt");
    expect(results).toHaveLength(1);
    expect(results[0]!.url).toBe("https://example.com");
  });

  it("extracts http (non-https) URLs", () => {
    const content = "Visit http://example.com for more.";
    const results = extractLinksFromContent(content, "test.txt");
    expect(results).toHaveLength(1);
    expect(results[0]!.url).toBe("http://example.com");
  });

  it("deduplicates URLs on the same line", () => {
    // The markdown URL will also match as a plain URL — should deduplicate
    const content =
      "[Example](https://example.com) and also https://example.com";
    const results = extractLinksFromContent(content, "test.md");
    expect(results).toHaveLength(1);
    expect(results[0]!.url).toBe("https://example.com");
  });

  it("extracts multiple different URLs from one line", () => {
    const content =
      "[A](https://example.com) and [B](https://google.com)";
    const results = extractLinksFromContent(content, "test.md");
    expect(results).toHaveLength(2);
    const urls = results.map((r) => r.url);
    expect(urls).toContain("https://example.com");
    expect(urls).toContain("https://google.com");
  });

  it("handles mixed formats in one file", () => {
    const content = [
      "[Markdown](https://example.com)",
      '<a href="https://google.com">HTML</a>',
      "Plain: https://github.com",
    ].join("\n");
    const results = extractLinksFromContent(content, "test.md");
    expect(results).toHaveLength(3);
    expect(results[0]!.line).toBe(1);
    expect(results[1]!.line).toBe(2);
    expect(results[2]!.line).toBe(3);
  });

  it("returns empty array when no links found", () => {
    const content = "No links here, just plain text.\nAnother line.";
    const results = extractLinksFromContent(content, "test.txt");
    expect(results).toHaveLength(0);
  });

  it("ignores relative markdown links", () => {
    const content = "[Local](./other.md) and [Anchor](#section)";
    const results = extractLinksFromContent(content, "test.md");
    expect(results).toHaveLength(0);
  });

  it("tracks correct line numbers", () => {
    const content = "line1\nline2\nhttps://example.com\nline4";
    const results = extractLinksFromContent(content, "test.txt");
    expect(results).toHaveLength(1);
    expect(results[0]!.line).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// discoverFiles
// ---------------------------------------------------------------------------

describe("discoverFiles", () => {
  it("finds markdown files in samples directory", async () => {
    const files = await discoverFiles(SAMPLES_DIR, [".md"]);
    expect(files.length).toBeGreaterThanOrEqual(2); // readme.md + nested/deep.md
    expect(files.some((f) => f.endsWith("readme.md"))).toBe(true);
    expect(files.some((f) => f.endsWith("deep.md"))).toBe(true);
  });

  it("finds only html files when filtered", async () => {
    const files = await discoverFiles(SAMPLES_DIR, [".html"]);
    expect(files).toHaveLength(1);
    expect(files[0]!.endsWith("page.html")).toBe(true);
  });

  it("finds files with multiple extensions", async () => {
    const files = await discoverFiles(SAMPLES_DIR, [".md", ".txt"]);
    expect(files.length).toBeGreaterThanOrEqual(3); // readme.md, notes.txt, nested/deep.md
  });

  it("finds files recursively in nested directories", async () => {
    const files = await discoverFiles(SAMPLES_DIR, [".md"]);
    expect(files.some((f) => f.includes("nested"))).toBe(true);
  });

  it("returns empty array for non-matching extensions", async () => {
    const files = await discoverFiles(SAMPLES_DIR, [".xyz"]);
    expect(files).toHaveLength(0);
  });

  it("handles extensions without leading dot", async () => {
    const files = await discoverFiles(SAMPLES_DIR, ["md"]);
    expect(files.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// extractLinks (file-based)
// ---------------------------------------------------------------------------

describe("extractLinks", () => {
  it("extracts links from a real file", async () => {
    const filePath = join(SAMPLES_DIR, "readme.md");
    const links = await extractLinks(filePath);
    expect(links.length).toBeGreaterThanOrEqual(4);
    const urls = links.map((l) => l.url);
    expect(urls).toContain("https://example.com");
    expect(urls).toContain("https://httpbin.org/status/404");
  });

  it("returns empty array for non-existent file", async () => {
    const links = await extractLinks("/nonexistent/file.md");
    expect(links).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// classifyError
// ---------------------------------------------------------------------------

describe("classifyError", () => {
  it("classifies timeout errors", () => {
    const err = new Error("Timeout");
    err.name = "TimeoutError";
    expect(classifyError(err)).toBe("Timeout (10s)");
  });

  it("classifies abort errors", () => {
    const err = new Error("Aborted");
    err.name = "AbortError";
    expect(classifyError(err)).toBe("Timeout (10s)");
  });

  it("classifies DNS errors", () => {
    expect(classifyError(new Error("getaddrinfo ENOTFOUND foo.bar"))).toBe(
      "DNS resolution failed",
    );
  });

  it("classifies connection refused", () => {
    expect(classifyError(new Error("connect ECONNREFUSED 127.0.0.1:80"))).toBe(
      "Connection refused",
    );
  });

  it("classifies SSL errors", () => {
    expect(classifyError(new Error("SSL certificate problem"))).toBe(
      "SSL/TLS error",
    );
  });

  it("classifies redirect errors", () => {
    expect(classifyError(new Error("Too many redirect"))).toBe(
      "Too many redirects",
    );
  });

  it("truncates long error messages", () => {
    const longMsg = "x".repeat(200);
    const result = classifyError(new Error(longMsg));
    expect(result.length).toBeLessThanOrEqual(104); // 100 + "..."
    expect(result.endsWith("...")).toBe(true);
  });

  it("handles non-Error values", () => {
    expect(classifyError("string error")).toBe("Unknown error");
    expect(classifyError(42)).toBe("Unknown error");
    expect(classifyError(null)).toBe("Unknown error");
  });
});

// ---------------------------------------------------------------------------
// formatOutput
// ---------------------------------------------------------------------------

describe("formatOutput", () => {
  it("returns success message when no broken links", () => {
    const result = formatOutput([], 5, 2, "/some/dir");
    expect(result).toContain("All **5** link(s)");
    expect(result).toContain("**2** file(s)");
    expect(result).toContain("valid");
  });

  it("returns markdown table for broken links", () => {
    const broken: BrokenLink[] = [
      {
        file: "/some/dir/readme.md",
        line: 10,
        url: "https://broken.example.com",
        status: 404,
        issue: "404 Not Found",
      },
      {
        file: "/some/dir/nested/doc.md",
        line: 5,
        url: "https://dead.link",
        status: null,
        issue: "DNS resolution failed",
      },
    ];
    const result = formatOutput(broken, 10, 3, "/some/dir");
    expect(result).toContain("| File | Line | URL | Status | Issue |");
    expect(result).toContain("| readme.md |");
    expect(result).toContain("| nested/doc.md |");
    expect(result).toContain("| 404 |");
    expect(result).toContain("| - |"); // null status
    expect(result).toContain("Found **2** broken link(s)");
    expect(result).toContain("out of **10** total");
  });
});

// ---------------------------------------------------------------------------
// validateLink (integration — hits the network)
// ---------------------------------------------------------------------------

describe("validateLink", () => {
  it("returns ok for a valid URL", async () => {
    const result = await validateLink("https://example.com");
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  }, 15_000);

  it("returns not ok for a 404 URL", async () => {
    const result = await validateLink("https://httpbin.org/status/404");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.issue).toContain("404");
  }, 15_000);

  it("returns not ok for a non-existent domain", async () => {
    const result = await validateLink(
      "https://this-domain-does-not-exist-abc123.com",
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.issue.length).toBeGreaterThan(0);
  }, 30_000);
});
