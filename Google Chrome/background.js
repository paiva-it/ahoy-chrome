import {DEFAULTS, validateSettings, makePac, normalizeDomain} from './core.js';
let queue = Promise.resolve();
function serial(task) {
  const result = queue.then(task);
  queue = result.catch(()=>{});
  return result;
}
async function settings() {
  const data = await chrome.storage.local.get('settings');
  return validateSettings({...DEFAULTS, ...data.settings});
}
async function badge(s, conflict = false) {
  await chrome.action.setBadgeText({text: conflict ? '!' : s.enabled ? 'ON' : ''});
  await chrome.action.setBadgeBackgroundColor({color:conflict ? '#a32929' : '#176b55'});
  await chrome.action.setIcon({path:{'38':`icons/${s.enabled && !conflict ? 'color' : 'gray'}/38x38.png`}});
}
async function apply(s) {
  const state = await chrome.proxy.settings.get({incognito:false});
  if (s.enabled) {
    if (!s.sites.length) throw new Error('Add at least one site before turning Ahoy on.');
    if (!['controllable_by_this_extension','controlled_by_this_extension'].includes(state.levelOfControl)) throw new Error('Another extension or browser policy controls your proxy. Disable it before enabling Ahoy.');
    await chrome.proxy.settings.set({value:{mode:'pac_script',pacScript:{data:makePac(s), mandatory:true}},scope:'regular'});
  } else {
    await chrome.proxy.settings.clear({scope:'regular'});
  }
  await badge(s);
}
async function save(input) {
  const next = validateSettings(input);
  const previous = await settings();
  await apply(next);
  try {
    await chrome.storage.local.set({settings:next, lastError:null});
  } catch (error) {
    await apply(previous);
    throw error;
  }
  return next;
}
async function status() {
  const s = await settings();
  const proxy = await chrome.proxy.settings.get({incognito:false});
  const {lastError} = await chrome.storage.local.get('lastError');
  return {settings:s, control:proxy.levelOfControl, lastError};
}
async function handle(message) {
  switch(message.type) {
    case 'status': return status();
    case 'save': await save(message.settings); return status();
    case 'toggle': await save({...await settings(), enabled:message.enabled}); return status();
    case 'addSite': {
      const s = await settings();
      s.sites.push(normalizeDomain(message.url));
      await save(s);
      return status();
    }
    default: throw new Error('Unknown request.');
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply)=>{
  if (sender.id !== chrome.runtime.id) return;
  serial(()=>handle(message)).then(data=>reply({ok:true,...data}),error=>reply({ok:false,error:error.message}));
  return true;
});
async function restore() {
  try { await apply(await settings()); }
  catch (error) { await chrome.storage.local.set({lastError:error.message}); await badge(await settings(),true); }
}
chrome.runtime.onInstalled.addListener(()=>serial(restore));
chrome.runtime.onStartup.addListener(()=>serial(restore));
chrome.proxy.onProxyError.addListener(error=>serial(async()=>{
  if ((await settings()).enabled) {
    await chrome.storage.local.set({lastError:`Proxy connection failed (${error.error}). Start the helper or check your proxy settings, then retry.`});
    await badge(await settings(),true);
  }
}));
chrome.proxy.settings.onChange.addListener(()=>serial(async()=>{
  const state = await status();
  await badge(state.settings,state.settings.enabled && state.control !== 'controlled_by_this_extension');
}));
