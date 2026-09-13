import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import {pathToFileURL} from 'node:url';

export function isPublicIPv4(address) {
  if (net.isIP(address) !== 4) return false;
  const [a,b,c] = address.split('.').map(Number);
  return !(a===0 || a===10 || a===127 || a>=224 || (a===100 && b>=64 && b<=127) ||
    (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && b===168) ||
    (a===192 && b===0 && (c===0 || c===2)) || (a===198 && (b===18 || b===19 || b===51 && c===100)) || (a===203 && b===0 && c===113));
}
const cache = new Map();
export async function resolvePublic(host) {
  host = host.toLowerCase().replace(/\.$/,'');
  if (net.isIP(host)) {
    if (!isPublicIPv4(host)) throw new Error('Only public IPv4 destinations are supported.');
    return [{address:host,family:4}];
  }
  if (host.length>253 || !host.includes('.') || !host.split('.').every(x=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x))) throw new Error('Invalid destination hostname.');
  const cached = cache.get(host);
  if(cached?.expires>Date.now()) return cached.addresses;
  const data = await new Promise((resolve,reject)=>{
    // Using the resolver's IP avoids depending on the ISP's DNS to find the resolver itself.
    const req = https.get(`https://1.1.1.1/dns-query?name=${encodeURIComponent(host)}&type=A`, {headers:{accept:'application/dns-json'}}, res=>{
      let body='';
      res.on('data',chunk=>{body+=chunk;if(body.length>65536)req.destroy(new Error('DNS response too large.'));});
      res.on('error',reject);
      res.on('end',()=>{try{if(res.statusCode!==200)throw new Error('Encrypted DNS unavailable.');resolve(JSON.parse(body));}catch(e){reject(e);}});
    });
    req.setTimeout(10000,()=>req.destroy(new Error('Encrypted DNS timed out.')));
    req.on('error',reject);
  });
  if(data.Status!==0)throw new Error('Encrypted DNS could not resolve this site.');
  const records=(data.Answer||[]).filter(r=>r.type===1 && isPublicIPv4(r.data));
  if(!records.length)throw new Error('No public IPv4 address found for this site.');
  const addresses=records.map(r=>({address:r.data,family:4}));
  if(cache.size>=1000)cache.delete(cache.keys().next().value);
  cache.set(host,{addresses,expires:Date.now()+Math.max(0,Math.min(300,...records.map(r=>Number(r.TTL)||0)))*1000});
  return addresses;
}
function strippedHeaders(headers) {
  const result={...headers};
  const remove=['connection','proxy-connection','proxy-authorization','proxy-authenticate','keep-alive','te','trailer','transfer-encoding','upgrade',...(headers.connection||'').split(',').map(x=>x.trim().toLowerCase())];
  for(const key of remove)delete result[key];
  return result;
}
export function createProxy({resolve=resolvePublic}={}) {
  const sockets=new Set();
  function lookup(host,options,callback) {
    resolve(host).then(addresses=>options.all?callback(null,addresses):callback(null,addresses[0].address,4),callback);
  }
  const server=http.createServer(async(req,res)=>{
    if(req.url.startsWith('/') && req.headers.origin){res.writeHead(403);res.end('Browser origin requests are not accepted.');return;}
    if(req.url==='/health' && /^127\.0\.0\.1:\d+$/.test(req.headers.host||'')) {
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
      res.end(JSON.stringify({service:'ahoy-personal',version:'4.0.0',dns:'Cloudflare DNS over HTTPS'}));return;
    }
    let url;
    try {
      url=new URL(req.url);
      if((net.isIP(url.hostname.replace(/^\[|\]$/g,'')) && !isPublicIPv4(url.hostname)) || url.protocol!=='http:' || url.username || url.password || (url.port && url.port!=='80'))throw new Error();
    } catch {res.writeHead(400);res.end('Only HTTP port 80 and HTTPS CONNECT port 443 are supported.');return;}
    const headers=strippedHeaders(req.headers);headers.host=url.host;
    const upstream=http.request({hostname:url.hostname,port:80,path:url.pathname+url.search,method:req.method,headers,lookup,autoSelectFamily:true,agent:false},reply=>{
      res.writeHead(reply.statusCode,strippedHeaders(reply.headers));reply.pipe(res);
      reply.on('error',()=>res.destroy());
    });
    upstream.setTimeout(30000,()=>upstream.destroy(new Error('Upstream timeout.')));
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Ahoy could not connect. Check the destination and your internet connection.');});
    req.on('aborted',()=>upstream.destroy());res.on('close',()=>upstream.destroy());
    req.pipe(upstream);
  });
  server.on('connect',(req,client,head)=>{
    client.on('error',()=>{});
    const match=/^([a-zA-Z0-9.-]+):(443|80)$/.exec(req.url);
    if(!match || req.headers.origin || (net.isIP(match[1]) && !isPublicIPv4(match[1]))) {client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    const upstream=net.createConnection({host:match[1],port:Number(match[2]),lookup,autoSelectFamily:true});
    let connected=false;
    const timer=setTimeout(()=>upstream.destroy(new Error('Connect timeout.')),15000);
    upstream.on('connect',()=>{
      clearTimeout(timer);connected=true;
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if(head.length)upstream.write(head);
      client.pipe(upstream);upstream.pipe(client);
    });
    upstream.setTimeout(300000,()=>upstream.destroy());
    upstream.on('error',()=>{if(!connected)client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');else client.destroy();});
    upstream.on('close',()=>{clearTimeout(timer);client.destroy();});
    client.on('close',()=>{clearTimeout(timer);upstream.destroy();});
    client.on('error',()=>upstream.destroy());
  });
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});});
  server.on('clientError',(_,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
  server.shutdown=()=>{for(const socket of sockets)socket.destroy();return new Promise(resolve=>server.close(resolve));};
  return server;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const port=Number(process.env.AHOY_PORT||8787);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('AHOY_PORT must be from 1024 to 65535.');
  const server=createProxy();
  server.on('error',error=>{
    console.error(error.code==='EADDRINUSE'?`Port ${port} is already in use. The helper may already be running.`:error.message);process.exitCode=1;
  });
  server.listen(port,'127.0.0.1',()=>console.log(`Ahoy! Personal helper is ready on 127.0.0.1:${port}.\nLeave this window open while using Ahoy. Press Control+C to stop.\nUses Cloudflare encrypted DNS. No browsing logs. Your public IP stays the same.`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.shutdown();process.exit(0);});
}
