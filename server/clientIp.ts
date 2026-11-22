// The visitor's IP address, for the rate limit.
//
// Behind a proxy (Render), the socket address is the proxy's, so every visitor would
// share one limit. `CLIENT_IP_HEADER` names the header the proxy sets with the real
// address (`true-client-ip` on Render). X-Forwarded-For is never read by default:
// a client can send its own and the proxy keeps it.

import type { IncomingHttpHeaders } from 'node:http'

/**
 * The visitor IP: the first value of `headerName` when it is given and present,
 * otherwise the socket address.
 */
export const clientIp = (
  headers: IncomingHttpHeaders,
  socketAddress: string | undefined,
  headerName?: string,
): string => {
  if (headerName) {
    const raw = headers[headerName.toLowerCase()]
    const value = Array.isArray(raw) ? raw[0] : raw
    const first = value?.split(',')[0].trim()
    if (first) return first
  }
  return socketAddress ?? 'unknown'
}
