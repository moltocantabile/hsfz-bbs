# Frontend reconstruction and social features

Implemented October 20, 2026.

Follow-up: [temporary file transfers in DMs and groups](file-transfers.md) adds browser compression/decompression, a 10 MB original-file limit and ten-minute database retention. Updated validation: 11 behavioral tests and 9 browser scenarios.

## What changed

- The shared frontend now uses a labelled sidebar, a compact mobile menu, flat surfaces, local DM Sans typography, a green accent drawn from the existing school mark, and neutral dark mode. Existing routes, approval/grade restrictions, uploads, anonymous posting, likes, favorites, mentions, quotes and administrator tickets are retained.
- `/` leads with discussions and offers latest, hot and featured views. `/boards` holds the complete board directory. Counts come from SQLite.
- `/inbox` starts private conversations by username. A profile's **发送私信** link prefills the recipient. The canonical user pair has one conversation; only its two participants can read or send. Unavailable accounts cannot send or receive new DMs. Read markers use message IDs, advance monotonically, and leave messages arriving after the rendered snapshot unread. The inbox and open chats refresh every eight seconds while visible; there is also a refresh button.
- `/groups` supports discovery, name/description search and a joined-groups filter. `/groups/new` creates a group and adds its creator atomically. Users can join, read the member list, discuss and leave. Discussion history and member identities require current membership. A group owner retains membership; ownership transfer, invitations and closed groups are not part of this version.
- Conversations load the latest 50 messages and provide earlier-history navigation. Group history becomes available when joining.
- Threads and replies already supported GFM Markdown and inline/display LaTeX. That support is retained in a shared renderer and is now available in messages and writing previews. Mentions are parsed only in prose, so code, math, existing links and email addresses remain intact. Raw HTML is not executed; KaTeX runs without trusted commands.
- HTTP(S) links in thread bodies, replies and messages render as cards containing the author's link text, domain and path. Bare URLs work too. Cards open safely in another tab. They do not fetch remote Open Graph metadata or thumbnails. Mentions, relative navigation and email links retain their inline behavior.

Schema initialization in `lib/db.ts` is idempotent. Databases using the upstream recipient/read-flag DM schema are upgraded in one transaction, preserving message IDs, text, timestamps, conversation pairs and read markers. Legacy `/dm` and `/dm/[username]` links redirect to the shared inbox and conversation screens. Runtime data defaults to `data/bbs.db`; `HSFZ_DATA_DIR` can select another directory. Tests always use disposable directories and remove them afterward.

## Design direction

**Accent ladder**, seed **1780879093**, light/open-plane shell. No redraws. The sheet explicitly offers taking the palette ladder from the brand; the existing school green replaces its raspberry. DM Sans is self-hosted as a variable font, with its OFL license in `public/fonts/OFL-DM-Sans.txt`. Chinese uses the system's Chinese sans-serif fallback.

The product inventory was the school name and 附 mark; its motto; students and alumni; grade-specific speech restrictions; academic and sports boards; anonymous confession posts; whitelist/approval registration; thread and reply image attachments; mentions and quoted replies; favorites and likes; and administrator tickets.

**Idea:** 华附的校徽、校训和校园板块成为始终在场的导航与讨论背景。

**Face:** school green on small marks and pale selected surfaces, with the existing 附 mark. The signature element is the combination of actual campus board names, their live counts, and the classmates' discussion stream. The live controls are the feed filters, group filters and writing previews.

| Screen | First question |
| --- | --- |
| Discussions | What are classmates talking about? |
| Boards | Where does my question belong? |
| Inbox | Who has sent me a message, and whom can I contact? |
| Groups | Which people share my interests? |
| Group discussion | What are members discussing, and what can I add? |
| Thread | What is the author saying, and how can I respond? |

No found pictures, clips, stock photographs or generated artwork were used. This is the skill's app-screen workflow, which has no photo or entrance-animation floor. The existing school glyph remains the mark; avatars and group initials represent identities. The font source is [Google Fonts DM Sans](https://github.com/google/fonts/tree/main/ofl/dmsans), licensed under SIL OFL 1.1.

## Checks

