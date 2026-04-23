# PptxGenJS Guide

Use this guide when creating a new deck from scratch. For new work, PptxGenJS is the default path because it gives explicit control over layout, slide masters, notes, sections, tables, charts, media placement, and overall visual system design.

## Setup and helper strategy

Start with plain PptxGenJS. Add helper utilities when they are available.

```javascript
const pptxgen = require("pptxgenjs");
const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";  // 13.3" × 7.5"
pptx.author = "Your Name";
pptx.title = "Presentation Title";
pptx.subject = "Presentation";
pptx.lang = "en-US";
```

If you are running inside the OpenAI slides environment, helper utilities are available at `/home/oai/skills/slides/pptxgenjs_helpers`.

```javascript
let helpers = {};
try {
  helpers = require("/home/oai/skills/slides/pptxgenjs_helpers");
} catch {
  // Fallback for non-OpenAI environments: either omit helpers or provide local equivalents.
  helpers = {};
}

const {
  autoFontSize,
  calcTextBox,
  imageSizingCrop,
  imageSizingContain,
  safeOuterShadow,
  warnIfSlideHasOverlaps,
  warnIfSlideElementsOutOfBounds,
} = helpers;
```

Do not hardcode that helper path into production code unless that path actually exists in the runtime environment.

## Layout dimensions

Slide dimensions use inches.

- `LAYOUT_16x9`: 10" × 5.625"
- `LAYOUT_16x10`: 10" × 6.25"
- `LAYOUT_4x3`: 10" × 7.5"
- `LAYOUT_WIDE`: 13.3" × 7.5"

Use `LAYOUT_WIDE` by default unless the user or template requires a different aspect ratio.

## Slide masters and sections

Use masters for consistent branding.

```javascript
pptx.defineSlideMaster({
  title: "MASTER_MAIN",
  background: { color: "F7F8FA" },
  objects: [
    {
      rect: {
        x: 0,
        y: 0,
        w: 13.3,
        h: 0.18,
        fill: { color: "1F3A5F" },
        line: { color: "1F3A5F" }
      }
    },
    {
      text: {
        text: "Deck Title",
        options: {
          x: 0.6,
          y: 0.28,
          w: 8.8,
          h: 0.4,
          fontSize: 26,
          bold: true,
          color: "1F2937",
          margin: 0,
        }
      }
    }
  ]
});

pptx.addSection({ title: "Executive Summary" });
pptx.addSection({ title: "Recommendations" });

const slide = pptx.addSlide("MASTER_MAIN");
```

## Text and formatting

```javascript
// Basic text
slide.addText("Simple Text", {
  x: 1, y: 1, w: 8, h: 2,
  fontSize: 24,
  fontFace: "Aptos",
  color: "363636",
  bold: true,
  align: "center",
  valign: "mid",
  margin: 0,
});

// Character spacing: use charSpacing, not letterSpacing
slide.addText("SPACED TEXT", {
  x: 1, y: 1, w: 8, h: 1,
  charSpacing: 6,
});

// Rich text arrays
slide.addText([
  { text: "Bold ", options: { bold: true } },
  { text: "Italic ", options: { italic: true } },
  { text: "Muted", options: { color: "6B7280" } },
], {
  x: 1,
  y: 3,
  w: 8,
  h: 1,
  margin: 0,
});

// Multi-line text requires breakLine: true on intermediate runs
slide.addText([
  { text: "Line 1", options: { breakLine: true } },
  { text: "Line 2", options: { breakLine: true } },
  { text: "Line 3" },
], {
  x: 0.5,
  y: 0.5,
  w: 8,
  h: 2,
  margin: 0,
});
```

**Text box padding matters.** Use `margin: 0` when aligning text with shapes, lines, or icons at the same x-position.

## Text fitting

When content length is uncertain, fit it intentionally.

```javascript
const bodyText = "Revenue grew 18% year over year, led by enterprise upsell and usage expansion.";

if (autoFontSize) {
  slide.addText(
    bodyText,
    autoFontSize(bodyText, "Aptos", {
      x: 0.7,
      y: 1.5,
      w: 5.9,
      h: 1.4,
      fontSize: 24,
      minFontSize: 16,
      maxFontSize: 26,
      color: "1F2937",
      valign: "mid",
      margin: 0,
    })
  );
} else {
  slide.addText(bodyText, {
    x: 0.7,
    y: 1.5,
    w: 5.9,
    h: 1.4,
    fontSize: 20,
    color: "1F2937",
    margin: 0,
    fit: "shrink",
  });
}
```

