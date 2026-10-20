/**
 * The icon of «Oye quanela»: the «q» of the wordmark with a voice wave inside. Drawn on lucide's grid (24,
 * stroke 2, round caps) so it sits with the other icons of the top bar and the menus.
 */
export function QuanelaVoiceIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="10.5" r="7.5" />
      <path d="M18.5 10.5V21" />
      <path d="M8 9.5v2M11 7.5v6M14 9.5v2" />
    </svg>
  )
}
