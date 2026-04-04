export interface ParsedPaymentLink {
  paymentId: string;
  raw: string;
}

export function parsePaymentLink(input: string): ParsedPaymentLink | null {
  const trimmed = input.trim();

  // Try to parse as URL first
  try {
    const url = new URL(trimmed);

    if (url.hostname.includes("walletconnect")) {
      const pid = url.searchParams.get("pid");
      if (pid) return { paymentId: pid, raw: trimmed };

      const id = url.searchParams.get("id") || url.searchParams.get("paymentId");
      if (id) return { paymentId: id, raw: trimmed };

      const segments = url.pathname.split("/").filter(Boolean);
      const lastSegment = segments[segments.length - 1];
      if (lastSegment && lastSegment.length >= 5) {
        return { paymentId: lastSegment, raw: trimmed };
      }
    }
  } catch {
    // Not a URL, try other formats
  }

  // WC deep link: wc:pay?id=...
  const wcMatch = trimmed.match(/wc:pay\?id=([a-zA-Z0-9_-]+)/);
  if (wcMatch) {
    return { paymentId: wcMatch[1], raw: trimmed };
  }

  // Raw payment ID (alphanumeric, at least 10 chars)
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return { paymentId: trimmed, raw: trimmed };
  }

  return null;
}
