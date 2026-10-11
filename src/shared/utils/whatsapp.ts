/**
 * A WhatsApp link (wa.me): to a number (E.164, «+57 300…») or, without one,
 * the share sheet with the text ready. One helper for the whole app (ADR 0052).
 */
export function whatsappLink(phone: string | null | undefined, text: string): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  const query = text ? `?text=${encodeURIComponent(text)}` : ''
  return digits ? `https://wa.me/${digits}${query}` : `https://wa.me/${query}`
}
