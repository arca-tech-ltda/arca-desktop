import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import { syncBuiltinESMExports } from 'node:module'

const deny = () => {
  throw new Error('Network is forbidden in the accounts API proof')
}

globalThis.fetch = deny
http.request = deny
http.get = deny
https.request = deny
https.get = deny
net.Socket.prototype.connect = deny
tls.connect = deny
syncBuiltinESMExports()