Do not let a title wrap to two lines unless the composition was designed for it.

## Lists and bullets

```javascript
// ✅ Correct: multiple bullets
slide.addText([
  { text: "First item", options: { bullet: true, breakLine: true } },
  { text: "Second item", options: { bullet: true, breakLine: true } },
  { text: "Third item", options: { bullet: true } },
], {
  x: 0.5,
  y: 0.5,
  w: 8,
  h: 3,
  margin: 0,
});

// Numbered list
slide.addText([
  { text: "First", options: { bullet: { type: "number" }, breakLine: true } },
  { text: "Second", options: { bullet: { type: "number" }, breakLine: true } },
  { text: "Third", options: { bullet: { type: "number" } } },
], {
  x: 0.5,
  y: 3.8,
  w: 8,
  h: 2,
  margin: 0,
});
```

**Never use literal Unicode bullets like `•` for normal bullet lists.** That often creates double bullets or inconsistent indentation.

## Shapes

```javascript
slide.addShape(pptx.ShapeType.rect, {
  x: 0.5, y: 0.8, w: 1.5, h: 3.0,
  fill: { color: "FF0000" },
  line: { color: "000000", pt: 2 },
});

slide.addShape(pptx.ShapeType.ellipse, {
  x: 4, y: 1, w: 2, h: 2,
  fill: { color: "0000FF" },
});

slide.addShape(pptx.ShapeType.line, {
  x: 1, y: 3, w: 5, h: 0,
  line: { color: "FF0000", pt: 3, dash: "dash" },
});

slide.addShape(pptx.ShapeType.rect, {
  x: 1, y: 1, w: 3, h: 2,
  fill: { color: "0088CC", transparency: 50 },
  line: { color: "0088CC" },
});

slide.addShape(pptx.ShapeType.roundRect, {
  x: 1, y: 1, w: 3, h: 2,
  rectRadius: 0.1,
  fill: { color: "FFFFFF" },
  line: { color: "D1D5DB", pt: 1 },
  shadow: safeOuterShadow
    ? safeOuterShadow("000000", 0.12, 45, 2, 1)
    : { type: "outer", color: "000000", blur: 6, offset: 2, angle: 135, opacity: 0.12 },
});
```

### Shape and shadow notes

| Property | Type | Range | Notes |
|----------|------|-------|-------|
| `color` | string | 6-char hex | No `#` prefix |
| `transparency` | number | 0-100 | Use this for fills |
| `blur` | number | 0-100 pt | Shadow blur |
| `offset` | number | non-negative | Negative values can corrupt output |
| `angle` | number | 0-359 | Shadow direction |
| `opacity` | number | 0.0-1.0 | Use this instead of 8-char hex |

Gradient fills are not natively reliable for every use case. Use a gradient image background when you want consistent output.

## Images

### Image sources

```javascript
// From file path
slide.addImage({ path: "images/chart.png", x: 1, y: 1, w: 5, h: 3 });

// From URL
slide.addImage({ path: "https://example.com/image.jpg", x: 1, y: 1, w: 5, h: 3 });

// From base64
slide.addImage({ data: "image/png;base64,iVBORw0KGgo...", x: 1, y: 1, w: 5, h: 3 });
```

### Image options

```javascript
slide.addImage({
  path: "image.png",
  x: 1, y: 1, w: 5, h: 3,
  rotate: 45,
  rounding: true,
  transparency: 50,
  flipH: true,
  altText: "Description",
  hyperlink: { url: "https://example.com" },
});
```

### Sizing and aspect ratio

Prefer helper utilities when available:

```javascript
if (imageSizingCrop) {
  slide.addImage({
    path: "hero.jpg",
    ...imageSizingCrop("hero.jpg", 7.4, 0.8, 5.2, 2.9),
  });

  slide.addImage({
    path: "logo.png",
    ...imageSizingContain("logo.png", 11.8, 0.3, 1.0, 0.45),
  });
}
```

