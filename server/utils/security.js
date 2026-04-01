/**
 * Security utilities for input validation and sanitization.
 */

/**
 * Validate that a URL is safe to fetch (SSRF protection).
 * Blocks private IPs, localhost, cloud metadata, and non-http(s) protocols.
 * @param {string} urlString
 * @returns {URL} parsed URL if valid
 * @throws {Error} if URL is unsafe
 */
export function validateExternalUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error('Ungültige URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Nur HTTP/HTTPS URLs sind erlaubt');
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost variants
  const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '[::]'];
  if (blockedHosts.includes(hostname)) {
    throw new Error('Lokale URLs sind nicht erlaubt');
  }

  // Block private/reserved IP ranges
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (
      a === 10 ||                              // 10.0.0.0/8
      (a === 172 && b >= 16 && b <= 31) ||     // 172.16.0.0/12
      (a === 192 && b === 168) ||              // 192.168.0.0/16
      a === 127 ||                              // 127.0.0.0/8
      (a === 169 && b === 254) ||              // 169.254.0.0/16 (link-local / cloud metadata)
      a === 0                                   // 0.0.0.0/8
    ) {
      throw new Error('Private/reservierte IP-Adressen sind nicht erlaubt');
    }
  }

  // Block common cloud metadata hostnames
  if (hostname === 'metadata.google.internal' || hostname.endsWith('.internal')) {
    throw new Error('Interne Hostnamen sind nicht erlaubt');
  }

  return parsed;
}

/**
 * Sanitize user input before embedding in LLM prompts.
 * Removes control characters and excessive whitespace that could be used
 * to inject fake system/assistant messages or formatting tricks.
 * @param {string} text
 * @param {number} [maxLength=50000] maximum allowed length
 * @returns {string}
 */
export function sanitizeLlmInput(text, maxLength = 50000) {
  if (typeof text !== 'string') return '';

  return text
    // Remove non-printable control chars (keep newlines, tabs, normal space)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Collapse sequences of >3 newlines
    .replace(/\n{4,}/g, '\n\n\n')
    // Truncate
    .slice(0, maxLength);
}

/**
 * Validate that a string only contains safe characters for use as a filename.
 * @param {string} filename
 * @returns {boolean}
 */
export function isValidFilename(filename) {
  return /^[a-zA-Z0-9_.-]+$/.test(filename) && !filename.includes('..');
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
