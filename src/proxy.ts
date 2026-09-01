import { NextRequest, NextResponse } from 'next/server';

// Rate limiter configuration constants
const WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUEST_BODY_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

// Rate limits per route category (requests per minute)
export const RATE_LIMITS = {
  GRADE_ENDPOINT: 10, // Stricter rate limit on /api/submissions/*/grade
  API_DEFAULT: 60,    // General API routes
  PAGE_DEFAULT: 120,  // Pages and other routes
} as const;

// In-memory sliding window store: Map<key, number[]>
// Key is e.g. "grade:192.168.1.1", "api:192.168.1.1", "page:192.168.1.1"
const rateLimitStore = new Map<string, number[]>();

// Last cleanup timestamp
let lastCleanupTime = Date.now();
const CLEANUP_INTERVAL_MS = 60 * 1000; // Purge stale records every minute

/**
 * Clean up expired rate limit timestamps to prevent memory leaks
 */
function cleanupRateLimiter(now: number): void {
  if (now - lastCleanupTime < CLEANUP_INTERVAL_MS && rateLimitStore.size < 5000) {
    return;
  }
  lastCleanupTime = now;
  const threshold = now - WINDOW_MS;

  for (const [key, timestamps] of rateLimitStore.entries()) {
    const validTimestamps = timestamps.filter((ts) => ts > threshold);
    if (validTimestamps.length === 0) {
      rateLimitStore.delete(key);
    } else {
      rateLimitStore.set(key, validTimestamps);
    }
  }
}

/**
 * Sliding window rate limit check
 */
export function checkRateLimit(
  key: string,
  limit: number,
  now: number = Date.now()
): { allowed: boolean; limit: number; remaining: number; reset: number } {
  cleanupRateLimiter(now);

  const threshold = now - WINDOW_MS;
  const timestamps = (rateLimitStore.get(key) || []).filter((ts) => ts > threshold);

  if (timestamps.length >= limit) {
    const oldestTimestamp = timestamps[0];
    const resetSeconds = Math.max(1, Math.ceil((oldestTimestamp + WINDOW_MS - now) / 1000));
    return {
      allowed: false,
      limit,
      remaining: 0,
      reset: resetSeconds,
    };
  }

  timestamps.push(now);
  rateLimitStore.set(key, timestamps);

  const resetSeconds = Math.max(1, Math.ceil((timestamps[0] + WINDOW_MS - now) / 1000));
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - timestamps.length),
    reset: resetSeconds,
  };
}

/**
 * Extract client IP address from request headers or socket
 */
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0].trim();
    if (firstIp) return firstIp;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }
  return (request as unknown as { ip?: string }).ip || '127.0.0.1';
}

// Known malicious scanner / bot signatures
const SUSPICIOUS_UA_PATTERNS = [
  'sqlmap',
  'nikto',
  'wpscan',
  'masscan',
  'acunetix',
  'nmap',
  'nessus',
  'dirbuster',
  'gobuster',
  'hydra',
  'zgrab',
  'burpcollaborator',
  'shodan',
  'censys',
  'havij',
  'openvas',
  'whatweb',
  'metasploit',
  'qualys',
  'netsparker',
];

/**
 * Checks if a user-agent string is empty or belongs to a known scanner
 */
export function isSuspiciousUserAgent(userAgent: string | null): boolean {
  if (!userAgent || userAgent.trim() === '') {
    return true; // Block empty or whitespace User-Agents
  }

  const lowerUa = userAgent.toLowerCase();
  return SUSPICIOUS_UA_PATTERNS.some((pattern) => lowerUa.includes(pattern));
}

/**
 * Standard Security Headers
 */
export const SECURITY_HEADERS: Record<string, string> = {
  // Content Security Policy
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' http://localhost:4000 http://127.0.0.1:4000 ws: wss:; frame-ancestors 'none'; form-action 'self';",
  // Clickjacking prevention
  'X-Frame-Options': 'DENY',
  // MIME type sniffing prevention
  'X-Content-Type-Options': 'nosniff',
  // Referrer Policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Restrict sensitive browser features
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  // HTTP Strict Transport Security
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  // Disable DNS prefetching
  'X-DNS-Prefetch-Control': 'off',
  // Legacy XSS protection for older browsers
  'X-XSS-Protection': '1; mode=block',
  // Isolate browsing context
  'Cross-Origin-Opener-Policy': 'same-origin',
};

/**
 * Applies security headers to any outgoing response
 */
function applySecurityHeaders(response: NextResponse | Response): void {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
}

