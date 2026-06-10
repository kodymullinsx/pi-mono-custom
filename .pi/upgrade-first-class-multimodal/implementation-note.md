# First-class PDF/image upgrade implementation note

## Source refs

- Fork source branch: `main` at `41ba7f49d87ffb9433242d0ae2249fcf0460928e`
- Upstream fork baseline: `v0.70.2` at `48aa882b5a51e4478da1b65f98c3401151f22e3f`
- Target upstream baseline: `upstream/main` at `93b2e7fae75c1136e1c169d2f70d1c13d4b689d7`
- Upgrade branch: `upgrade/first-class-pdf-image-v0751`

## Behavioral invariants

Pi must preserve the fork's binary-level first-class multimodal path rather than delegating core behavior to the `multimodal-ingress` extension.

- Images are represented as structured base64 content blocks with `type: "image"`, `mimeType`, and `data`. Oversized images must be resized or rejected with a clear user-facing note, not passed through silently.
- PDFs can be represented as structured base64 document blocks with `type: "document"`, `mimeType: "application/pdf"`, `data`, and optional `fileName` when the provider path can safely inline them.
- Providers that cannot accept first-class document blocks must downgrade to summaries/page images or raise structured local serialization errors carrying attachment retry metadata. They must not receive raw PDF document blocks accidentally.
- PDF page-image fallback uses Poppler (`pdfinfo` for page count, `pdftoppm` for rasterization), keeps explicit page limits, and gives continuation guidance for longer documents.
- `@file`/file-argument ingestion and the `read` tool both feed structured attachment content into the model request path, with user-visible text used only as an explanatory anchor.
- Tool/read output must not dump raw base64 into the transcript. Media content should be hidden, summarized, or persisted through sidecar attachment storage.
- Session persistence must keep JSONL history manageable by storing media sidecars and rehydrating attachment content on reload.
- Retry behavior must strip or downgrade attachment-bearing messages deterministically when local/provider serialization rejects images or documents. Error metadata is preferred over regex parsing error text.
- Validation must run with `multimodal-ingress` absent or disabled to prove core behavior survives without the extension.
- BackgroundComputerUse from local `main` is part of the local upgrade target and must be preserved as fork-local extension behavior.

## Upgrade maps

- `fork-v0.70.2-to-main-files.txt` lists fork changes over the upstream baseline.
- `upstream-v0.70.2-to-target-files.txt` lists upstream changes since the fork baseline.
- `overlap-files.txt` lists files changed by both and should drive conflict priority.
