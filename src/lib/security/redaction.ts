const SECRET_QUERY_KEYS = new Set([
  'api_key',
  'apikey',
  'key',
  'token',
  'access_token',
]);

export function redactSensitiveText(value: unknown): string {
  let text = value instanceof Error ? value.message : String(value);

  text = text.replace(
    /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi,
    '$1 [REDACTED]'
  );
  text = text.replace(
    /\b(sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{8,})\b/g,
    '[REDACTED]'
  );

  return text.replace(/https?:\/\/[^\s"'<>]+/gi, (rawUrl) => {
    try {
      const url = new URL(rawUrl);
      for (const key of [...url.searchParams.keys()]) {
        if (SECRET_QUERY_KEYS.has(key.toLowerCase())) {
          url.searchParams.set(key, '[REDACTED]');
        }
      }
      url.username = '';
      url.password = '';
      return url.toString();
    } catch {
      return '[REDACTED URL]';
    }
  });
}