/**
 * Checks if a request path matches the grading endpoint (/api/submissions/:id/grade)
 */
function isGradeEndpoint(pathname: string): boolean {
  return /^\/api\/submissions\/[^/]+\/grade\/?$/i.test(pathname);
}

/**
 * Next.js 16 Security Proxy Handler
 * Replaces middleware.ts in Next.js 16
 */
export function proxy(request: NextRequest): NextResponse | Response {
  const { pathname } = request.nextUrl;
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent');
  const origin = request.headers.get('origin');
  const method = request.method;

  // 1. Block Suspicious or Empty User-Agents
  if (isSuspiciousUserAgent(userAgent)) {
    const response = NextResponse.json(
      {
        error: 'FORBIDDEN',
        message: 'Access denied: suspicious or blocked user agent.',
      },
      { status: 403 }
    );
    applySecurityHeaders(response);
    return response;
  }

  // 2. Request Body Size Limit (Content-Length check: reject >15MB)
  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader) {
    const contentLength = parseInt(contentLengthHeader, 10);
    if (!isNaN(contentLength) && contentLength > MAX_REQUEST_BODY_SIZE_BYTES) {
      const response = NextResponse.json(
        {
          error: 'PAYLOAD_TOO_LARGE',
          message: 'Request entity exceeds maximum allowable size of 15MB.',
        },
        { status: 413 }
      );
      applySecurityHeaders(response);
      return response;
    }
  }

  // 3. CORS Enforcement for API routes (Only same-origin allowed)
  const isApiRoute = pathname.startsWith('/api/') || pathname === '/api';
  if (isApiRoute && origin) {
    const requestOrigin = request.nextUrl.origin;
    const isSameOrigin = origin === requestOrigin;

    // Reject cross-origin API requests
    if (!isSameOrigin) {
      const response = NextResponse.json(
        {
          error: 'CORS_FORBIDDEN',
          message: 'Cross-origin requests are not allowed.',
        },
        { status: 403 }
      );
      applySecurityHeaders(response);
      return response;
    }

    // Handle preflight OPTIONS request for same-origin API calls
    if (method === 'OPTIONS') {
      const preflightResponse = new NextResponse(null, { status: 204 });
      preflightResponse.headers.set('Access-Control-Allow-Origin', origin);
      preflightResponse.headers.set(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, PATCH, DELETE, OPTIONS'
      );
      preflightResponse.headers.set(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With'
      );
      preflightResponse.headers.set('Access-Control-Allow-Credentials', 'true');
      preflightResponse.headers.set('Access-Control-Max-Age', '86400');
      applySecurityHeaders(preflightResponse);
      return preflightResponse;
    }
  }

  // 4. Rate Limiting (In-Memory Sliding Window)
  let rateLimitResult: ReturnType<typeof checkRateLimit>;

  if (isGradeEndpoint(pathname)) {
    // 10 requests per minute on grading endpoint
    rateLimitResult = checkRateLimit(`grade:${ip}`, RATE_LIMITS.GRADE_ENDPOINT);
  } else if (isApiRoute) {
    // 60 requests per minute for API routes
    rateLimitResult = checkRateLimit(`api:${ip}`, RATE_LIMITS.API_DEFAULT);
  } else {
    // 120 requests per minute for pages
    rateLimitResult = checkRateLimit(`page:${ip}`, RATE_LIMITS.PAGE_DEFAULT);
  }

  if (!rateLimitResult.allowed) {
    const response = NextResponse.json(
      {
        error: 'TOO_MANY_REQUESTS',
        message: 'Rate limit exceeded. Please try again later.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.reset),
          'X-RateLimit-Limit': String(rateLimitResult.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(rateLimitResult.reset),
        },
      }
    );
    applySecurityHeaders(response);
    return response;
  }

  // 5. Normal Request Continuation with Security & Rate Limit Headers
  const response = NextResponse.next();

  // Apply Security Headers
  applySecurityHeaders(response);

  // Apply Rate Limit informational headers
  response.headers.set('X-RateLimit-Limit', String(rateLimitResult.limit));
  response.headers.set('X-RateLimit-Remaining', String(rateLimitResult.remaining));
  response.headers.set('X-RateLimit-Reset', String(rateLimitResult.reset));

  // If same-origin API route with Origin header, set CORS response headers
  if (isApiRoute && origin && origin === request.nextUrl.origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return response;
}

/**
 * Proxy Matcher Config
 * Matches all application routes excluding static assets, next internal files, and favicon/icons
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.jpg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
