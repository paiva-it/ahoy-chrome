import {matches} from '../core.js';
const $ = id=>document.getElementById(id);
let state, tab;
async function request(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error || 'Ahoy is unavailable. Reload the extension.');
  return result;
}
function render() {
  const s = state.settings;
  const active = s.enabled && state.control === 'controlled_by_this_extension';
  $('status').textContent = s.enabled ? active ? 'On · selected sites' : 'Proxy conflict' : 'Switched off';
  $('dot').classList.toggle('on',active);
  $('count').textContent = s.sites.length + (s.sites.length === 1 ? ' site' : ' sites');
  $('toggle').textContent = s.enabled ? 'Turn off' : 'Turn on';
  $('toggle').disabled = !s.enabled && !s.sites.length;
  if (tab?.url && /^https?:/.test(tab.url)) {
    const host = new URL(tab.url).hostname;
    const included = matches(host,s.sites);
    $('host').textContent = host;
    $('route').textContent = included ? active ? 'Uses your configured proxy.' : 'On your list. Ahoy is currently off or unavailable.' : 'Uses your normal connection.';
    $('add').textContent = included ? 'Already on your list' : 'Add this site';
    $('add').disabled = included;
  }
  if (state.lastError && s.enabled) show(state.lastError,true);
}
function show(text,error=false) {$('message').textContent=text;$('message').classList.toggle('error',error);}
async function run(message, success) {
  try {show('');state=await request(message);render();if(!state.lastError)show(success);}
  catch(error){show(error.message,true);}
}
$('options').onclick=()=>chrome.runtime.openOptionsPage();
$('toggle').onclick=()=>run({type:'toggle',enabled:!state.settings.enabled},'Saved. Reload the website to use the new connection.');
$('add').onclick=()=>run({type:'addSite',url:tab.url},'Added. Subdomains are included too.');
try {[tab]=await chrome.tabs.query({active:true,currentWindow:true});state=await request({type:'status'});render();}
catch(error){show(error.message,true);}
