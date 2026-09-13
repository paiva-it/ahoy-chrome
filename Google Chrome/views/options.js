const $ = id=>document.getElementById(id);
function preset() {
  const local=$('preset').value==='local';
  $('custom').hidden=local;$('localInfo').hidden=!local;
  if(local){$('host').value='127.0.0.1';$('port').value=8787;$('type').value='PROXY';}
}
$('preset').onchange=preset;
async function send(message){const result=await chrome.runtime.sendMessage(message);if(!result?.ok)throw new Error(result?.error||'Extension unavailable.');return result;}
function show(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function load(s){
  $('type').value=s.type;$('host').value=s.host;$('port').value=s.port;$('sites').value=s.sites.join('\n');
  $('preset').value=s.type==='PROXY'&&s.host==='127.0.0.1'&&s.port===8787?'local':'custom';preset();
  $('enabled').textContent=s.enabled?'Ahoy is on':'Ahoy is off — turn it on from the toolbar';
}
$('form').onsubmit=async event=>{
  event.preventDefault();$('save').disabled=true;
  try {
    const {settings:current}=await send({type:'status'});
    const result=await send({type:'save',settings:{...current,type:$('type').value,host:$('host').value,port:$('port').value,sites:$('sites').value}});
    load(result.settings);show('Saved. '+(result.settings.enabled?'Reload your websites to apply the changes.':'Turn Ahoy on from its toolbar icon when ready.'));
  } catch(error){show(error.message,true);} finally{$('save').disabled=false;}
};
try{load((await send({type:'status'})).settings);}catch(error){show(error.message,true);}
