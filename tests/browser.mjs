import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import { gunzipSync } from 'node:zlib';
import { Browser, sleep } from '../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
const temp = mkdtempSync(join(tmpdir(), 'hsfz-browser-'));
const origin = 'http://localhost:3101';
const output = resolve('.taste-skill/flows'); mkdirSync(output, { recursive: true });
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3101'], { cwd: resolve('.'), env: { ...process.env, HSFZ_DATA_DIR: temp }, stdio: 'pipe' });
let serverLog = ''; server.stdout.on('data', d => { serverLog += d; }); server.stderr.on('data', d => { serverLog += d; });
let browser, db;
const completed = [];
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(origin)).ok) break; } catch {} await sleep(250); }
  db = new Database(join(temp, 'bbs.db'));
  const users = db.prepare("SELECT id, username FROM users WHERE username IN ('chen2026','su2027','lin2027') ORDER BY id").all();
  const [alice, bob, outsider] = users;
  browser = await Browser.launch();
  const page = await browser.newPage({ width: 1440, height: 900 });
  const authenticate = async user => {
    const token = randomBytes(32).toString('hex');
    db.prepare("INSERT INTO sessions (token,user_id,created_at) VALUES (?, ?, datetime('now'))").run(token, user.id);
    await page.send('Network.setCookie', { name: 'hsfz_session', value: token, url: origin, httpOnly: true, sameSite: 'Lax' });
    return token;
  };
  const waitFor = async (fn, detail) => { for (let i = 0; i < 80; i++) { if (await fn()) return; await sleep(150); } throw new Error('Timed out: ' + detail); };
  const fill = async (selector, value) => page.eval(({ selector, value }) => {
    const el = document.querySelector(selector); if (!el) throw new Error('Missing ' + selector);
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { selector, value });
  const chooseFile = async (name, bytes) => page.eval(({ name, bytes }) => {
    const input = document.querySelector('.message-composer input[type=file]');
    const data = new DataTransfer(); data.items.add(new File([new Uint8Array(bytes)], name));
    input.files = data.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { name, bytes: Array.from(bytes) });
  await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: join(temp, 'downloads') });
  const submit = async selector => page.eval(selector => document.querySelector(selector).requestSubmit(), selector);
  const editorClick = async label => { await page.eval(label => {
    const button = [...document.querySelectorAll('.markdown-editor button')].find(b => (b.getAttribute('aria-label') || b.innerText).startsWith(label));
    if (!button || button.disabled) throw new Error('Editor tool unavailable: ' + label);
    button.click();
  }, label); await sleep(80); };
  const checkCompactEditor = async context => {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewport({ width, height: 900, mobile: width < 640 });
      const geometry = await page.eval(() => {
        const toolbar = document.querySelector('.editor-toolbar');
        const tools = toolbar.querySelector('.editor-tools');
        const buttons = [...tools.querySelectorAll('button')].map(b => b.getBoundingClientRect());
        const tabs = [...toolbar.querySelectorAll('[role=tab]')].map(b => b.getBoundingClientRect());
        return { height: toolbar.getBoundingClientRect().height, rowTops: buttons.map(r => r.top), centers: [...buttons, ...tabs].map(r => r.top + r.height / 2), scrolls: tools.scrollWidth > tools.clientWidth, pageFits: document.documentElement.scrollWidth <= innerWidth };
      });
      assert.ok(Math.max(...geometry.rowTops) - Math.min(...geometry.rowTops) < 1, context + ': tools stay in one row at ' + width);
      assert.ok(Math.max(...geometry.centers) - Math.min(...geometry.centers) < 7, context + ': tabs stay beside the tools');
      assert.ok(geometry.height <= 76, context + ': compact toolbar height');
      assert.ok(geometry.pageFits, context + ': no horizontal page overflow');
      if (width <= 390) assert.ok(geometry.scrolls, context + ': tools scroll locally on phones');
      if (geometry.scrolls) {
        await page.eval(() => document.querySelector('.editor-tools button:not(:disabled)').focus());
        await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'End', code: 'End', windowsVirtualKeyCode: 35 });
        await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'End', code: 'End', windowsVirtualKeyCode: 35 });
        const focused = await page.eval(() => {
          const tools = document.querySelector('.editor-tools');
          const area = tools.getBoundingClientRect(), target = document.activeElement.getBoundingClientRect();
          return { scroll: tools.scrollLeft, visible: target.left >= area.left && target.right <= area.right + 1 };
        });
        assert.ok(focused.scroll > 0 && focused.visible, context + ': keyboard reveals offscreen tools');
      }
      if (width === 390 || width === 1440) await page.screenshot({ path: join(output, `compact-${context}-${width}.jpg`) });
    }
  };
  const checkIconActions = async () => {
    const failures = await page.eval(() => [...document.querySelectorAll('.icon-button')].flatMap(button => {
      if (!button.getClientRects().length) return [];
      const label = button.getAttribute('aria-label');
      const icon = button.querySelector('svg[aria-hidden="true"]');
      return label && label.trim() && button.title && icon ? [] : [button.outerHTML.slice(0, 220)];
    }));
    assert.deepEqual(failures, [], 'icon actions have an accessible name, tooltip and decorative SVG');
  };
  const checkControlRow = async selector => {
    const result = await page.eval(selector => {
      const row = document.querySelector(selector);
      if (!row) throw new Error('Missing control row ' + selector);
      const controls = [...row.querySelectorAll('button,a')].map(el => el.getBoundingClientRect());
      return { centers: controls.map(r => r.top + r.height / 2), singleLabels: [...row.querySelectorAll('a')].every(a => a.getBoundingClientRect().height < 55), pageFits: document.documentElement.scrollWidth <= innerWidth };
    }, selector);
    assert.ok(Math.max(...result.centers) - Math.min(...result.centers) < 2, selector + ': controls do not wrap');
    assert.ok(result.singleLabels, selector + ': labels do not wrap');
    assert.ok(result.pageFits, selector + ': no page overflow');
  };
  const checkAttachmentTool = async label => {
    await page.eval(() => {
      window.editorFileClicks = 0;
      document.querySelector('input[type=file]').addEventListener('click', event => { event.preventDefault(); window.editorFileClicks++; }, { once: true });
    });
    await editorClick(label);
    assert.equal(await page.eval(() => window.editorFileClicks), 1, 'paperclip opens the file picker');
  };

  await authenticate(alice);
  await page.goto(`${origin}/inbox?to=${bob.username}`);
  await waitFor(() => page.eval(() => !!document.querySelector('input[name=username]')), 'inbox form');
  await submit('form:has(input[name=username])');
  await waitFor(() => page.eval(() => /\/inbox\/\d+$/.test(location.pathname)), 'open DM');
  const conversationPath = await page.eval(() => location.pathname);
  await page.goto(`${origin}/dm`);
  await waitFor(() => page.eval(() => location.pathname === '/inbox'), 'legacy inbox redirect');
  await page.goto(`${origin}/dm/${bob.username}`);
  await waitFor(() => page.eval(path => location.pathname === path, conversationPath), 'legacy conversation redirect');
  await checkCompactEditor('direct');
  await fill('textarea[name=content]', '格式测试');
  await page.eval(() => { const el = document.querySelector('textarea[name=content]'); el.focus(); el.setSelectionRange(0, 4); });
  await editorClick('加粗');
  assert.deepEqual(await page.eval(() => { const el = document.querySelector('textarea'); return [el.value, el.selectionStart, el.selectionEnd]; }), ['**格式测试**', 2, 6]);
  await editorClick('撤销'); assert.equal(await page.eval(() => document.querySelector('textarea').value), '格式测试');
  await editorClick('重做'); assert.equal(await page.eval(() => document.querySelector('textarea').value), '**格式测试**');
  await page.eval(() => document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })));
  await sleep(80); assert.equal(await page.eval(() => document.querySelector('textarea').value), '格式测试');
  await fill('textarea[name=content]', ''); await editorClick('无序列表');
  assert.deepEqual(await page.eval(() => { const el = document.querySelector('textarea'); return [el.value, el.selectionStart, el.selectionEnd]; }), ['- ', 2, 2]);
  await page.send('Input.insertText', { text: '列表内容' });
  assert.equal(await page.eval(() => document.querySelector('textarea').value), '- 列表内容');
  await fill('textarea[name=content]', ''); await editorClick('行内公式');
  assert.equal(await page.eval(() => document.querySelector('textarea').value), '$x^2 + y^2 = r^2$');
  await editorClick('预览排版');
  assert.equal(await page.eval(() => document.querySelectorAll('.editor-rendered .katex').length), 1);
  await editorClick('编辑');
  await editorClick('插入表情');
  await page.eval(() => document.querySelector('.editor-emoji-menu button').click()); await sleep(80);
  assert.equal(await page.eval(() => document.querySelector('textarea').value), '$😀$');
  assert.equal(await page.eval(() => document.querySelector('.editor-emoji-menu')), null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM direct_messages').get().n, 0, 'formatting never submits');
  await checkAttachmentTool('上传文件');
  completed.push('Editor selection formatting, keyboard shortcut, undo/redo, formula preview, controlled emoji insertion and paperclip picker');

  await fill('textarea[name=content]', '代开发票'); await submit('form.message-composer');
  await waitFor(() => page.eval(() => document.body.innerText.includes('敏感词')), 'DM moderation');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM direct_messages').get().n, 0);
  await fill('textarea[name=content]', '**私信测试** $x^2$\n\n[数学资料](https://mathworld.wolfram.com/)');
  await checkIconActions();
  await page.eval(() => document.querySelector('.message-composer button[aria-label="发送消息"]').click());
  await waitFor(() => page.eval(() => document.querySelectorAll('.chat-message').length === 1), 'send DM');
  assert.equal(await page.eval(() => document.querySelector('textarea[name=content]').value), '');
  assert.equal(await page.eval(() => document.querySelectorAll('.chat-message .katex').length), 1);
  assert.equal(await page.eval(() => document.querySelectorAll('.chat-message .link-card').length), 1);
  await page.screenshot({ path: join(output, 'dm-desktop.jpg') });
  completed.push('DM creation, send, draft reset, Markdown/math/link card');
  const firstDmAt = Date.now();
  await fill('textarea[name=content]', '冷却期间的消息'); await submit('form.message-composer');
  await waitFor(() => page.eval(() => document.body.innerText.includes('私信发送过于频繁')), 'DM cooldown');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM direct_messages').get().n, 1);
  assert.equal(await page.eval(() => document.querySelector('textarea').value), '冷却期间的消息');
  const outsiderToken = await authenticate(outsider);
  const forbidden = await fetch(origin + conversationPath, { headers: { Cookie: `hsfz_session=${outsiderToken}` } });
  // With a loading boundary Next.js can stream the not-found state with HTTP 200.
  assert.ok([200, 404].includes(forbidden.status));
  const denied = await forbidden.text();
  assert.ok(denied.includes('404'));
  assert.ok(!denied.includes('私信测试'));
  completed.push('Nonparticipant sees not-found and no private message text');
  await authenticate(bob);
  await page.goto(`${origin}/inbox`);
  assert.ok(await page.eval(() => document.body.innerText.includes('1 条未读')));
  await page.goto(origin + conversationPath);
  await waitFor(() => {
    const c = db.prepare('SELECT id FROM direct_conversations').get();
    return !!db.prepare('SELECT 1 FROM direct_reads WHERE user_id = ? AND conversation_id = ?').get(bob.id, c.id);
  }, 'mark read');
  await fill('textarea[name=content]', '收到，一起讨论。'); await submit('form.message-composer');
  await waitFor(() => page.eval(() => document.querySelectorAll('.chat-message').length === 2), 'reply DM');
  completed.push('Recipient unread count, read receipt and reply');
  const aliceToken = await authenticate(alice);
  await page.goto(origin + conversationPath);
  await page.eval(() => {
    const input = document.querySelector('.message-composer input[type=file]');
    const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'too-big.bin'));
    input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await waitFor(() => page.eval(() => document.body.innerText.includes('原始文件不能超过 10 MB')), 'browser size limit');
  const transferBytes = Buffer.from('浏览器压缩与解压\0'.repeat(6000));
  await chooseFile('华附资料.txt', transferBytes);
  await sleep(Math.max(1, 15100 - (Date.now() - firstDmAt)));
  await submit('form.message-composer');
  await waitFor(() => page.eval(() => document.querySelectorAll('.chat-attachment').length === 1), 'DM file-only send');
  const directFile = db.prepare('SELECT * FROM chat_attachments').get();
  assert.deepEqual(gunzipSync(directFile.payload), transferBytes);
  assert.ok(directFile.compressed_size < transferBytes.length / 10);
  assert.equal(await page.eval(() => document.querySelector('input[type=file]').files.length), 0);
  const privateFile = await fetch(`${origin}/api/attachments/${directFile.id}`, { headers: { Cookie: `hsfz_session=${outsiderToken}` } });
  assert.equal(privateFile.status, 404);
  const compressedResponse = await fetch(`${origin}/api/attachments/${directFile.id}`, { headers: { Cookie: `hsfz_session=${aliceToken}` } });
  assert.equal(compressedResponse.status, 200);
  assert.ok(compressedResponse.headers.get('cache-control').includes('no-store'));
  assert.equal(compressedResponse.headers.get('content-encoding'), null);
  assert.deepEqual(Buffer.from(await compressedResponse.arrayBuffer()), directFile.payload);
  await page.eval(() => document.querySelector('.chat-attachment button').click());
  await waitFor(() => existsSync(join(temp, 'downloads', '华附资料.txt')), 'browser decompresses and downloads original');
  assert.deepEqual(readFileSync(join(temp, 'downloads', '华附资料.txt')), transferBytes);
  await page.screenshot({ path: join(output, 'dm-file-desktop.jpg') });
  db.prepare('UPDATE chat_attachments SET expires_at = ? WHERE id = ?').run(Date.now() - 1, directFile.id);
  const expiredDownload = await fetch(`${origin}/api/attachments/${directFile.id}`, { headers: { Cookie: `hsfz_session=${aliceToken}` } });
  assert.equal(expiredDownload.status, 410);
  await page.eval(() => document.querySelector('.chat-attachment button').click());
  await waitFor(() => page.eval(() => document.body.innerText.includes('文件已过期')), 'expired attachment feedback');
  assert.equal(db.prepare('SELECT 1 FROM chat_attachments WHERE id = ?').get(directFile.id), undefined);
  completed.push('DM file size limit, browser gzip upload, private compressed download, browser decompression, exact byte/filename restoration and expiry');
  await page.eval(() => document.querySelector('button[aria-label="拉黑"]').click());
  await waitFor(() => page.eval(() => !!document.querySelector('button[aria-label="取消拉黑"]') && !document.querySelector('.message-composer')), 'block DM');
  await checkIconActions();
  await page.setViewport({ width: 390, height: 844, mobile: true });
  assert.ok(await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: join(output, 'blocked-dm-mobile.jpg') });
  await authenticate(bob); await page.goto(origin + conversationPath);
  assert.equal(await page.eval(() => !!document.querySelector('.message-composer')), false);
  assert.equal(await page.eval(() => !!document.querySelector('button[aria-label="拉黑"]')), true, "recipient cannot remove another user's block");
  await authenticate(alice); await page.goto(origin + conversationPath);
  await page.eval(() => document.querySelector('button[aria-label="取消拉黑"]').click());
  await waitFor(() => page.eval(() => !!document.querySelector('.message-composer')), 'unblock DM');
  await page.goto(`${origin}/u/${bob.username}`);
  await page.eval(() => document.querySelector('button[aria-label="关注"]').click());
  await waitFor(() => page.eval(() => !!document.querySelector('button[aria-label="取消关注"]')), 'follow');
  assert.ok(db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(alice.id, bob.id));
  assert.ok(db.prepare("SELECT 1 FROM notifications WHERE type = 'follow' AND user_id = ? AND actor_id = ?").get(bob.id, alice.id));
  await checkIconActions();
  assert.ok(await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: join(output, 'follow-profile-mobile.jpg') });
  await page.eval(() => document.querySelector('button[aria-label="取消关注"]').click());
  await waitFor(() => page.eval(() => !!document.querySelector('button[aria-label="关注"]')), 'unfollow');
  assert.equal(db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(alice.id, bob.id), undefined);
  await page.setViewport({ width: 1440, height: 900, mobile: false });
  completed.push('Upstream sensitive-word rejection, 15-second DM cooldown, bidirectional blocking/unblocking, follow/unfollow and follow notifications');
  await page.goto(`${origin}/groups/new`);
  await fill('input[name=name]', '华附数学讨论'); await fill('textarea[name=description]', '一起研究有趣的问题，分享解题思路。');
  await submit('form:has(input[name=name])');
  await waitFor(() => page.eval(() => /\/groups\/\d+$/.test(location.pathname)), 'create group');
  const groupPath = await page.eval(() => location.pathname);
  await checkCompactEditor('group');
  await fill('textarea[name=content]', '小组内部消息：欢迎同学们。'); await submit('form.message-composer');
  await waitFor(() => page.eval(() => document.querySelectorAll('.chat-message').length === 1), 'group send');
  await authenticate(bob); await page.goto(origin + groupPath);
  assert.ok(!(await page.eval(() => document.body.innerText)).includes('小组内部消息'));
  assert.equal(await page.eval(() => document.querySelectorAll('.member-list li').length), 0);
  await submit('form:has(input[name=operation])');
  await waitFor(() => page.eval(() => document.querySelectorAll('.chat-message').length === 1), 'join group');
  assert.equal(await page.eval(() => document.querySelectorAll('.member-list li').length), 2);
  await fill('textarea[name=content]', '一起学习！'); await submit('form.message-composer');
  await waitFor(() => page.eval(() => document.querySelectorAll('.chat-message').length === 2), 'member group send');
  await page.screenshot({ path: join(output, 'group-desktop.jpg') });
  await page.setViewport({ width: 390, height: 844, mobile: true });
  await page.screenshot({ path: join(output, 'group-mobile.jpg') });
  assert.equal(await page.eval(() => document.documentElement.scrollWidth <= innerWidth), true);
  await checkAttachmentTool('上传文件');
  await chooseFile('小组笔记.txt', Buffer.from('小组文件原始内容'));
  await submit('form.message-composer');
  await waitFor(() => page.eval(() => document.querySelectorAll('.chat-attachment').length === 1), 'group file-only send');
  const groupFile = db.prepare('SELECT * FROM chat_attachments ORDER BY expires_at DESC LIMIT 1').get();
  assert.deepEqual(gunzipSync(groupFile.payload), Buffer.from('小组文件原始内容'));
  await page.screenshot({ path: join(output, 'group-file-mobile.jpg') });
  await page.eval(() => document.querySelector('.chat-attachment button').click());
  await waitFor(() => existsSync(join(temp, 'downloads', '小组笔记.txt')), 'group browser download');
  assert.equal(readFileSync(join(temp, 'downloads', '小组笔记.txt'), 'utf8'), '小组文件原始内容');
  const bobToken = await authenticate(bob);
  await submit('form:has(input[name=operation])');
  await waitFor(() => page.eval(() => document.querySelectorAll('.chat-message').length === 0), 'leave group');
  const revoked = await fetch(`${origin}/api/attachments/${groupFile.id}`, { headers: { Cookie: `hsfz_session=${bobToken}` } });
  assert.equal(revoked.status, 404);
  completed.push('Group browser file upload/download and immediate download revocation on leaving');
  completed.push('Create/join/chat/leave group, member-only history and member list, phone layout');
  await page.goto(`${origin}/groups`);
  await page.screenshot({ path: join(output, 'groups-mobile.jpg') });
  await page.eval(() => document.querySelector('.mobile-menu summary').click());
  assert.equal(await page.eval(() => getComputedStyle(document.querySelector('.mobile-menu-body')).display !== 'none'), true);
  await page.eval(() => document.querySelector('.theme-toggle').click());
  assert.equal(await page.eval(() => document.documentElement.classList.contains('dark')), true);
  await sleep(250);
  await page.screenshot({ path: join(output, 'menu-dark-mobile.jpg') });
  await page.eval(() => document.querySelector('.theme-toggle').click());
  await page.eval(() => document.querySelector('.mobile-menu-body a[href="/"]').click());
  await waitFor(() => page.eval(() => location.pathname === '/'), 'mobile navigation');
  assert.equal(await page.eval(() => document.querySelector('.mobile-menu').open), false);
  completed.push('Mobile menu, navigation closes the menu, and dark-theme toggle');
  await page.setViewport({ width: 1440, height: 900, mobile: false });
  await page.goto(`${origin}/new?board=study`);
  // Select the unlocked 学习互助 board from the existing database.
  const board = db.prepare("SELECT id, category FROM boards WHERE slug = 'study'").get();
  await page.eval(({ category }) => {
    const selects = document.querySelectorAll('main select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(selects[0], category);
    selects[0].dispatchEvent(new Event('change', { bubbles: true }));
  }, { id: board.id, category: board.category });
  await sleep(200);
  await page.eval(id => { const el = document.querySelector('select[name=board_id]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,String(id)); el.dispatchEvent(new Event('change',{bubbles:true})); }, board.id);
  await checkCompactEditor('new-thread');
  await fill('input[name=title]', '排版验证：数学与链接');
  await editorClick('预览排版');
  await submit('main form:has(input[name=title])'); await sleep(100);
  assert.equal(await page.eval(() => document.querySelector('textarea').closest('[role=tabpanel]').hidden), false, 'empty preview returns to required source field');
  await checkAttachmentTool('上传图片');
  await page.eval(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lDEAAAAASUVORK5CYII='), c => c.charCodeAt(0))], 'editor-test.png', { type: 'image/png' }));
    const el = document.querySelector('input[type=file]'); el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await waitFor(() => page.eval(() => !!document.querySelector('img[alt="图片 1"]')), 'toolbar image attachment preview');
  await fill('textarea[name=content]', '  ');
  await submit('main form:has(input[name=title])');
  await waitFor(() => page.eval(() => document.body.innerText.includes('正文太短')), 'server validation error');
  assert.equal(await page.eval(() => document.querySelector('textarea').value), '  ', 'failed sends preserve editor draft');
  assert.equal(await page.eval(() => document.querySelector('input[name=title]').value), '排版验证：数学与链接', 'failed posts preserve title');
  assert.equal(await page.eval(() => new FormData(document.querySelector('main form:has(input[name=title])')).getAll('images').filter(f => f instanceof File && f.size > 0).length), 1, 'image retry matches visible preview');
  await page.eval(() => document.querySelector('button[aria-label="移除图片"]').click());
  assert.equal(await page.eval(() => document.querySelector('input[type=file]').files.length), 0);

  await fill('textarea[name=content]', '# 数学交流\n\n**加粗文字**与行内公式 $a^2+b^2=c^2$。\n\n$$\n\\sum_{i=1}^{n}i=\\frac{n(n+1)}{2}\n$$\n\n| 科目 | 进度 |\n|---|---|\n| 数学 | 讨论中 |\n\n[数学资料](https://mathworld.wolfram.com/)');
  await editorClick('预览排版');
  assert.equal(await page.eval(() => document.querySelectorAll('.preview-body .katex').length), 2);
  await editorClick('编辑');
  await fill('textarea[name=content]', '**预览同步** $x^3$');
  await editorClick('预览排版');
  assert.equal(await page.eval(() => document.querySelector('.preview-body strong').innerText), '预览同步');
  assert.equal(await page.eval(() => document.querySelectorAll('.preview-body .katex').length), 1);
  await page.screenshot({ path: join(output, 'editor-preview-desktop.jpg') });
  await editorClick('编辑');
  await fill('textarea[name=content]', '# 数学交流\n\n**加粗文字**与行内公式 $a^2+b^2=c^2$。\n\n$$\n\\sum_{i=1}^{n}i=\\frac{n(n+1)}{2}\n$$\n\n| 科目 | 进度 |\n|---|---|\n| 数学 | 讨论中 |\n\n[数学资料](https://mathworld.wolfram.com/)');
  await editorClick('预览排版');
  await submit('main form:has(input[name=title])');
  await waitFor(() => page.eval(() => /\/t\/\d+$/.test(location.pathname)), 'post thread');
  assert.equal(await page.eval(() => document.querySelectorAll('article .katex').length), 2);
  assert.equal(await page.eval(() => document.querySelectorAll('article .link-card').length), 1);
  await checkIconActions();
  await page.eval(() => document.querySelector('article button[aria-label^="点赞"]').click());
  await waitFor(() => page.eval(() => !!document.querySelector('article button[aria-label^="取消点赞"][aria-pressed="true"]')), 'icon like updates state and accessible action');
  await page.eval(() => document.querySelector('article button[aria-label="收藏"]').click());
  await waitFor(() => page.eval(() => !!document.querySelector('article button[aria-label="取消收藏"][aria-pressed="true"]')), 'icon favorite updates state');
  await page.eval(() => document.querySelector('article button[aria-label="删除"]').click()); await sleep(100);
  assert.ok(await page.eval(() => !!document.querySelector('article button[aria-label^="确认删除"]')), 'destructive icon requires explicit second confirmation');
  assert.ok(db.prepare('SELECT id FROM threads WHERE title = ?').get('排版验证：数学与链接'), 'first delete click never submits');

  assert.equal(await page.eval(() => document.querySelectorAll('h1').length), 1);
  await page.screenshot({ path: join(output, 'thread-desktop.jpg') });
  await checkCompactEditor('reply');
  await fill('textarea[name=content]', '回复也支持 **Markdown** 和 $E=mc^2$。');
  await submit('#reply-form');
  await waitFor(() => page.eval(() => document.querySelectorAll('#replies .katex').length === 1), 'reply with math');
  assert.equal(await page.eval(() => document.querySelector('#reply-content').value), '');
  await page.setViewport({ width: 390, height: 844, mobile: true });
  await page.screenshot({ path: join(output, 'thread-mobile.jpg') });
  assert.equal(await page.eval(() => document.documentElement.scrollWidth <= innerWidth), true);
  completed.push('Thread preview, publishing, GFM table, inline/display math, external link cards and replies');
  const routes = ['/', '/boards', '/groups', '/inbox', '/messages', '/settings', `/u/${alice.username}`, '/b/study', '/search?q=数学', '/admin'];
  for (const route of routes) { const response = await fetch(origin + route, { redirect: 'manual', headers: { Cookie: `hsfz_session=${outsiderToken}` } }); assert.ok([200,307].includes(response.status), route + ': ' + response.status); }
  completed.push('Existing board, search, profile, notifications/tickets, settings and admin-guard routes');
  const postedPath = await page.eval(() => location.pathname);
  const admin = db.prepare("SELECT id, username FROM users WHERE role = 'admin' LIMIT 1").get();
  await authenticate(admin);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewport({ width, height: 900, mobile: width < 640 });
    await page.goto(origin + postedPath);
    await checkControlRow('[aria-label="帖子操作"]');
    await page.goto(`${origin}/admin?tab=tickets`);
    await checkControlRow('[aria-label="管理功能"]');
    await checkIconActions();
    await checkControlRow('[aria-label="工单状态"]');
    if (width === 320) {
      await page.eval(() => document.querySelector('[aria-label="管理功能"] a:last-child').focus());
      assert.ok(await page.eval(() => {
        const row = document.querySelector('[aria-label="管理功能"]');
        const control = document.activeElement.getBoundingClientRect(), area = row.getBoundingClientRect();
        return control.left >= area.left && control.right <= area.right + 1;
      }), 'admin tabs fully reveal the focused item');
      await page.screenshot({ path: join(output, 'compact-admin-320.jpg') });
    }
    await page.goto(`${origin}/u/${admin.username}`);
    await checkControlRow('[aria-label="个人主页内容"]');
    await page.goto(origin);
    await checkControlRow('[aria-label="帖子排序"]');
  }
  completed.push('Single-line editor tools and pinned preview at 320/390/768/1440px, local scrolling, keyboard reachability, compact admin/profile/feed tabs and thread moderation controls');
  for (const route of ['/settings', '/groups/new', '/inbox', '/search?q=数学']) {
    await page.goto(origin + route); await checkIconActions();
  }
  await page.send('Network.deleteCookies', { name: 'hsfz_session', url: origin });
  await page.goto(origin);
  assert.ok(await page.eval(() => document.body.innerText.includes('站务公告')));
  assert.equal(await page.eval(() => document.body.innerText.includes('排版验证：数学与链接')), false);
  assert.equal(await page.eval(() => !!document.querySelector('[aria-label="帖子排序"]')), false);
  const guestBoard = await fetch(`${origin}/b/study`, { redirect: 'manual' });
  assert.equal(guestBoard.status, 307);
  assert.equal((await fetch(`${origin}/b/announcements`)).status, 200);
  completed.push('Guest home shows public announcements and hides private topics; private boards require login');
  for (const route of ['/login', '/register', '/forgot']) {
    await page.goto(origin + route); await checkIconActions();
    assert.ok(await page.eval(() => !!document.querySelector('button[type=submit] svg[data-action-icon]')), route + ': icon submit');
    if (route === '/login') await page.screenshot({ path: join(output, 'icon-login-desktop.jpg') });
  }
  completed.push('Named icon actions/tooltips across settings, chats, groups, search and auth; native send, like/favorite state changes and two-step destructive confirmation');
  assert.equal(page.consoleErrors.length, 0, JSON.stringify(page.consoleErrors));
  writeFileSync(join(output, 'results.json'), JSON.stringify({ completed, errors: page.consoleErrors }, null, 2));
  console.log(JSON.stringify({ passed: completed.length, completed }, null, 2));
} catch (error) { console.error(error); if (browser) console.error('Browser flow failed; server tail:', serverLog.slice(-2000)); process.exitCode = 1; }
finally { if (browser) await browser.close(); if (db) db.close(); server.kill('SIGTERM'); await sleep(300); rmSync(temp, { recursive: true, force: true }); }
