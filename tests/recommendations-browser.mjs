import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {spawn} from 'node:child_process';import {randomBytes} from 'node:crypto';
import Database from 'better-sqlite3';import * as sqliteVec from 'sqlite-vec';
import {Browser,sleep} from '../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
const temp=mkdtempSync(join(tmpdir(),'hsfz-rec-browser-')),origin='http://localhost:3105';
const out=resolve('.taste-skill/recommendations');mkdirSync(out,{recursive:true});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3105'],{env:{...process.env,HSFZ_DATA_DIR:temp},stdio:'pipe'});
let log='',browser,db;server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
const passed=[];
try{
 for(let i=0;i<80;i++){try{if((await fetch(origin)).ok)break}catch{}await sleep(200)}
 db=new Database(join(temp,'bbs.db'));sqliteVec.load(db);
 const alice=db.prepare("SELECT id,username FROM users WHERE username='chen2026'").get();
 const bob=db.prepare("SELECT id,username FROM users WHERE username='su2027'").get();
 browser=await Browser.launch();const page=await browser.newPage({width:1440,height:900});
 const requests=[];
 browser.on(page.sessionId,'Target.attachedToTarget',async({sessionId})=>{
   browser.on(sessionId,'Network.requestWillBeSent',p=>requests.push(p.request.url));
   await browser.send('Network.enable',{},sessionId);
   await browser.send('Runtime.runIfWaitingForDebugger',{},sessionId);
 });
 await page.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true});
 await page.send('Network.enable');browser.on(page.sessionId,'Network.requestWillBeSent',p=>requests.push(p.request.url));
 const token=randomBytes(32).toString('hex');db.prepare("INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,datetime('now'))").run(token,alice.id);
 await page.send('Network.setCookie',{name:'hsfz_session',value:token,url:origin,httpOnly:true,sameSite:'Lax'});
 const wait=async(fn,label)=>{for(let i=0;i<100;i++){if(await fn())return;await sleep(150)}throw new Error('Timeout '+label)};
 const cookie={Cookie:`hsfz_session=${token}`};
 const modelResponse=await fetch(origin+'/models/bge-small-zh-v1.5-q4-v1/onnx/model_q4.onnx',{method:'HEAD'});
 assert.equal(modelResponse.status,200);assert.ok(Number(modelResponse.headers.get('content-length'))<20_000_000);
 assert.ok(modelResponse.headers.get('cache-control').includes('immutable'));
 assert.equal((await fetch(origin+'/api/recommendations')).status,401);

 await page.goto(origin);
 assert.equal(await page.eval(()=>!!document.querySelector('.recommended-feed')),false);
 assert.equal((await fetch(origin+'/api/recommendations',{headers:cookie})).status,403);
 await page.goto(origin+'/experimental');
 for (const width of [320,390,768,1440]) {
  await page.setViewport({width,height:900,mobile:width<640});
  const switchSize=await page.eval(()=>{
   const button=document.querySelector('button[role="switch"]');button.focus();
   const target=button.getBoundingClientRect(),track=button.querySelector('.experiment-switch-track').getBoundingClientRect();
   return {width:target.width,height:target.height,trackWidth:track.width,trackHeight:track.height,focused:document.activeElement===button,outline:getComputedStyle(button).outlineStyle,fits:document.documentElement.scrollWidth<=innerWidth};
  });
  assert.ok(switchSize.width>=60&&switchSize.height>=44&&switchSize.trackWidth>=52&&switchSize.trackHeight>=30);
  assert.ok(switchSize.focused&&switchSize.outline!=='none'&&switchSize.fits);
 }
 await page.setViewport({width:390,height:360,mobile:true});
 await page.eval(()=>document.querySelector('.mobile-menu summary').click());
 assert.ok(await page.eval(()=>{
   const menu=document.querySelector('.mobile-menu-body');return menu.getBoundingClientRect().bottom<=innerHeight+1&&getComputedStyle(menu).overflowY==='auto';
 }),'expanded menu scrolls within a short viewport');
 await page.eval(()=>document.querySelector('.mobile-menu summary').click());
 await page.setViewport({width:1440,height:900,mobile:false});
 assert.ok(await page.eval(()=>!!document.querySelector('nav[aria-label="主导航"] a[href="/experimental"]')));
 await page.eval(()=>document.querySelector('button[role="switch"]').click());
 await wait(()=>page.eval(()=>document.querySelector('button[role="switch"]').getAttribute('aria-checked')==='true'),'enable experiment');
 assert.equal((await fetch(origin+'/api/recommendations?recent=invalid',{headers:cookie})).status,400);
 await page.goto(origin);await wait(()=>page.eval(()=>!!document.querySelector('.recommendation-row')),'ranked feed');
 assert.equal(requests.some(url=>url.includes('encoder.js')||url.endsWith('.onnx')||url.endsWith('.wasm')),false,'browsing does not load the encoder');
 for(const width of [320,390,768,1440]){
  await page.setViewport({width,height:900,mobile:width<640});
  assert.ok(await page.eval(()=>document.documentElement.scrollWidth<=innerWidth));
  if(width!==320)await page.screenshot({path:join(out,`feed-${width}.jpg`)});
 }
 await page.eval(()=>document.querySelector('button[aria-label="推荐偏好"]').click());
 await page.eval(()=>document.querySelector('.recommendation-sections input').click());
 assert.ok(await page.eval(()=>Object.keys(localStorage).some(key=>key.startsWith('hsfz-recommendations:'))));
 const hiddenId=await page.eval(()=>Number(document.querySelector('.recommendation-row a.thread-title').getAttribute('href').split('/').at(-1)));
 await page.eval(()=>document.querySelector('.recommendation-dismiss button').click());
 assert.equal(await page.eval(id=>!!document.querySelector(`.recommendation-row a[href="/t/${id}"]`),hiddenId),false);
 await page.goto(origin);await wait(()=>page.eval(()=>!!document.querySelector('.recommendation-row')),'persisted feed');
 assert.equal(await page.eval(id=>!!document.querySelector(`.recommendation-row a[href="/t/${id}"]`),hiddenId),false);
 passed.push('Cold-start feed, local board preferences, negative feedback persistence, four responsive widths and no browsing inference');
 // Test the actual worker/model with no remote host or server inference.
 const vectors=await page.eval(async()=>{
   const worker=new Worker('/recommendation-runtime/encoder.js',{type:'module'});
   const encode=(id,text)=>new Promise((resolve,reject)=>{
     worker.onmessage=event=>event.data.error?reject(new Error(event.data.error)):resolve(event.data.vector);
     worker.onerror=event=>reject(new Error(event.message));worker.postMessage({id,text});
   });
   const cat=await encode(1,'小猫在沙发上睡觉。');
   const pet=await encode(2,'猫咪躺在沙发上休息。');
   const space=await encode(3,'航天器进入环绕地球的轨道。');
   const prefix='mathematics '.repeat(300);
   const longA=await encode(4,prefix+' cats dogs');const longB=await encode(5,prefix+' galaxies stars');
   worker.terminate();return {cat,pet,space,longA,longB};
 });
 for(const vector of Object.values(vectors)){assert.equal(vector.length,512);assert.ok(vector.every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...vector)-1)<0.001)}
 const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
 assert.ok(dot(vectors.cat,vectors.pet)>dot(vectors.cat,vectors.space));
 assert.ok(dot(vectors.longA,vectors.longB)>0.99999,'256-token truncation');
 const assets=requests.filter(url=>url.includes('.onnx')||url.includes('.wasm')||url.includes('encoder.js'));
 assert.ok(assets.some(url=>url.includes('.onnx')),'observed actual model download');
 assert.ok(assets.some(url=>url.includes('.wasm')),'observed actual WASM download');
 assert.ok(assets.every(url=>url.startsWith(origin)));
 assert.ok(requests.filter(url=>/^https?:/.test(url)).every(url=>url.startsWith(origin)),'all scripts and model/runtime assets are served by this app');
 const encoded=Buffer.from(new Float32Array(vectors.cat).buffer).toString('base64');
 passed.push('Real local mixed INT4/INT8 BGE worker: 512 finite normalized values, semantic discrimination, 256-token truncation and same-origin assets');
 const owned=db.prepare('SELECT id FROM threads WHERE author_id=? LIMIT 1').get(alice.id).id;
 const foreign=db.prepare('SELECT id FROM threads WHERE author_id=? LIMIT 1').get(bob.id).id;
 const upload=async(postId,vector=encoded,version='bge-small-zh-v1.5-q4-v1',extra={})=>fetch(origin+'/api/recommendations/vectors',{method:'POST',headers:{...cookie,Origin:origin,'Content-Type':'application/json',...extra},body:JSON.stringify({postId,vector,version})});
 assert.equal((await upload(foreign)).status,403);assert.equal((await upload(owned,'bad')).status,400);
 assert.equal((await upload(owned,encoded,'bge-small-zh-v1.5-q4-v1',{Origin:'https://attacker.example'})).status,403);
 assert.equal((await upload(owned,encoded,'old-version')).status,200);
 assert.ok(db.prepare('SELECT 1 FROM vector_quarantine WHERE post_id=?').get(owned));
 assert.equal((await upload(owned)).status,200);
 assert.ok(db.prepare('SELECT 1 FROM post_vectors WHERE post_id=?').get(owned));
 assert.ok(db.prepare('SELECT 1 FROM recommendation_dirty WHERE post_id=?').get(owned));
 assert.equal(db.prepare('SELECT 1 FROM item_similarity WHERE post_id=?').get(owned),undefined,'online upload queues only');
 passed.push('Authenticated author-only vector ingestion, malformed input/CSRF rejection, model quarantine and no online scoring');
 // Exercise posting through the real editor. The browser's HTTP model cache is reused.
 await page.goto(origin+'/new?board=study');
 await page.eval(()=>{
   const set=(selector,value)=>{const el=document.querySelector(selector);Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));};
   set('input[name=title]','推荐算法浏览器验证');set('textarea[name=content]','讨论数学、物理与校园生活。');
   document.querySelector('main form').requestSubmit();
 });
 await wait(()=>page.eval(()=>/\/t\/\d+$/.test(location.pathname)),'posting with browser vector');
 const postedId=await page.eval(()=>Number(location.pathname.split('/').at(-1)));
 assert.ok(db.prepare('SELECT 1 FROM post_vectors WHERE post_id=?').get(postedId),'posting includes actual vector');
 await page.eval(()=>document.querySelector('article button[aria-label^="点赞"]').click());
 await wait(()=>!!db.prepare('SELECT 1 FROM user_interactions WHERE user_id=? AND post_id=? AND action=2').get(alice.id,postedId),'confirmed like');
 passed.push('Editor posting encodes locally and persists vector atomically; real likes produce SQL interaction signals');
 const job=spawn(process.execPath,['--experimental-strip-types','scripts/refresh-recommendations.mts','--full','--cf'],{env:{...process.env,HSFZ_DATA_DIR:temp},stdio:'pipe'});
 let jobOutput='';job.stdout.on('data',d=>jobOutput+=d);job.stderr.on('data',d=>jobOutput+=d);
 const status=await new Promise(r=>job.on('close',r));assert.equal(status,0,jobOutput);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM recommendation_dirty').get().n,0);
 assert.ok(db.prepare('SELECT 1 FROM recommendation_jobs').get());
 passed.push('Standalone SQLite refresh command drains semantic queue, materializes CF and records timings');
 await page.goto(origin+'/experimental');
 await page.eval(()=>document.querySelector('button[role="switch"]').click());
 await wait(()=>page.eval(()=>document.querySelector('button[role="switch"]').getAttribute('aria-checked')==='false'),'disable experiment');
 const requestCount=requests.length;
 await page.goto(origin);assert.equal(await page.eval(()=>!!document.querySelector('.recommended-feed')),false);
 await page.goto(origin+'/new?board=study');
 assert.equal(requests.slice(requestCount).some(url=>url.includes('encoder.js')||url.includes('.onnx')),false);
 assert.equal((await fetch(origin+'/api/recommendations',{headers:cookie})).status,403);
 assert.equal(db.prepare('SELECT 1 FROM user_interactions WHERE user_id=?').get(alice.id),undefined);
 passed.push('Experimental menu opt-in/out persists and disabling stops API access, tracking and model loading');
 assert.deepEqual(page.consoleErrors,[]);
 writeFileSync(join(out,'results.json'),JSON.stringify({passed,errors:page.consoleErrors},null,2));console.log(JSON.stringify({passed:passed.length,scenarios:passed},null,2));
}catch(error){console.error(error);console.error(log.slice(-4000));process.exitCode=1}
finally{if(browser)await browser.close();if(db)db.close();server.kill('SIGTERM');await sleep(200);rmSync(temp,{recursive:true,force:true})}
