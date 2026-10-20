# Temporary DM and group files

DMs and group discussions now accept one file per message, either on its own or with text.

- **Original file limit:** 10 × 1024 × 1024 bytes, inclusive. The limit is checked in both the browser and the server, against the actual decompressed bytes.
- **Before upload:** the browser uses `CompressionStream("gzip")`. Files are not sent uncompressed. Small gzip overhead is allowed for already-compressed/incompressible files; the original-size limit still applies.
- **Storage:** only the gzip bytes are persisted, as a SQLite BLOB in `chat_attachments`, alongside the filename, original/compressed sizes and an epoch expiry timestamp. The server briefly decompresses in bounded memory to validate size and gzip integrity. Uploads are attached to their message atomically, so failed sends leave no orphan BLOBs.
- **Before saving a download:** the browser fetches the compressed bytes, uses `DecompressionStream("gzip")`, verifies the original length, and saves the original file with its filename. Download responses have no `Content-Encoding` header; this keeps transport decoding separate from the explicit frontend decompression. Responses use `private, no-store` and attachment disposition.
- **Ten-minute retention:** measured from successful message/upload persistence. The download endpoint rejects expired files immediately with HTTP 410. The running host removes expired BLOB rows every second; startup and upload/download cleanup cover restarts or suspended runtimes. Message text and the expired-file marker remain, but the file row—including its filename and BLOB—is deleted.
- **Database space:** SQLite secure deletion is enabled, and expiry cleanup checkpoints/truncates the WAL after deleting BLOBs. Freed database pages are reusable; the main `.db` file can retain its peak allocation rather than shrinking after each expiry. Existing external backups, if any, have their own retention policy.
- **Access:** only DM participants and current group members can download. Banned/unapproved accounts are rejected. Unknown or unauthorized attachment IDs return HTTP 404; unauthenticated requests return 401. Leaving a group immediately revokes file access.
- **Browser support:** file transfer requires the native Compression Streams API. Unsupported browsers show an error and retain the draft instead of uploading raw bytes. Ordinary text messaging still works.

No new npm dependencies were added. The existing 12 MB Server Action body limit accommodates a 10 MB original file, gzip overhead, metadata and accompanying text.

## Validation

`npm test` passes **11 behavioral tests**, including compression round trips for binary, empty and already-compressed files; the exact size boundary; oversized and forged claims; bad gzip/CRC; DM/group access; atomic rollback; retained message history; and cleanup without further upload/download activity.

`node tests/browser.mjs` passes **9 browser scenarios**, including real browser upload/compression, saved-file byte and filename equality after download/decompression, client size rejection, HTTP authorization/no-store behavior, expiry feedback, and group access revocation.

Production build, TypeScript, ESLint and `git diff --check` pass. Tests run on disposable databases and download directories.

## UI check

The existing **Accent ladder** direction, seed **1780879093**, is retained without redraws or new assets. File controls answer “what can I send?”; each attachment row answers “what is this file, how large is it, and is it still available?” The school-green identity and the existing conversation layout remain the frame.

`node tests/design.mjs --attachments` inspected DM and group file screens at **1440, 768 and 390 pixels**, with **0 FAIL** and no exceptions. Each screen has a small-text warning for author/time/size/retention metadata; filenames, prose and actions remain at the normal interface scale. All 12 fold/contact-sheet images were opened and reviewed. Output is in `.taste-skill/final-files-direct/` and `.taste-skill/final-files-group/`.

ROUND 1

Seen in one second: a conversation with a clearly named, downloadable file.

Idea (one sentence): temporary study materials travel with the classmates' conversation, while their expiry is stated beside the file.

Live thing: file selection, compression/upload feedback and download/decompression, plus disabled expired states.

Layout words by section: shell=existing labelled sidebar / messages=conversation rows / attachment=filename and action / composer=text and native file selector / members=secondary rail.

Scores: design 7.5 · usability 8.5 · creativity 6.5 · content 8.0 → overall 7.65.

Caps applied: app-screen rules; no inspector failures. No picture or entrance-motion floor applies to these components.

Top three observations, with screenshots and treatment:

1. Adding a picker makes the phone composer taller (`final-files-direct/mobile-page-01.jpg`). Text, file input and send action keep their natural vertical flow, with no overlap or horizontal scrolling.
2. Retention and size details are visually secondary (`final-files-group/mobile-fold.jpg`). They stay at 12px beside a normal-size filename, while the download action has a 44px phone target.
3. Native file-picker wording follows the browser's language (`final-files-direct/desktop-fold.jpg`). Chinese labels and policy copy surround the native control, retaining its familiar keyboard and file-selection behavior.

QA file fixtures (解题思路.txt and 周五讨论提纲.txt) exist only in disposable test databases. No sample files were added to the runtime database.
