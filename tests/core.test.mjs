import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {DEFAULTS,normalizeDomain,validateSettings,matches,makePac} from '../Google Chrome/core.js';

test('normalizes pasted URLs, IDNs, wildcard prefixes and trailing dots',()=>{
  assert.equal(normalizeDomain('https://WWW.Example.com/path?q=1'),'www.example.com');
  assert.equal(normalizeDomain('*.example.com.'),'example.com');
  assert.equal(normalizeDomain('münich.de'),'xn--mnich-kva.de');
});
test('rejects local, malformed and injected domain rules',()=>{
  for(const value of ['localhost','127.0.0.1','foo.local','example.com; return "DIRECT"','https://u:p@example.com','ftp://example.com','a..com','-a.com']) assert.throws(()=>normalizeDomain(value),value);
});
test('settings deduplicate rules and reject PAC injection and invalid ports',()=>{
  assert.deepEqual(validateSettings({...DEFAULTS,sites:'example.com\nhttps://example.com/a\n'}).sites,['example.com']);
  for(const host of ['localhost; DIRECT','https://proxy.org','user@proxy.org','proxy.org:3128',''])assert.throws(()=>validateSettings({...DEFAULTS,host}));
  for(const port of [0,65536,1.2,'foo',''])assert.throws(()=>validateSettings({...DEFAULTS,port}));
});
test('matches exact domains and subdomains without matching unrelated domains',()=>{
  assert.equal(matches('a.b.example.com',['example.com']),true);
  assert.equal(matches('EXAMPLE.COM.',['example.com']),true);
  for(const host of ['notexample.com','example.com.attacker.org','another.com'])assert.equal(matches(host,['example.com']),false);
});
test('generated PAC routes only selected domains with no direct fallback on proxy failure',()=>{
  for(const type of ['PROXY','HTTPS','SOCKS5']){
    const context=vm.createContext({});
    vm.runInContext(makePac({...DEFAULTS,type,sites:['example.com']}),context);
    assert.equal(context.FindProxyForURL('https://a.example.com','a.example.com'),`${type} 127.0.0.1:8787`);
    assert.equal(context.FindProxyForURL('https://example.com','EXAMPLE.COM.'),`${type} 127.0.0.1:8787`);
    assert.equal(context.FindProxyForURL('http://another.com','another.com'),'DIRECT');
  }
});
