# Visio OOXML reference

This reference summarizes the structure observed in Visio OOXML packages and the practical editing rules that follow from it.

## Package layout

Modern Visio files use the Open Packaging Convention, the same family of ZIP-based packaging used by Office documents. A `.vsdx` is not plain text, but once unpacked it contains XML parts.

Common top-level parts:

- `[Content_Types].xml`
- `_rels/.rels`
- `docProps/app.xml`
- `docProps/core.xml`
- `docProps/custom.xml`
- `docProps/thumbnail.emf`
- `visio/document.xml`
- `visio/_rels/document.xml.rels`
- `visio/pages/pages.xml`
- `visio/pages/page1.xml`
- `visio/pages/_rels/pages.xml.rels`
- `visio/pages/_rels/page1.xml.rels`
- `visio/masters/masters.xml`
- `visio/masters/master1.xml`
- `visio/masters/_rels/masters.xml.rels`
- `visio/media/*`
- `visio/windows.xml`

## Namespaces

Main Visio XML:

```text
http://schemas.microsoft.com/office/visio/2012/main
```

Relationship package XML:

```text
http://schemas.openxmlformats.org/package/2006/relationships
```

Relationship attributes inside Visio XML:

```text
http://schemas.openxmlformats.org/officeDocument/2006/relationships
```

## Relationship flow

The root `_rels/.rels` points to `visio/document.xml` using a Visio document relationship type.

`visio/_rels/document.xml.rels` usually points to:

- `masters/masters.xml`
- `pages/pages.xml`
- `windows.xml`

`visio/pages/pages.xml` contains page catalogue entries. Each `<Page>` has a `<Rel r:id="..."/>` child. Resolve that ID through `visio/pages/_rels/pages.xml.rels` to find `page1.xml`, `page2.xml`, and so on.

`visio/masters/masters.xml` contains master catalogue entries. Each `<Master>` can have a `<Rel r:id="..."/>` child. Resolve that ID through `visio/masters/_rels/masters.xml.rels` to find the corresponding `masterN.xml`.

Page parts can also have relationships to masters, media, or other package parts.

## Document part

`visio/document.xml` commonly contains:

- `<DocumentSettings>`
- `<Colors>`
- `<FaceNames>`
- `<StyleSheets>`
- `<DocumentSheet>`

Style sheets and document cells can be inherited by shapes. Do not remove seemingly unused style sheets without checking inherited references.

## Page catalogue

`visio/pages/pages.xml` stores page-level metadata:

- `ID`
- `NameU`
- `Name`
- view scale and center
- `<PageSheet>` with cells such as `PageWidth`, `PageHeight`, `PageScale`, `DrawingScale`, print settings, and layer rows
- `<Rel r:id="..."/>` linking to the page contents part

## Page contents

`visio/pages/pageN.xml` usually has this shape:

```xml
<PageContents>
  <Shapes>
    <Shape ID="..." NameU="..." Type="..." Master="...">
      <Cell N="PinX" V="..."/>
      <Cell N="PinY" V="..."/>
      <Section N="Geometry">...</Section>
      <Text>...</Text>
    </Shape>
  </Shapes>
  <Connects>
    <Connect FromSheet="..." FromCell="EndX" ToSheet="..." ToCell="Connections.X2"/>
  </Connects>
</PageContents>
```

Groups can contain nested shapes. Count and edit nested shapes deliberately.

## ShapeSheet cells

Direct `<Cell>` elements on a shape represent ShapeSheet cells. Important attributes:

- `N`: cell name
- `V`: current value
- `F`: formula
- `U`: unit

Cells inside `<Section>/<Row>` blocks represent grouped ShapeSheet sections, such as geometry, character formatting, paragraph formatting, connection points, controls, tabs, user cells, shape data properties, actions, or layers.

Do not discard `F` formulas when changing a cell value unless the user explicitly wants a static value.

## Text

Shape text is inside `<Text>`. Visio stores formatting markers as child elements, so the text may be split across element text and child tails:

```xml
<Text><cp IX="0"/>Input
</Text>
```

Use XML `itertext()` to read visible text. When editing, preserve child markers such as:

- `<cp>` character property marker
- `<pp>` paragraph property marker
- `<tp>` tab property marker
- `<fld>` field marker

For rich text, prefer replacing only the text/tail nodes that carry the visible words. For plain text replacement where formatting does not matter, rebuilding the `<Text>` content may be acceptable.

## Connectors and graph edges

Connector shapes often have:

- `BeginX`
- `BeginY`
- `EndX`
- `EndY`
- `BegTrigger`
- `EndTrigger`
- `BeginArrow`
- `EndArrow`
- `ConFixedCode`
- route geometry rows

The page-level `<Connects>` collection maps connector endpoints to the connected shapes. For process flow extraction, derive edges from `<Connect>` records:

- `FromSheet` is often the connector shape ID
- `FromCell="BeginX"` points to the source side
- `FromCell="EndX"` points to the target side
- `ToSheet` is the connected shape ID

Connector label text lives on the connector shape itself.

## Masters

Masters define reusable shapes and stencils. A page shape with `Master="4"` references a master ID in `masters.xml`, not necessarily `master4.xml`. Resolve the master ID through the `<Master>` entry, then its relationship ID, then `masters.xml.rels`.

Preserve master IDs and relationship IDs unless you are intentionally adding or removing a master.

## Editing strategy

Safe edits:

- read and summarize pages, shapes, text, masters, and connectors
- replace visible text inside an existing shape
- update document properties
- update simple ShapeSheet cell values while preserving formula semantics
- remove or add a relationship only with matching content-type and target updates

Risky edits:

- deleting masters
- renumbering shape IDs
- changing connector endpoints without updating both shape cells and `<Connects>`
- changing page size without checking coordinates and scale
- rebuilding `<Text>` elements with rich formatting
- changing geometry rows without visual render checks
- generating a complete `.vsdx` from scratch without a seed package

## Example observations from the Aged-Fail-To-Deliver sample

The sample package has one page, 13 master entries, 137 shapes, 53 text-bearing shapes, and 80 page-level connector records. It uses master types such as `Activity`, `Dynamic connector`, `Event`, `File`, `XOR`, and `E-Mail`. Embedded EMF files live under `visio/media/`.
