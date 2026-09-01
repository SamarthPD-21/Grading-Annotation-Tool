import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import {
  proxy,
  checkRateLimit,
  isSuspiciousUserAgent,
  getClientIp,
  SECURITY_HEADERS,
  RATE_LIMITS,
} from '@/proxy';

describe('Next.js 16 Security Proxy (src/proxy.ts)', () => {
  describe('User-Agent Filtering', () => {
    it('should detect empty or whitespace-only User-Agents as suspicious', () => {
      expect(isSuspiciousUserAgent(null)).toBe(true);
      expect(isSuspiciousUserAgent('')).toBe(true);
      expect(isSuspiciousUserAgent('   ')).toBe(true);
    });

    it('should detect known security scanners as suspicious', () => {
      expect(isSuspiciousUserAgent('sqlmap/1.5.2#stable')).toBe(true);
      expect(isSuspiciousUserAgent('Mozilla/5.0 (compatible; Nmap Scripting Engine; https://nmap.org/book/nse.html)')).toBe(true);
      expect(isSuspiciousUserAgent('Nikto/2.1.6')).toBe(true);
      expect(isSuspiciousUserAgent('WPScan v3.8.22')).toBe(true);
      expect(isSuspiciousUserAgent('masscan/1.0')).toBe(true);
      expect(isSuspiciousUserAgent('Acunetix')).toBe(true);
      expect(isSuspiciousUserAgent('gobuster/3.1.0')).toBe(true);
      expect(isSuspiciousUserAgent('dirbuster')).toBe(true);
    });

    it('should allow legitimate browser and standard client user agents', () => {
      expect(
        isSuspiciousUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
      ).toBe(false);
      expect(isSuspiciousUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false);
      expect(isSuspiciousUserAgent('curl/7.68.0')).toBe(false);
    });

    it('should block suspicious user agents with 403 Forbidden in proxy', async () => {
      const req = new NextRequest('http://localhost:3000/api/submissions', {
        headers: {
          'user-agent': 'sqlmap/1.5.2',
        },
      });

      const res = proxy(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe('FORBIDDEN');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('should block empty user agent with 403 Forbidden', async () => {
      const req = new NextRequest('http://localhost:3000/submissions', {
        headers: {
          'user-agent': '',
        },
      });

      const res = proxy(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe('FORBIDDEN');
    });
  });

  describe('Request Size Limiting (Content-Length check)', () => {
    it('should reject requests exceeding 15MB with 413 Payload Too Large', async () => {
      const largeSize = 16 * 1024 * 1024; // 16MB
      const req = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'POST',
        headers: {
          'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0',
          'content-length': String(largeSize),
        },
      });

      const res = proxy(req);
      expect(res.status).toBe(413);
      const json = await res.json();
      expect(json.error).toBe('PAYLOAD_TOO_LARGE');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('should allow requests within 15MB limit', () => {
      const validSize = 5 * 1024 * 1024; // 5MB
      const req = new NextRequest('http://localhost:3000/api/submissions', {
        method: 'POST',
        headers: {
          'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0',
          'content-length': String(validSize),
          'x-forwarded-for': '10.0.0.1',
        },
      });

      const res = proxy(req);
      expect(res.status).toBe(200);
    });
  });

  describe('CORS Configuration', () => {
    it('should reject cross-origin API requests with 403 Forbidden', async () => {
      const req = new NextRequest('http://localhost:3000/api/submissions', {
        headers: {
          'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0',
          origin: 'https://evil-attacker.com',
        },
      });

      const res = proxy(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe('CORS_FORBIDDEN');
    });

    it('should handle same-origin preflight OPTIONS request with 204 No Content and CORS headers', () => {
      const origin = 'http://localhost:3000';
      const req = new NextRequest(`${origin}/api/submissions`, {
        method: 'OPTIONS',
        headers: {
          'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0',
          origin: origin,
        },
      });

      const res = proxy(req);
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    });

    it('should allow same-origin API requests and include CORS headers', () => {
      const origin = 'http://localhost:3000';
      const req = new NextRequest(`${origin}/api/submissions`, {
        method: 'GET',
        headers: {
          'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0',
          origin: origin,
          'x-forwarded-for': '10.0.0.2',
        },
      });

      const res = proxy(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    });
  });

  describe('Rate Limiting (Sliding Window)', () => {
    it('should allow requests within limit and track remaining tokens', () => {
      const testKey = 'test_ip_1';
      const result1 = checkRateLimit(testKey, 5, 1000);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(4);

      const result2 = checkRateLimit(testKey, 5, 2000);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(3);
    });

    it('should block requests when limit is exceeded and calculate reset time', () => {
      const testKey = 'test_ip_blocked';
      const now = 10000;
      for (let i = 0; i < 5; i++) {
        expect(checkRateLimit(testKey, 5, now + i * 100).allowed).toBe(true);
      }

      const blockedResult = checkRateLimit(testKey, 5, now + 1000);
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.remaining).toBe(0);
      expect(blockedResult.reset).toBeGreaterThan(0);
    });

    it('should enforce stricter rate limit (10/min) on grading endpoint', async () => {
      const ip = '198.51.100.5';
      const gradeUrl = 'http://localhost:3000/api/submissions/sub-123/grade';

      // Send 10 requests (allowed)
      for (let i = 0; i < RATE_LIMITS.GRADE_ENDPOINT; i++) {
        const req = new NextRequest(gradeUrl, {
          method: 'POST',
          headers: {
            'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0',
            'x-forwarded-for': ip,
          },
        });
        const res = proxy(req);
        expect(res.status).toBe(200);
      }

      // 11th request should be rate-limited (429)
      const req11 = new NextRequest(gradeUrl, {
        method: 'POST',
        headers: {
          'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0',
          'x-forwarded-for': ip,
        },
      });
      const res11 = proxy(req11);
      expect(res11.status).toBe(429);
      const json = await res11.json();
      expect(json.error).toBe('TOO_MANY_REQUESTS');
      expect(res11.headers.get('Retry-After')).toBeDefined();
      expect(res11.headers.get('X-RateLimit-Limit')).toBe(String(RATE_LIMITS.GRADE_ENDPOINT));
      expect(res11.headers.get('X-RateLimit-Remaining')).toBe('0');
    });
  });

  describe('Security Headers', () => {
    it('should inject all required security headers into responses', () => {
      const req = new NextRequest('http://localhost:3000/submissions', {
        headers: {
          'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0',
          'x-forwarded-for': '192.168.100.1',
        },
      });

      const res = proxy(req);
      expect(res.status).toBe(200);

      // Verify all headers specified in requirements
      for (const [headerKey, headerVal] of Object.entries(SECURITY_HEADERS)) {
        expect(res.headers.get(headerKey)).toBe(headerVal);
      }
      expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
      expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
      expect(res.headers.get('X-DNS-Prefetch-Control')).toBe('off');
      expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    });
  });

  describe('getClientIp', () => {
    it('should extract IP from x-forwarded-for first address', () => {
      const req = new NextRequest('http://localhost:3000/', {
        headers: {
          'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178',
        },
      });
      expect(getClientIp(req)).toBe('203.0.113.195');
    });

    it('should extract IP from x-real-ip if x-forwarded-for is missing', () => {
      const req = new NextRequest('http://localhost:3000/', {
        headers: {
          'x-real-ip': '198.51.100.14',
        },
      });
      expect(getClientIp(req)).toBe('198.51.100.14');
    });

    it('should fallback to 127.0.0.1 if no headers present', () => {
      const req = new NextRequest('http://localhost:3000/');
      expect(getClientIp(req)).toBe('127.0.0.1');
    });
  });
});
