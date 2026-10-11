import qrcode from 'qrcode-generator'
import { contrastRatio } from './themes'

/**
 * A QR of a link, as an SVG data URL (sharp when printed). It can take the
 * brand color (ADR 0053) when that color still reads well on white;
 * otherwise it stays black so phones always scan it.
 */
export function qrSvgDataUrl(text: string, color = '#000000'): string {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const ink = /^#[0-9A-Fa-f]{6}$/.test(color) && contrastRatio(color, '#FFFFFF') >= 4.5 ? color : '#000000'
  const svg = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true }).replace('fill="black"', `fill="${ink}"`)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
