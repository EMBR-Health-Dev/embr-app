import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Regression coverage for a confirmed, reproduced production bug: the
 * Dockerfile's `runtime` stage never copied `apps/api/assets` (the PDF
 * font file `registerEmbrPdfFonts` reads from disk — see
 * lib/pdf-fonts.ts) into the final image, so every Clinical Brief PDF
 * download failed in production with ENOENT, despite a fully green CI
 * run.
 *
 * No existing test caught this because nothing in CI actually builds
 * and runs the real Docker image: `boot-smoke` in ci.yml runs
 * `node dist/server.js` directly against a plain `actions/checkout`,
 * where `apps/api/assets` is present on disk regardless of what the
 * Dockerfile copies, and brief.pdf.test.ts calls the real font-loading
 * code against that same checkout. Both pass locally and in CI either
 * way; only the actual deployed container was missing the file. This
 * test statically parses the Dockerfile instead — the cheapest check
 * that would have caught this exact regression, without requiring a
 * real Docker build in CI.
 */
describe("apps/api/Dockerfile — runtime stage asset coverage", () => {
  const dockerfile = readFileSync(path.join(__dirname, "../Dockerfile"), "utf-8");
  const runtimeStage = dockerfile.slice(dockerfile.indexOf("FROM base AS runtime"));

  it("copies apps/api/assets into the runtime stage — required by lib/pdf-fonts.ts's UNICODE_FONT_PATH", () => {
    expect(runtimeStage).toMatch(
      /COPY --from=build \/repo\/apps\/api\/assets \.\/apps\/api\/assets/,
    );
  });

  it("still copies every other directory the runtime process is known to depend on — a sanity check that this test parses the real runtime stage, not an empty/wrong slice", () => {
    expect(runtimeStage).toContain("./apps/api/dist");
    expect(runtimeStage).toContain("./apps/api/node_modules");
    expect(runtimeStage).toContain("./apps/api/prisma");
  });
});
