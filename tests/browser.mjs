import {chromium} from 'playwright';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createProxy} from '../helper/proxy.mjs';

const profile=await mkdtemp(path.join(tmpdir(),'ahoy-browser-'));
const extension=path.resolve('Google Chrome');
const artifacts=path.resolve('.artifacts');await mkdir(artifacts,{recursive:true});
const errors=[];
const received=[];
const mock=http.createServer((req,res)=>{received.push(req.url);res.end('<h1>Routed through Ahoy</h1>');});
await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
const helper=createProxy();const tunnels=[];helper.on('connect',req=>tunnels.push(req.url));
await new Promise(resolve=>helper.listen(0,'127.0.0.1',resolve));
let context;
async function launch() {
  context=await chromium.launchPersistentContext(profile,{
    channel:'chromium',headless:true,
    ...(process.env.AHOY_TEST_BROWSER?{executablePath:process.env.AHOY_TEST_BROWSER}:{}),
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]
  });
  let worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const id=worker.url().split('/')[2];
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`chrome-extension://${id}/views/options.html`);
  await page.locator('#enabled').filter({hasText:/Ahoy is/}).waitFor();
  return {worker,id,page};
}
async function message(page,payload) {return page.evaluate(payload=>Promise.race([chrome.runtime.sendMessage(payload),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Message timed out: '+payload.type)),10000))]),payload);}
async function save(page,settings) {const result=await message(page,{type:'save',settings});assert.equal(result.ok,true,result.error);return result;}
try {
  let {page,id}=await launch();console.log('Loaded extension');
  const initial=await message(page,{type:'status'});
  assert.equal(initial.settings.enabled,false);
  const before=await page.evaluate(()=>chrome.proxy.settings.get({incognito:false}));
  // Exercise form validation and saving using real Chrome APIs.
  await page.selectOption('#preset','custom');await page.fill('#host','127.0.0.1');await page.fill('#port',String(mock.address().port));
  await page.fill('#sites','example.test\nexample.test');await page.click('#save');
  await page.getByRole('status').filter({hasText:'Saved.'}).waitFor();
  assert.deepEqual((await message(page,{type:'status'})).settings.sites,['example.test']);
  let enabled=await message(page,{type:'toggle',enabled:true});assert.equal(enabled.ok,true,enabled.error);
  let web=await context.newPage();await web.goto('http://sub.example.test');
  assert.match(await web.textContent('body'),/Routed through Ahoy/);
  assert.ok(received.some(url=>url==='http://sub.example.test/'));
  // Other domains use DIRECT, not the mock proxy.
  const count=received.length;
  const direct=http.createServer((req,res)=>res.end('Direct local connection'));
  await new Promise(resolve=>direct.listen(0,'127.0.0.1',resolve));
  try {await web.goto(`http://127.0.0.1:${direct.address().port}`);assert.equal(await web.textContent('body'),'Direct local connection');assert.equal(received.length,count);}finally{direct.closeAllConnections();await new Promise(resolve=>direct.close(resolve));}
  console.log('Selective routing passed');
  // Saved rules and active PAC survive a full browser restart (and worker lifetime).
  await context.close();({page,id}=await launch());
  const restored=await message(page,{type:'status'});assert.equal(restored.settings.enabled,true);assert.equal(restored.control,'controlled_by_this_extension');
  web=await context.newPage();await web.goto('http://example.test');assert.match(await web.textContent('body'),/Routed through Ahoy/);
  const off=await message(page,{type:'toggle',enabled:false});assert.equal(off.ok,true);
  const after=await page.evaluate(()=>chrome.proxy.settings.get({incognito:false}));assert.deepEqual(after.value,before.value);
  const bad=await message(page,{type:'save',settings:{...restored.settings,host:'evil; DIRECT'}});assert.equal(bad.ok,false);
  assert.equal((await message(page,{type:'status'})).settings.host,'127.0.0.1');
  console.log('Restart and disable/restore passed');
  // Verify an actual external HTTPS page over the helper's encrypted-DNS CONNECT tunnel.
  await save(page,{...restored.settings,enabled:true,port:helper.address().port,sites:['example.com']});
  web=await context.newPage();await web.goto('https://example.com',{timeout:30000});
  assert.match(await web.textContent('h1'),/Example Domain/);assert.ok(tunnels.includes('example.com:443'));
  console.log('HTTPS tunnel passed');
  // A stopped proxy must fail selected requests instead of silently bypassing the rule.
  await save(page,{...restored.settings,enabled:true,port:mock.address().port,sites:['unavailable.test']});
  mock.closeAllConnections();await new Promise(resolve=>mock.close(resolve));
  const failed=await context.newPage();await assert.rejects(failed.goto('http://unavailable.test',{timeout:15000}));
  await message(page,{type:'toggle',enabled:false});
  console.log('Proxy outage passed');
  // Capture the UI with production defaults, not transient test ports or rules.
  await save(page,{...initial.settings,sites:['example.com']});await page.reload();
  await page.locator('#enabled').filter({hasText:'Ahoy is off'}).waitFor();
  await page.screenshot({path:path.join(artifacts,'settings.png'),fullPage:true});
  const popup=await context.newPage();await popup.setViewportSize({width:360,height:560});await popup.goto(`chrome-extension://${id}/views/popup.html`);
  await popup.getByText('Switched off',{exact:true}).waitFor();await popup.screenshot({path:path.join(artifacts,'popup.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: MV3 load, settings UI, selective HTTP routing, direct traffic, restart persistence, disable/restore, invalid settings, real HTTPS over encrypted DNS, stopped-proxy failure, popup rendering.');
  console.log('Browser: '+context.browser().version());
} finally {
  await context?.close();await helper.shutdown();mock.closeAllConnections();await new Promise(resolve=>mock.close(resolve));await rm(profile,{recursive:true,force:true});
}
