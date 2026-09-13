#!/bin/zsh
cd "${0:A:h}"
if ! command -v node >/dev/null 2>&1; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node "$HOME"/.nvm/versions/node/*/bin/node(N); do
    if [[ -x "$candidate" ]]; then
      export PATH="${candidate:h}:$PATH"
      break
    fi
  done
fi
if ! command -v node >/dev/null 2>&1; then
  print 'Node.js 22 or newer is required. Install it from https://nodejs.org, then reopen this file.'
  read -k 1 '?Press any key to close.'
  exit 1
fi
node helper/proxy.mjs
if [[ $? != 0 ]]; then
  read -k 1 '?Press any key to close.'
fi
