import { describe, expect, it } from 'vitest'
import { clientIp } from './clientIp.ts'

describe('clientIp', () => {
  it('uses the socket address when no header is configured', () => {
    expect(clientIp({ 'true-client-ip': '1.2.3.4' }, '10.0.0.1')).toBe('10.0.0.1')
    expect(clientIp({ 'x-forwarded-for': '1.2.3.4' }, '10.0.0.1')).toBe('10.0.0.1')
  })

  it('reads the configured header, whatever its case', () => {
    expect(clientIp({ 'true-client-ip': '1.2.3.4' }, '10.0.0.1', 'true-client-ip')).toBe('1.2.3.4')
    expect(clientIp({ 'true-client-ip': '1.2.3.4' }, '10.0.0.1', 'True-Client-IP')).toBe('1.2.3.4')
  })

  it('takes the first value of a list', () => {
    expect(clientIp({ 'true-client-ip': ' 1.2.3.4 , 5.6.7.8' }, '10.0.0.1', 'true-client-ip')).toBe('1.2.3.4')
    expect(clientIp({ 'true-client-ip': ['1.2.3.4', '5.6.7.8'] as unknown as string }, '10.0.0.1', 'true-client-ip'))
      .toBe('1.2.3.4')
  })

  it('falls back to the socket address when the header is missing or empty', () => {
    expect(clientIp({}, '10.0.0.1', 'true-client-ip')).toBe('10.0.0.1')
    expect(clientIp({ 'true-client-ip': '' }, '10.0.0.1', 'true-client-ip')).toBe('10.0.0.1')
    expect(clientIp({ 'true-client-ip': ' , ' }, '10.0.0.1', 'true-client-ip')).toBe('10.0.0.1')
  })

  it('says unknown when there is no address at all', () => {
    expect(clientIp({}, undefined)).toBe('unknown')
  })
})
