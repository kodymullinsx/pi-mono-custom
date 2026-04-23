import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  normalizeMatcher,
  resolveLanguage,
  runAstFind,
  runAstRewritePreview,
  runAstTest,
  shapeToolResponse,
} from "../index.ts";

const fixtureRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "fixtures",
);

async function withTempDir(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-ast-grep-"));
  try {
    return await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("resolveLanguage accepts friendly aliases and rejects unsupported inputs", () => {
  assert.equal(resolveLanguage("js").lang, "JavaScript");
  assert.equal(resolveLanguage("tsx").lang, "Tsx");
  assert.throws(() => resolveLanguage("python"), /Unsupported phase-1 language/);
});

test("normalizeMatcher accepts pattern objects with selector and strictness", () => {
  const matcher = normalizeMatcher({
    context: "const wrapped = { value: $VAL };",
    selector: "pair",
    strictness: "template",
  });
  assert.equal(matcher.summary.kind, "pattern_object");
  assert.equal(matcher.summary.selector, "pair");
  assert.equal(matcher.summary.strictness, "template");
});

test("normalizeMatcher allows pattern objects without selector", () => {
  const matcher = normalizeMatcher({
    context: "console.log($ARG);",
  });
  assert.equal(matcher.summary.kind, "pattern_object");
  assert.equal(matcher.summary.selector, undefined);
});

test("runAstTest returns structured captures for a simple pattern", () => {
  const result = runAstTest({
    language: "javascript",
    snippet: 'console.log("x");',
    matcher: {
      pattern: "console.log($ARG)",
    },
  });

  assert.equal(result.matched, true);
  assert.equal(result.matchCount, 1);
  assert.deepEqual(result.matches[0]?.captures, { ARG: '"x"' });
  assert.deepEqual(result.matches[0]?.range, {
    start: { line: 1, column: 1 },
    end: { line: 1, column: 17 },
  });
});

test("runAstTest returns a context-selector hint for ambiguous partial patterns", () => {
  const result = runAstTest({
    language: "typescript",
    snippet: "const wrapped = { value: 1, other: 2 };",
    matcher: {
      pattern: "value: $VAL",
    },
  });

  assert.equal(result.matched, false);
  assert.match(result.hint ?? "", /matcher\.context/);
});

test("runAstTest honors the built-in selector heuristic when matcher.context omits selector", () => {
  const result = runAstTest({
    language: "javascript",
    snippet: 'console.log("x");',
    matcher: {
      context: "console.log($ARG);",
    },
  });

  assert.equal(result.matched, true);
  assert.equal(result.matchCount, 1);
  assert.deepEqual(result.matches[0]?.captures, { ARG: '"x"' });
});

test("runAstTest matches the same ambiguous shape once context and selector are supplied", () => {
  const result = runAstTest({
    language: "typescript",
    snippet: "const wrapped = { value: 1, other: 2 };",
    matcher: {
      context: "const wrapped = { value: $VAL };",
      selector: "pair",
      strictness: "smart",
    },
  });

  assert.equal(result.matched, true);
  assert.equal(result.matchCount, 1);
  assert.deepEqual(result.matches[0]?.captures, { VAL: "1" });
});

test("runAstTest distinguishes cst from smart strictness", () => {
  const smart = runAstTest({
    language: "javascript",
    snippet: "async function foo() {}",
    matcher: {
      context: "function foo() {}",
      selector: "function_declaration",
      strictness: "smart",
    },
  });
  const cst = runAstTest({
    language: "javascript",
    snippet: "async function foo() {}",
    matcher: {
      context: "function foo() {}",
      selector: "function_declaration",
      strictness: "cst",
    },
  });

  assert.equal(smart.matchCount, 1);
  assert.equal(cst.matchCount, 0);
});

test("runAstTest distinguishes ast from template strictness", () => {
  const astResult = runAstTest({
    language: "javascript",
    snippet: "a - b",
    matcher: {
      context: "a + b",
      selector: "binary_expression",
      strictness: "ast",
    },
  });
  const templateResult = runAstTest({
    language: "javascript",
    snippet: "a - b",
    matcher: {
      context: "a + b",
      selector: "binary_expression",
      strictness: "template",
    },
  });

  assert.equal(astResult.matchCount, 1);
  assert.equal(templateResult.matchCount, 0);
});

test("runAstTest distinguishes ast from relaxed strictness around comments", () => {
  const astResult = runAstTest({
    language: "javascript",
    snippet: "foo(/* comment */ bar);",
    matcher: {
      context: "foo(bar);",
      selector: "call_expression",
      strictness: "ast",
    },
  });
  const relaxedResult = runAstTest({
    language: "javascript",
    snippet: "foo(/* comment */ bar);",
    matcher: {
      context: "foo(bar);",
      selector: "call_expression",
      strictness: "relaxed",
    },
  });

  assert.equal(astResult.matchCount, 0);
  assert.equal(relaxedResult.matchCount, 1);
});

test("runAstTest distinguishes ast from signature strictness when text changes", () => {
  const astResult = runAstTest({
    language: "javascript",
    snippet: "baz(qux)",
    matcher: {
      context: "foo(bar)",
      selector: "call_expression",
      strictness: "ast",
    },
  });
  const signatureResult = runAstTest({
    language: "javascript",
    snippet: "baz(qux)",
    matcher: {
      context: "foo(bar)",
      selector: "call_expression",
      strictness: "signature",
    },
  });

  assert.equal(astResult.matchCount, 0);
  assert.equal(signatureResult.matchCount, 1);
});

test("runAstTest returns transformed metavars when the matcher defines them", () => {
  const result = runAstTest({
    language: "javascript",
    snippet: "console.log(fooBar);",
    matcher: {
      pattern: "console.log($ARG)",
      transform: {
        HEAD: {
          substring: {
            source: "$ARG",
            startChar: 0,
            endChar: 3,
          },
        },
      },
    },
  });

  assert.equal(result.matchCount, 1);
  assert.deepEqual(result.matches[0]?.captures, { ARG: "fooBar" });
  assert.deepEqual(result.matches[0]?.transformed, { HEAD: "foo" });
});

test("runAstFind returns deterministic relative file matches", { concurrency: false }, async () => {
  const result = await runAstFind(
    {
      language: "typescript",
      paths: ["fixtures/sample.ts"],
      matcher: {
        pattern: "console.log($ARG)",
      },
    },
    path.dirname(fixtureRoot),
  );

  assert.equal(result.matchCount, 3);
  assert.deepEqual(result.searchedPaths, ["fixtures/sample.ts"]);
  assert.deepEqual(
    result.matches.map((match) => match.file),
    ["fixtures/sample.ts", "fixtures/sample.ts", "fixtures/sample.ts"],
  );
  assert.deepEqual(
    result.matches.map((match) => match.range.start.line),
    [1, 5, 9],
  );
});

test("shapeToolResponse truncates oversized output and saves the full result to a temp file", async () => {
  const result = {
    tool: "ast_find",
    language: "typescript",
    matcher: { kind: "pattern", pattern: "console.log($ARG)" },
    matched: true,
    matchCount: 2500,
    searchedPaths: ["fixtures"],
    matches: Array.from({ length: 2500 }, (_, index) => ({
      file: "fixtures/sample.ts",
      text: `console.log(${index})`,
      range: {
        start: { line: index + 1, column: 1 },
        end: { line: index + 1, column: 20 },
      },
    })),
  };

  const shaped = await shapeToolResponse(result, { searchedPaths: result.searchedPaths });
  assert.ok(shaped.details.truncation?.truncated);
  assert.ok(shaped.details.fullOutputPath);
  assert.match(shaped.text, /Full output saved to:/);
  const saved = await fs.readFile(shaped.details.fullOutputPath, "utf8");
  assert.match(saved, /"matchCount": 2500/);
});

test("runAstRewritePreview previews replacements on snippets without mutating anything", async () => {
  const result = await runAstRewritePreview(
    {
      language: "javascript",
      matcher: {
        pattern: "console.log($ARG)",
      },
      replacement: "logger.info($ARG)",
      snippet: 'console.log("x");',
    },
    process.cwd(),
  );

  assert.equal(result.matchCount, 1);
  assert.equal(result.output.trim(), 'logger.info("x");');
  assert.equal(result.input.kind, "snippet");
});

test("runAstRewritePreview accepts snippet inputs with surrounding whitespace", async () => {
  const result = await runAstRewritePreview(
    {
      language: "javascript",
      matcher: {
        pattern: "console.log($ARG)",
      },
      replacement: "logger.info($ARG)",
      snippet: '\n  console.log("x");\n',
    },
    process.cwd(),
  );

  assert.equal(result.matchCount, 1);
  assert.equal(result.output.trim(), 'logger.info("x");');
});

test("runAstRewritePreview throws when replacement references a missing capture", async () => {
  await assert.rejects(
    () =>
      runAstRewritePreview(
        {
          language: "javascript",
          matcher: {
            pattern: "console.log($ARG)",
          },
          replacement: "logger.info($MISSING)",
          snippet: 'console.log("x");',
        },
        process.cwd(),
      ),
    /ast-grep rewrite preview failed: replacement references \$MISSING/,
  );
});

test("runAstRewritePreview keeps matcher failures labeled as matcher failures", async () => {
  await assert.rejects(
    () =>
      runAstRewritePreview(
        {
          language: "javascript",
          matcher: {
            context: "if (",
            selector: "if_statement",
          },
          replacement: "noop()",
          snippet: 'console.log("x");',
        },
        process.cwd(),
      ),
    /ast-grep matcher failed:/,
  );
});

test("runAstRewritePreview labels unreadable file inputs as preview failures", async () => {
  await assert.rejects(
    () =>
      runAstRewritePreview(
        {
          language: "javascript",
          matcher: {
            pattern: "console.log($ARG)",
          },
          replacement: "logger.info($ARG)",
          path: path.join(os.tmpdir(), "definitely-missing-ast-grep.js"),
        },
        process.cwd(),
      ),
    /ast-grep rewrite preview failed: ENOENT:/,
  );
});

test("runAstTest keeps matcher failures labeled as matcher failures", () => {
  assert.throws(
    () =>
      runAstTest({
        language: "javascript",
        snippet: 'console.log("x");',
        matcher: {
          context: "if (",
          selector: "if_statement",
        },
      }),
    /ast-grep matcher failed:/,
  );
});

test("runAstRewritePreview leaves file inputs unchanged", async () => {
  await withTempDir(async (root) => {
    const sourcePath = path.join(root, "sample.ts");
    const original = 'console.log("one");\n';
    await fs.writeFile(sourcePath, original, "utf8");

    const result = await runAstRewritePreview(
      {
        language: "typescript",
        matcher: {
          pattern: "console.log($ARG)",
        },
        replacement: "logger.info($ARG)",
        path: sourcePath,
      },
      root,
    );

    const after = await fs.readFile(sourcePath, "utf8");
    assert.equal(after, original);
    assert.equal(result.output.trim(), 'logger.info("one");');
    assert.deepEqual(result.input, { kind: "file", path: "sample.ts" });
  });
});

test("runAstTest throws on invalid matcher combinations and empty patterns", () => {
  assert.throws(
    () =>
      runAstTest({
        language: "javascript",
        snippet: "const x = 1;",
        matcher: {
          pattern: "",
        },
      }),
    /matcher\.pattern must not be empty/,
  );

  assert.throws(
    () =>
      runAstTest({
        language: "javascript",
        snippet: "const x = 1;",
        matcher: {
          selector: "pair",
        },
      }),
    /matcher\.selector requires matcher\.context/,
  );

  assert.throws(
    () =>
      runAstTest({
        language: "javascript",
        snippet: "const x = 1;",
        matcher: {
          strictness: "smart",
        },
      }),
    /matcher\.strictness requires matcher\.context[\s\S]*matcher\.context form first/,
  );
});

test("runAstTest surfaces noMatch hint on zero matches", () => {
  const result = runAstTest({
    language: "javascript",
    snippet: "const x = 1;",
    matcher: {
      pattern: "console.log($ARG)",
    },
  });

  assert.equal(result.matched, false);
  assert.equal(result.matchCount, 0);
  assert.ok(result.hint !== undefined);
  assert.match(result.hint, /matcher\.context/);
});

test("runAstFind returns sorted matches by file then line then column", { concurrency: false }, async () => {
  await withTempDir(async (root) => {
    const file1 = path.join(root, "a.ts");
    const file2 = path.join(root, "b.ts");
    await fs.writeFile(
      file1,
      'console.log("a2");\nconsole.log("a1");\n',
      "utf8",
    );
    await fs.writeFile(
      file2,
      'console.log("b");',
      "utf8",
    );

    const result = await runAstFind(
      {
        language: "typescript",
        paths: [root],
        matcher: { pattern: "console.log($ARG)" },
        languageGlobs: ["*.ts"],
      },
      root,
    );

    assert.equal(result.matchCount, 3);
    assert.deepEqual(result.matches.map((m) => m.file), [
      "a.ts",
      "a.ts",
      "b.ts",
    ]);
    assert.deepEqual(
      result.matches.map((m) => m.range.start.line),
      [1, 2, 1],
    );
  });
});
