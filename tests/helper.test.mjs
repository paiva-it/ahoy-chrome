import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {createProxy,isPublicIPv4,resolvePublic} from '../helper/proxy.mjs';

test('helper rejects private and reserved addresses, including literal IP bypasses',async()=>{
  for(const ip of ['0.0.0.0','10.0.0.1','127.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','100.64.0.1','198.18.0.1','224.0.0.1','::1','::ffff:127.0.0.1']) {
    assert.equal(isPublicIPv4(ip),false,ip);
    await assert.rejects(resolvePublic(ip));
  }
  assert.equal(isPublicIPv4('1.1.1.1'),true);
  assert.equal(isPublicIPv4('93.184.215.14'),true);
});
test('HTTP proxy rejects unsafe requests and exposes loopback health',async t=>{
  const proxy=createProxy();
  await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  t.after(()=>proxy.shutdown());
  const port=proxy.address().port;
  async function request(path,headers={}) {
    return new Promise((resolve,reject)=>{
      http.get({host:'127.0.0.1',port,path,headers},res=>{let body='';res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,body}));}).on('error',reject);
    });
  }
  const health=await request('/health');
  assert.equal(JSON.parse(health.body).service,'ahoy-personal');
  assert.equal((await request('/health',{origin:'https://attacker.example'})).status,403);
  for(const url of ['http://127.0.0.1/','http://[::1]/','http://example.com:22/','https://example.com/'])assert.equal((await request(url)).status,400,url);
  const response=await new Promise((resolve,reject)=>{
    const socket=net.connect(port,'127.0.0.1',()=>socket.write('CONNECT 127.0.0.1:443 HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n'));
    socket.on('data',data=>{resolve(data.toString());socket.destroy();});socket.on('error',reject);
  });
  assert.match(response,/403 Forbidden/);
});


test('allows normal Origin headers on proxied HTTP traffic',async t=>{
  let queried='';
  const proxy=createProxy({resolve:async host=>{queried=host;throw new Error('Test resolver: no destination');}});
  await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  t.after(()=>proxy.shutdown());
  const status=await new Promise((resolve,reject)=>{
    http.get({host:'127.0.0.1',port:proxy.address().port,path:'http://example.test/',headers:{origin:'http://example.test'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));}).on('error',reject);
  });
  assert.equal(status,502);
  assert.equal(queried,'example.test');
});
