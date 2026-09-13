export const DEFAULTS = Object.freeze({enabled:false, type:'PROXY', host:'127.0.0.1', port:8787, sites:[]});
export function normalizeDomain(input) {
  let value = String(input).trim();
  if (!value || /[\s@;"'\\]/.test(value)) throw new Error('Enter a domain or a website URL.');
  let url;
  try { url = new URL(value.includes('://') ? value : 'https://' + value.replace(/^\*\./, '')); }
  catch { throw new Error('Invalid domain: ' + value); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS website.');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host.length > 253 || !host.includes('.') || !host.split('.').every(x=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x)) || /^\d+(\.\d+){3}$/.test(host) || /\.(localhost|local|internal)$/.test(host)) throw new Error('Use a public domain name, such as example.com.');
  return host;
}
export function validateSettings(input) {
  const type = input.type;
  if (!['PROXY', 'HTTPS', 'SOCKS5'].includes(type)) throw new Error('Choose a supported proxy type.');
  const host = String(input.host ?? '').trim().toLowerCase();
  if (host.length > 253 || !host.split('.').every(x=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x))) throw new Error('Enter a proxy hostname or IPv4 address without a URL or port.');
  const port = Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535.');
  const raw = Array.isArray(input.sites) ? input.sites : String(input.sites ?? '').split(/[\n,]+/);
  if (raw.length > 5000) throw new Error('Please use at most 5,000 sites.');
  const sites = [...new Set(raw.filter(x=>String(x).trim()).map(normalizeDomain))].sort();
  return {enabled: input.enabled === true, type, host, port, sites};
}
export function matches(host, sites) {
  host = host.toLowerCase().replace(/\.$/, '');
  return sites.some(site => host === site || host.endsWith('.' + site));
}
export function makePac(settings) {
  const s = validateSettings(settings);
  return `function FindProxyForURL(url, host) {
    host = host.toLowerCase().replace(/\\.$/, "");
    var sites = ${JSON.stringify(s.sites)};
    for (var i = 0; i < sites.length; i++) {
      if (host === sites[i] || host.slice(-(sites[i].length + 1)) === "." + sites[i]) return ${JSON.stringify(`${s.type} ${s.host}:${s.port}`)};
    }
    return "DIRECT";
  }`;
}