- `npm run build`: passed, including TypeScript.
- `npm run lint`: passed with no findings.
- `npm test`: six behavioral tests passed, covering pair uniqueness, private reads/writes/read markers, unavailable accounts, group membership and revocation, history pagination, and rich-text rendering/security.
- `node tests/browser.mjs`: seven browser scenarios passed on an isolated production server. These exercise actual form actions, messages/replies, unread behavior, participant exclusion, group creation/join/chat/leave, mobile navigation and dark mode, thread previews/publication/replies, and existing-route smoke checks. No browser runtime exceptions were recorded.
- `node tests/design.mjs`: five screens inspected at 1440, 768 and 390 pixels. All have **0 FAIL**. All 30 final fold/contact-sheet images were opened and reviewed.
- `node .agents/skills/design-taste-frontend/scripts/lint.mjs --app app components`: **0 FAIL**. Source warnings are the explicit `box-shadow: none` reset, the emoji picker shadow (an actual floating overlay), and the student-ID import field's monospace (IDs retain that convention).
- `git diff --check`: passed.

Before/after home measurements: **4 FAIL / 3 WARN → 0 FAIL / 1 WARN**. The old home had no h1, decorative emoji, a gradient header and uneven stretched board panels. The final home has a one-line title at all widths, a visible posting action and a discussion row on the first phone screen.

Final inspector results, aggregated across widths:

| Screen | Fail | Warn | Explanation |
| --- | ---: | ---: | --- |
| Home | 0 | 1 | Small metadata is restricted to authors, dates, counts and secondary notes. |
| Groups | 0 | 2 | One real group leaves unused space beyond the content; metadata uses the same small scale. |
| Inbox | 0 | 2 | One real conversation leaves unused space beyond the content; metadata stays secondary. |
| Group discussion | 0 | 0 | Discussion precedes the member list on phones; secondary members are unboxed. |
| Thread | 0 | 1 | Metadata and math subscripts are small; prose remains readable. |

The thread inspector allows `font-count,font-fallback`: KaTeX requires its real math faces and emits accessible MathML using the generic `math` family. This exception implements the requested LaTeX support; it does not substitute another UI type system. No other visual rule is allowed.

Reports and images are local generated output in `.taste-skill/before/`, `.taste-skill/final-{home,groups,inbox,group,thread}/` and `.taste-skill/flows/`. They are git-ignored.

## Final visual critique

ROUND 3

Seen in one second: a campus discussion stream, with a clear place to post and quieter community context.

Idea (one sentence): the school's own mark, motto and board vocabulary give a persistent campus identity to a restrained working interface.

Live thing: latest/hot/featured feeds, joined-group filtering, message composition and rich-text preview.

Layout words by section: shell=labelled sidebar / feed=discussion rows / community=unboxed rail / directory=grouped lists / inbox=conversation list and composer / group=conversation and members / thread=reading column and replies.

Scores: design 7.5 · usability 8.5 · creativity 6.5 · content 8.0 → overall 7.65.

Caps applied: no inspector failures remain. Page-only picture and animation caps do not apply to app screens. The design remains a tasteful version of a familiar community interface, so creativity stays at 6.5.

Top three problems (most visible first), each with the screenshot it shows in and the fix:

1. Small accounts leave unused viewport space on desktop (`final-groups/desktop-fold.jpg`, `final-inbox/desktop-fold.jpg`). The content and footer now keep their natural height, and the group member rail is unboxed. Retain the actual row count rather than filling the remaining viewport with invented data.
2. The long phone feed puts secondary community context below its 25 discussion rows (`final-home/mobile-page-01.jpg`). Primary jobs stay available through the mobile menu, and the first discussion is on the first screen. Future feed pagination could shorten that scroll without squeezing the rows.
3. The phone feed and thread have a high proportion of small secondary text (`final-home/mobile-fold.jpg`, `final-thread/mobile-fold.jpg`). Main discussion metadata was increased; 11–12px remains for secondary notes and subscripts. The remaining tradeoff is density versus longer scrolling, rather than clipped or hidden content.

The final sparse inbox/group screens deliberately show their actual rows; they are not padded with invented conversations or groups. The existing seeded school discussion data is unchanged. Additional visual fixtures (华附数学讨论, 数列的另一种解法 and their messages) exist only in disposable QA databases and are removed at the end of each run. No new sample content needs replacing in the runtime database.

## Browser verification prerequisites

The optional browser and visual scripts require Chrome and the locally installed `design-taste-frontend` skill at `.agents/skills/design-taste-frontend/`. That local tool bundle is not vendored in this change. The application build and `npm test` do not require the skill.