If helpers are not available, calculate dimensions and center the image manually.

```javascript
const origWidth = 1978;
const origHeight = 923;
const maxHeight = 3.0;
const calcWidth = maxHeight * (origWidth / origHeight);
const centerX = (13.3 - calcWidth) / 2;

slide.addImage({
  path: "image.png",
  x: centerX,
  y: 1.2,
  w: calcWidth,
  h: maxHeight,
});
```

Supported formats commonly include PNG, JPG, GIF, and modern SVG.

## Icons

Use `react-icons` plus `sharp` when you want clean icon workflows.

### Setup

```javascript
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const { FaCheckCircle, FaChartLine } = require("react-icons/fa");

function renderIconSvg(IconComponent, color = "#000000", size = 256) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}

async function iconToBase64Png(IconComponent, color, size = 256) {
  const svg = renderIconSvg(IconComponent, color, size);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + pngBuffer.toString("base64");
}
```

### Add icon to slide

```javascript
const iconData = await iconToBase64Png(FaCheckCircle, "#4472C4", 256);
slide.addImage({
  data: iconData,
  x: 1,
  y: 1,
  w: 0.5,
  h: 0.5,
});
```

Use rasterization sizes of 256 or higher for crisp icons.

## Slide backgrounds

```javascript
slide.background = { color: "F1F1F1" };
slide.background = { color: "FF3399", transparency: 50 };
slide.background = { path: "https://example.com/bg.jpg" };
slide.background = { data: "image/png;base64,iVBORw0KGgo..." };
```

## Tables

```javascript
slide.addTable([
  ["Header 1", "Header 2"],
  ["Cell 1", "Cell 2"],
], {
  x: 1,
  y: 1,
  w: 8,
  h: 2,
  border: { pt: 1, color: "999999" },
  fill: { color: "F1F1F1" },
});

slide.addTable([
  [{ text: "Header", options: { fill: { color: "6699CC" }, color: "FFFFFF", bold: true } }, "Cell"],
  [{ text: "Merged", options: { colspan: 2 } }],
], {
  x: 1,
  y: 3.5,
  w: 8,
  colW: [4, 4],
});
```

If a table becomes too dense, split it, turn it into a chart, or redesign the slide.

## Charts

```javascript
// Bar chart
slide.addChart(pptx.ChartType.bar, [{
  name: "Sales",
  labels: ["Q1", "Q2", "Q3", "Q4"],
  values: [4500, 5500, 6200, 7100],
}], {
  x: 0.5,
  y: 0.6,
  w: 6,
  h: 3,
  catAxisLabelColor: "64748B",
  valAxisLabelColor: "64748B",
  showTitle: true,
  title: "Quarterly Sales",
});

// Line chart
slide.addChart(pptx.ChartType.line, [{
  name: "Temp",
  labels: ["Jan", "Feb", "Mar"],
  values: [32, 35, 42],
}], {
  x: 0.5,
  y: 4,
  w: 6,
  h: 2.5,
  lineSize: 3,
  lineSmooth: true,
});

// Pie chart
slide.addChart(pptx.ChartType.pie, [{
  name: "Share",
  labels: ["A", "B", "Other"],
  values: [35, 45, 20],
}], {
  x: 7,
  y: 1,
  w: 5,
  h: 4,
  showPercent: true,
});
```

### Better-looking charts

Default charts often look dated. Apply cleaner styling.

```javascript
slide.addChart(pptx.ChartType.bar, chartData, {
  x: 0.5,
  y: 1,
  w: 9,
  h: 4,
  chartColors: ["0D9488", "14B8A6", "5EEAD4"],
  chartArea: { fill: { color: "FFFFFF" }, roundedCorners: true },
  catAxisLabelColor: "64748B",
  valAxisLabelColor: "64748B",
  valGridLine: { color: "E2E8F0", pt: 0.5 },
  catGridLine: { color: "FFFFFF", transparency: 100 },
  showValue: true,
  dataLabelPosition: "outEnd",
  dataLabelColor: "1E293B",
  showLegend: false,
});
```

Useful chart options include:

