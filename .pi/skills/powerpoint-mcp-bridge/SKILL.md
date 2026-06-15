---
name: powerpoint-mcp-bridge
description: Use this skill whenever the user asks to control, inspect, edit, render, export, or review an active PowerPoint deck through the local powerpoint-mcp-bridge project. Trigger on mentions of the PowerPoint MCP bridge, ppt_status/ppt_* bridge tools, active PowerPoint deck editing, native shape moves, slide rendering/export through Office.js, or requests to clean up a currently open slide without manually editing the .pptx package. This skill is especially important for diagram/data-flow cleanup because it prefers live Office.js shape tools and PowerPoint-rendered previews before falling back to OOXML edits.
---

# PowerPoint MCP Bridge

This skill governs use of Kody's local PowerPoint MCP bridge. The bridge lets an agent operate on the active PowerPoint deck through a sideloaded Office.js taskpane and a localhost sidecar.

Project root: `/Users/kodymullins/Workspace/tooling/mcp/powerpoint-mcp-bridge`

Architecture:

`agent/MCP client -> stdio MCP server -> https/wss sidecar on 127.0.0.1:3443 -> PowerPoint taskpane -> Office.js -> active presentation`

## First checks

Start by checking whether bridge tools are directly callable in the current harness. If tools named `ppt_status`, `ppt_list_slides`, `ppt_list_shapes`, `ppt_render_slide`, or similar are available, use them directly. If they are not available, inspect the local sidecar state from the project root:

```bash
cd /Users/kodymullins/Workspace/tooling/mcp/powerpoint-mcp-bridge && curl -sk https://localhost:3443/health
```

A healthy bridge shows `sidecar: "running"` and `connected: true`. If the sidecar is not running, use `npm run dev` from the project root. If it is running but not connected, PowerPoint needs the sideloaded add-in open from Home > Add-ins > PowerPoint MCP Bridge. The sidecar only sees the deck whose taskpane is currently connected; with multiple taskpanes, the latest connection wins.

Do not assume the bridge can scan every open deck. Always confirm the selected slide or active slide before editing.

## Preferred workflow for slide review and cleanup

Use the live bridge before falling back to file-level OOXML surgery.

1. Call `ppt_status` and confirm the taskpane is connected to PowerPoint.
2. Call `ppt_get_selected_slides`; if the user is asking about “this slide,” treat the selected slide as the target.
3. Call `ppt_list_shapes` for the target slide and use the shape IDs, bounds, text previews, and z-order as the edit map.
4. Render the slide with `ppt_render_slide` before judging visual quality. The rendered PNG is the source of truth for connector placement, text fit, and overlap.
5. For text-only changes, use `ppt_replace_shape_text_preserve_style` or `ppt_set_shape_text_plain`.
6. For layout cleanup, use `ppt_set_shape_bounds` for a single shape or `ppt_set_shapes_bounds` for coordinated moves/resizes. Prefer the batch tool when moving related cards, labels, and arrows together.
7. Render again and visually trace every pathway from source to target. Fix any arrow that appears to originate from the wrong group, land between objects, cross unrelated cards, or leave a floating output card.
8. Export with `ppt_export_slide` or `ppt_export_deck` only after the live slide looks right.

For diagram/data-flow slides, pair this skill with the `slide-deck` skill. Use the operational swimlane pattern: inputs/triggers, runtime/process, validation/control gate, decision paths, outputs/evidence. Main flow should read in under ten seconds.

## Native shape bounds tools

Use point-based PowerPoint coordinates. `ppt_list_shapes` returns each shape's current `bounds`:

```json
{
  "left": 572.4,
  "top": 275.0,
  "width": 183.6,
  "height": 39.6
}
```

Move or resize one shape:

```json
{
  "slideId": "256#0",
  "shapeId": "73",
  "bounds": { "left": 572.4, "top": 282.0 }
}
```

Move or resize several shapes in one call:

```json
{
  "slideId": "256#0",
  "updates": [
    { "shapeId": "73", "bounds": { "top": 282.0 } },
    { "shapeId": "74", "bounds": { "top": 284.9 } },
    { "shapeId": "81", "bounds": { "top": 302.0 } }
  ]
}
```

Omitted fields keep their existing values. Use this to avoid accidental resizing when only moving shapes. Move labels with their associated arrows and cards; a cleaned-up diagram is worse if its label now describes the wrong branch.

## When direct bridge tools are unavailable

Some Pi/API sessions may not expose MCP tools directly even when the bridge is installed. In that case, do not pretend the tools are available. The least-bad fallback for read/review work is:

1. Confirm sidecar health with `/health`.
2. Use a short local script inside the project to connect to the running sidecar only if necessary.
3. Render/export the selected slide.
4. If editing is required and native tools are unavailable, edit the exported `.pptx` package surgically, validate ZIP/XML integrity, and render the result.

Treat OOXML editing as a fallback, not the default. It can produce a corrected package, but it does not update the already-open deck in place.

## Safety and verification

For visible-user actions, avoid surprising deck changes. If a change could overwrite or broadly rearrange the active deck, state the target slide and intended changes first. Prefer small, reversible edits and save/export artifacts under the bridge project's `artifacts/` directory.

Before delivery, verify:

- The target slide ID and selected slide were confirmed.
- Shape edits used current `ppt_list_shapes` bounds, not stale coordinates.
- A PowerPoint-rendered PNG was inspected after edits.
- Connector paths have one obvious source and one obvious target.
- The exported `.pptx` or slide artifact path is reported clearly.
- Any fallback to OOXML editing is disclosed as a fallback, especially if the active deck was not updated in place.
