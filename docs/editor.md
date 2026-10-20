# Markdown and LaTeX editor

Threads, replies, direct messages and group discussions use `components/MarkdownEditor.tsx`. This controlled source editor submits Markdown through the existing `content` field; the preview uses the same safe `RichText` renderer as published content. Plain metadata fields, including bios and group descriptions, remain plain text.

The toolbar supports bold, italic, headings, quotations, ordered/unordered lists, links, inline code and selected multiline code blocks, inline/display LaTeX, emoji, undo and redo. Tools operate on the selection or insert selected placeholder text at the caret. The link tool selects its URL for replacement. Keyboard shortcuts are Ctrl/Command B, I, K, Z, Shift Z and Y. Arrow keys navigate the toolbar and switch editor/preview tabs. Toolbar buttons never submit the form.

The paperclip opens the existing upload picker:

- Threads: up to four images; replies: up to two. Client image compression and thumbnail/removal controls are preserved. Image form serialization follows the visible previews even after a failed action resets native fields.
- Direct/group chats: one file, original size at most 10 MB. Frontend gzip, compressed database storage, ten-minute expiry, authorized downloads and frontend decompression are unchanged; see `file-transfers.md`.

Sending locks the editor and upload controls. Successful messages/replies clear their source, editor history and selected attachments. Failed sends retain the text draft; failed thread submissions also retain the title. Emoji insertion updates controlled state, and the floating picker closes on outside click, Escape or scrolling. Source entry has native required/length validation, a counter where applicable and a message if a toolbar insertion exceeds the limit.

## Verification

- `npm run build` and `npm run lint`.
- `npm test`: 14 tests, including selection wrapping/toggling, multiline list boundaries, replaceable link destinations, math and code fences.
- `node tests/browser.mjs`: 12 complete scenarios, including editor tools/shortcuts/history, preview refresh, picker activation, image removal/retry, validation draft retention, published math and compressed file upload/download in both chats. Responsive checks cover all four editors, admin/profile/feed tabs and thread moderation actions at 320, 390, 768 and 1440 px, including keyboard focus revealing offscreen controls.
- `node tests/design.mjs --editor`: four screens at 1440, 768 and 390 px. Each screen has **0 FAIL / 1 WARN**. The remaining warning concerns small metadata, toolbar tab labels and secondary syntax hints; editing text is 14 px on desktop and 16 px on phones. KaTeX math font exceptions apply only to the thread reading view.

The existing Accent ladder direction, school-green accent and DM Sans face are retained. Screenshot review found consistent toolbar alignment and no horizontal page overflow. Tools stay on one line and scroll horizontally when needed, with edit/preview fixed beside them and touch-sized controls on phones; the writing area and submission action remain reachable by normal page scrolling. The long new-thread editor intentionally allows more writing space than a chat. Reports and reviewed contact sheets are in ignored `.taste-skill/final-editor-{direct,group,thread,new}/`; functional screenshots are in `.taste-skill/flows/`. Admin navigation, ticket filters, profile/feed tabs and thread actions use the same local scrolling behavior. Keyboard focus fully reveals each focused control. Long content, descriptions and image thumbnail grids keep their natural wrapping. No new image assets or sample content were added to the runtime database.

Action buttons now follow the icon-first policy in `icon-actions.md`, including editor mode switches.