- `chartColors: [...]`
- `chartArea: { fill, border, roundedCorners }`
- `valGridLine` and `catGridLine`
- `lineSmooth: true`
- `legendPos: "b" | "t" | "l" | "r" | "tr"`

## Speaker notes and sources

Add notes programmatically when the slide uses external facts or media.

```javascript
slide.addNotes(`
[Sources]
- Company annual report, 2026, investor presentation, https://example.com/investor
- Product image, vendor media kit, accessed 2026-04-19, https://example.com/media
`);
```

## Common pitfalls

These are not cosmetic preferences. Several of these can corrupt the output file or create broken rendering.

1. **Never use `#` in color strings.** Use `"FF0000"`, not `"#FF0000"`.
   ```javascript
   color: "FF0000"   // ✅ Correct
   color: "#FF0000"  // ❌ Can corrupt output
   ```

2. **Never encode opacity as an 8-character hex color.** Use the `opacity` or `transparency` property instead.
   ```javascript
   shadow: { type: "outer", blur: 6, offset: 2, color: "00000020" } // ❌ Wrong
   shadow: { type: "outer", blur: 6, offset: 2, color: "000000", opacity: 0.12 } // ✅ Correct
   ```

3. **Use `bullet: true`; never prepend literal Unicode bullets.** Literal bullets often produce double bullets or spacing glitches.

4. **Use `breakLine: true` between array items.** Otherwise text runs together.

5. **Avoid `lineSpacing` with bullets.** It often creates excessive vertical gaps. Prefer `paraSpaceAfter`.

6. **Create a fresh presentation instance for each deck.** Do not reuse a `new pptxgen()` object across unrelated outputs.

7. **Never reuse options objects across repeated `addShape()` or similar calls.** PptxGenJS mutates some objects in place, including some shadow/unit conversions.
   ```javascript
   const shadow = { type: "outer", blur: 6, offset: 2, color: "000000", opacity: 0.15 };
   slide.addShape(pptx.ShapeType.rect, { x: 1, y: 1, w: 3, h: 1.5, shadow });
   slide.addShape(pptx.ShapeType.rect, { x: 5, y: 1, w: 3, h: 1.5, shadow }); // ❌ Risky

   const makeShadow = () => ({ type: "outer", blur: 6, offset: 2, color: "000000", opacity: 0.15 });
   slide.addShape(pptx.ShapeType.rect, { x: 1, y: 1, w: 3, h: 1.5, shadow: makeShadow() });
   slide.addShape(pptx.ShapeType.rect, { x: 5, y: 1, w: 3, h: 1.5, shadow: makeShadow() }); // ✅ Safe
   ```

8. **Do not pair `ROUNDED_RECTANGLE` cards with rectangular accent overlays unless you want exposed corners.** If the accent bar must align flush, use `RECTANGLE` instead.
   ```javascript
   // ❌ Accent bar does not cover rounded corners cleanly
   slide.addShape(pptx.ShapeType.roundRect, { x: 1, y: 1, w: 3, h: 1.5, fill: { color: "FFFFFF" } });
   slide.addShape(pptx.ShapeType.rect, { x: 1, y: 1, w: 0.08, h: 1.5, fill: { color: "0891B2" } });

   // ✅ Use rect when you want a flush accent edge
   slide.addShape(pptx.ShapeType.rect, { x: 1, y: 1, w: 3, h: 1.5, fill: { color: "FFFFFF" } });
   slide.addShape(pptx.ShapeType.rect, { x: 1, y: 1, w: 0.08, h: 1.5, fill: { color: "0891B2" } });
   ```

## Full example

