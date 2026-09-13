# Ahoy! Personal

A working Manifest V3 adaptation of [Revolução dos Bytes' Ahoy!](https://github.com/revolucaodosbytes/ahoy-chrome), for personal use in current Chrome.

The original extension depended on an external API, a remotely hosted PAC file, and public proxies. The original API and default proxy hostnames did not resolve when checked on 13 September 2026. This version generates its routing rules locally and uses either the included local helper or a proxy you supply.

## Start on macOS

1. Keep this folder somewhere permanent. Chrome loads the extension directly from it.
2. Double-click **Start Ahoy Helper.command**. Leave the Terminal window open while using Ahoy. Node.js 22 or newer is required; no npm install is needed to run the helper. If Node is missing, install it from [nodejs.org](https://nodejs.org/).
3. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select the **Google Chrome** folder inside this folder.
4. Pin **Ahoy! Personal** from Chrome's extensions menu. Open a website, click Ahoy's icon, then **Add this site** and **Turn on**. Reload the website.

You can also enter sites in **Sites & connection settings**. Each domain includes its subdomains. The extension starts off with an empty site list.

To stop: turn Ahoy off, then close the helper window or press Control+C. Turning Ahoy off restores the proxy settings that applied before the extension took control. Removing or disabling the extension also releases its Chrome proxy setting.

### What the local helper does

The helper runs only on `127.0.0.1:8787` and resolves the selected destinations using Cloudflare DNS over HTTPS. It connects directly to the returned public IPv4 address. HTTPS is tunneled unchanged: there is no TLS interception, certificate installation, or access to the encrypted page content.

This handles **DNS-based blocks**. It does **not** change your public IP, provide anonymity, or bypass IP blocks, filtering by hostname/SNI, or geographic restrictions. Cloudflare receives the DNS queries. Websites and your ISP still see your normal connection. The helper does not log browsing history.

Only websites on your list use Ahoy. A site may need additional media, API, or login domains added to the list. Non-listed websites continue using the normal connection. If the proxy fails, listed sites fail rather than silently connecting directly.

The local helper supports ordinary HTTP on port 80 and HTTPS tunnels on port 443 (also CONNECT port 80). IPv6-only destinations and unencrypted WebSocket upgrades are not supported. Regular Chrome windows are supported; incognito is outside this version's scope.

### Your own proxy

In settings select **My own proxy**, choose HTTP, HTTPS, or SOCKS5, and enter its hostname and port. The local helper is unnecessary in this mode. Use a server you trust. Username/password proxy authentication is not implemented.

For an existing SSH server you control, you can create a local SOCKS tunnel with:

```sh
ssh -N -D 127.0.0.1:1080 your-user@your-server
```

Then choose SOCKS5, `127.0.0.1`, port `1080`. Keep the SSH session running. Credentials are handled by SSH, not by this extension.

## Troubleshooting

- **Proxy connection failed:** start the helper, or check your custom proxy. Switch Ahoy off and on, then reload the website. The popup shows proxy errors reported by Chrome; it does not promise a site is reachable merely because a rule is enabled.
- **Another extension or policy controls the proxy:** choose which proxy extension should be active. Ahoy reports this conflict rather than showing a successful connection.
- **A site is still blocked:** the block may be IP/SNI based, or the page may need additional domains. Use your own remote proxy/VPN for restrictions the local helper cannot handle.
- **Port 8787 is already in use:** the helper may already be running. Its health endpoint is `http://127.0.0.1:8787/health`. A nondefault port can be selected with `AHOY_PORT=8788 node helper/proxy.mjs`; use the matching custom HTTP proxy setting in the extension.
- **Changes are not reflected:** save settings and reload affected websites. After changing extension source files, click **Reload** on its Chrome extensions card.

## Development and validation

The extension and helper have no runtime npm dependencies. Development tests use Playwright:

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

Browser tests run in a temporary isolated profile. They check Manifest V3 loading, settings UI, selected-site routing, direct traffic, persistence after a browser restart, restoration of previous proxy settings, invalid configuration rejection, a real HTTPS connection through the helper, behavior when a proxy stops, and popup rendering. The live HTTPS check requires internet access to Cloudflare and example.com. Screenshots go in `.artifacts/`.

If Playwright's browser is already installed elsewhere, set `AHOY_TEST_BROWSER` to its executable path. Do not point these tests at an existing personal Chrome profile.

## Changes from upstream

- Manifest V3 module service worker replaces the persistent background page and obsolete APIs.
- Locally generated PAC rules replace the remote PAC service.
- Configurable domain list and proxy replace dead remote discovery services.
- Optional local encrypted-DNS helper and macOS launcher.
- No hostname telemetry, automatic blocked-page reports, broad webRequest permissions, jQuery, external scripts, or donation/update popups.
- Settings validation, exact/subdomain matching, serialized setting changes, restart handling, and visible proxy errors.

The original branding and icons are retained. This is an independent personal adaptation, not a restored public Ahoy proxy service.

## License

MIT. See [LICENSE](LICENSE). Original project: Revolução dos Bytes.
