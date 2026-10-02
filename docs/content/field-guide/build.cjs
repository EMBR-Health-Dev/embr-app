// Prints field-guide.html to the website's Field Guide PDF.
// Usage: node docs/content/field-guide/build.cjs [output.pdf]
// Needs Playwright with Chromium (PLAYWRIGHT_BROWSERS_PATH or a local install).
const path = require("node:path");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("/opt/node22/lib/node_modules/playwright"));
}

(async () => {
  const source = path.join(__dirname, "field-guide.html");
  const output = process.argv[2] || path.resolve(__dirname, "../../../../landingpage/embr-guide.pdf");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`file://${source}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: output,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate:
      '<div style="width:100%;font-family:Inter,sans-serif;font-size:7pt;color:#746B82;padding:0 18mm;display:flex;justify-content:space-between;"><span>EMBR · Working Through the Menopause Transition</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  });
  await browser.close();
  console.log(`Wrote ${output}`);
})();