```javascript
const pptxgen = require("pptxgenjs");
let helpers = {};
try {
  helpers = require("/home/oai/skills/slides/pptxgenjs_helpers");
} catch {
  helpers = {};
}
const {
  autoFontSize,
  imageSizingCrop,
  safeOuterShadow,
  warnIfSlideHasOverlaps,
  warnIfSlideElementsOutOfBounds,
} = helpers;

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "OpenAI";
pptx.title = "Board Update";

pptx.defineSlideMaster({
  title: "MASTER_MAIN",
  background: { color: "F7F8FA" },
  objects: [
    {
      rect: {
        x: 0,
        y: 0,
        w: 13.3,
        h: 0.18,
        fill: { color: "1F3A5F" },
        line: { color: "1F3A5F" }
      }
    },
  ],
});

pptx.addSection({ title: "Executive Summary" });

const slide1 = pptx.addSlide("MASTER_MAIN");
slide1.background = { color: "F7F8FA" };
slide1.addText("Q2 Business Review", {
  x: 0.7, y: 0.4, w: 6.5, h: 0.5,
  fontSize: 30, bold: true, color: "111827", margin: 0,
});

const summaryText = "Expansion revenue and improved retention more than offset slower SMB demand.";
if (autoFontSize) {
  slide1.addText(summaryText, autoFontSize(summaryText, "Aptos", {
    x: 0.7, y: 1.1, w: 5.9, h: 1.2,
    fontSize: 22, minFontSize: 16, maxFontSize: 24,
    color: "374151", margin: 0,
  }));
} else {
  slide1.addText(summaryText, {
    x: 0.7, y: 1.1, w: 5.9, h: 1.2,
    fontSize: 20, color: "374151", margin: 0,
  });
}

if (imageSizingCrop) {
  slide1.addImage({ path: "hero.jpg", ...imageSizingCrop("hero.jpg", 7.5, 0.65, 5.1, 2.9) });
}

slide1.addText("18%", { x: 0.7, y: 2.6, w: 1.5, h: 0.7, fontSize: 30, bold: true, color: "1F3A5F", margin: 0 });
slide1.addText("YoY revenue growth", { x: 0.7, y: 3.2, w: 2.2, h: 0.35, fontSize: 14, color: "4B5563", margin: 0 });
slide1.addNotes(`
[Sources]
- Company earnings release, 2026-04-18, https://example.com/earnings
- Hero image, company media kit, accessed 2026-04-19, https://example.com/media
`);
if (warnIfSlideHasOverlaps) warnIfSlideHasOverlaps(slide1, pptx);
if (warnIfSlideElementsOutOfBounds) warnIfSlideElementsOutOfBounds(slide1, pptx);

const slide2 = pptx.addSlide("MASTER_MAIN");
slide2.addText("Three operational priorities", {
  x: 0.7, y: 0.45, w: 5.8, h: 0.5,
  fontSize: 28, bold: true, color: "111827", margin: 0,
});

const priorities = [
  ["Accelerate enterprise onboarding", "Reduce implementation time with pre-built workflows and better partner enablement."],
  ["Raise renewal quality", "Target high-risk cohorts with usage coaching and pricing interventions."],
  ["Tighten roadmap focus", "Shift engineering capacity toward the two features with the highest proven attach rates."],
];

priorities.forEach((item, idx) => {
  const y = 1.3 + idx * 1.5;
  slide2.addShape(pptx.ShapeType.rect, {
    x: 0.7,
    y,
    w: 5.8,
    h: 1.1,
    fill: { color: "FFFFFF" },
    line: { color: "D1D5DB", pt: 1 },
    shadow: safeOuterShadow
      ? safeOuterShadow("000000", 0.12, 45, 2, 1)
      : { type: "outer", color: "000000", blur: 6, offset: 2, angle: 135, opacity: 0.12 },
  });
  slide2.addText(item[0], { x: 0.95, y: y + 0.16, w: 5.1, h: 0.25, fontSize: 18, bold: true, color: "1F2937", margin: 0 });
  slide2.addText(item[1], { x: 0.95, y: y + 0.46, w: 5.1, h: 0.44, fontSize: 13, color: "4B5563", margin: 0 });
});
slide2.addNotes(`
[Sources]
- Internal operating review, 2026-04-15
`);
if (warnIfSlideHasOverlaps) warnIfSlideHasOverlaps(slide2, pptx);
if (warnIfSlideElementsOutOfBounds) warnIfSlideElementsOutOfBounds(slide2, pptx);

pptx.writeFile({ fileName: "board_update.pptx" });
```

## Final QA

After writing the deck:

```bash
python scripts/preview.py board_update.pptx --output-dir preview/ --montage
python scripts/qc.py board_update.pptx --output-dir qc/
```

Fix all layout issues before delivery.
