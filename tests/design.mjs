// Visual QA on isolated data. Requires the repository's design-taste-frontend skill and Chrome.
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import { gzipSync } from 'node:zlib';
const temp = mkdtempSync(join(tmpdir(), 'hsfz-design-'));
const origin = 'http://localhost:3103';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','-p','3103'], { env: { ...process.env, HSFZ_DATA_DIR: temp }, stdio: 'ignore' });
const pause = ms => new Promise(r => setTimeout(r, ms));
let db, proxy;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(origin)).ok) break; } catch {} await pause(150); }
  db = new Database(join(temp, 'bbs.db'));
  const user = db.prepare("SELECT id FROM users WHERE username='chen2026'").get().id;
  const friend = db.prepare("SELECT id FROM users WHERE username='su2027'").get().id;
  if (process.argv.includes('--icons')) db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user);
  if (process.argv.includes('--recommendations') || process.argv.includes('--bge')) db.prepare('INSERT OR REPLACE INTO user_experiments(user_id,recommendations_enabled) VALUES(?,1)').run(user);
  const token = randomBytes(32).toString('hex');
  db.prepare("INSERT INTO sessions(token,user_id,created_at) VALUES (?,?,datetime('now'))").run(token,user);
  const group = Number(db.prepare("INSERT INTO community_groups(name,description,owner_id,created_at) VALUES ('华附数学讨论','一起研究有趣的问题，分享解题思路。',?,datetime('now'))").run(user).lastInsertRowid);
  for (const id of [user,friend]) db.prepare("INSERT INTO group_members(group_id,user_id,joined_at) VALUES (?,?,datetime('now'))").run(group,id);
  for (const [id, content] of [[user,'这周一起聊聊数列与极限。'],[friend,'周五放学图书馆见，带上你的解题思路。']]) db.prepare("INSERT INTO group_messages(group_id,sender_id,content,created_at) VALUES (?,?,?,datetime('now'))").run(group,id,content);
  const conversation = Number(db.prepare("INSERT INTO direct_conversations(user_low,user_high,created_at) VALUES (?,?,datetime('now'))").run(Math.min(user,friend),Math.max(user,friend)).lastInsertRowid);
  for (const [id, content] of [[friend,'你好，看到你分享的解题思路了，可以一起讨论吗？'],[user,'当然可以，周五图书馆见。']]) db.prepare("INSERT INTO direct_messages(conversation_id,sender_id,content,created_at) VALUES (?,?,?,datetime('now'))").run(conversation,id,content);
  const board = db.prepare("SELECT id FROM boards WHERE slug='study'").get().id;
  const thread = Number(db.prepare("INSERT INTO threads(board_id,author_id,title,content,created_at,last_reply_at) VALUES (?,?,?,?,datetime('now'),datetime('now'))").run(board,user,'数列的另一种解法', '**讨论题**：如何求前 $n$ 项和？\n\n$$\n\\sum_{i=1}^{n}i=\\frac{n(n+1)}{2}\n$$\n\n[数学资料](https://mathworld.wolfram.com/)').lastInsertRowid);
  if (process.argv.includes('--attachments')) {
    for (const [kind, chatId, filename] of [['direct', conversation, '解题思路.txt'], ['group', group, '周五讨论提纲.txt']]) {
      const bytes = Buffer.from('数学讨论与学习资料。'.repeat(1000));
      const payload = gzipSync(bytes), id = randomBytes(16).toString('hex');
      db.prepare('INSERT INTO chat_attachments(id,filename,original_size,compressed_size,expires_at,payload) VALUES (?,?,?,?,?,?)').run(id,filename,bytes.length,payload.length,Date.now()+600000,payload);
      db.prepare(`INSERT INTO ${kind === 'direct' ? 'direct_messages' : 'group_messages'}(${kind === 'direct' ? 'conversation_id' : 'group_id'},sender_id,content,created_at,attachment_id) VALUES (?,?,'',datetime('now'),?)`).run(chatId,user,id);
    }
  }
  proxy = createServer((req,res) => {
    const upstream = request(origin + req.url, { method:req.method, headers:{ ...req.headers, host:'localhost:3103', cookie:`hsfz_session=${token}` } }, incoming => { res.writeHead(incoming.statusCode,incoming.headers); incoming.pipe(res); });
    upstream.on('error', () => { res.writeHead(502);res.end(); }); req.pipe(upstream);
  });
  await new Promise(r=>proxy.listen(3104,'127.0.0.1',r));
  const targets = process.argv.includes('--bge')
    ? [['bge-experimental','/experimental'], ['bge-home','/'], ['bge-new','/new?board=study']]
    : process.argv.includes('--recommendations')
    ? [['recommendations-home','/'], ['recommendations-new','/new?board=study']]
    : process.argv.includes('--sync')
    ? [['sync-home', '/'], ['sync-profile', '/u/su2027'], ['sync-direct', `/inbox/${conversation}`]]
    : process.argv.includes('--icons')
    ? [['icons-group', `/groups/${group}`], ['icons-thread', `/t/${thread}#reply-form`], ['icons-admin', '/admin?tab=threads'], ['icons-settings', '/settings']]
    : process.argv.includes('--editor')
    ? [['editor-direct', `/inbox/${conversation}`], ['editor-group', `/groups/${group}`], ['editor-thread', `/t/${thread}#reply-form`], ['editor-new', '/new?board=study']]
    : process.argv.includes('--attachments')
    ? [['files-direct', `/inbox/${conversation}`], ['files-group', `/groups/${group}`]]
    : [['home','/'], ['groups','/groups'], ['inbox','/inbox'], ['group',`/groups/${group}`], ['thread',`/t/${thread}`]];
  let failed = false;
  for (const [name,route] of targets) {
    console.log(`Inspecting ${name}`);
    const out = resolve(`.taste-skill/final-${name}`);mkdirSync(out,{recursive:true});
    const child = spawn(process.execPath,['.agents/skills/design-taste-frontend/scripts/inspect.mjs','--app',`http://127.0.0.1:3104${route}`,'--out',out,...((name === 'thread' || name === 'editor-thread' || name === 'icons-thread') ? ['--allow','font-count,font-fallback'] : [])],{stdio:'inherit'});
    const code = await new Promise(r=>child.on('close',r));
    if(code) failed=true;
  }
  if(failed) process.exitCode=1;
} finally { if(proxy) { proxy.closeAllConnections();await new Promise(r=>proxy.close(r)); } if(db) db.close();server.kill('SIGTERM');await pause(200);rmSync(temp,{recursive:true,force:true}); }
