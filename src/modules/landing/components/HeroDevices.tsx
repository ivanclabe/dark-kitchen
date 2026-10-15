
/**
 * Real captures of the app (fictional data on the local test stack; how to redo them: docs/brand/capturas-landing.mjs
 * and seed-capturas-landing.sql). Decorative: the hero text says what they show.
 */
const BOARD = '/brand/app-tablero.webp'
const MENU = '/brand/app-menu.webp'

/** A laptop with the operations center, as it looks. */
export function LaptopMockup({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <div className="rounded-t-[1.4rem] bg-[#1F1B19] p-[1.6%] shadow-[0_40px_80px_-30px_rgba(124,45,18,0.55)]">
        <img src={BOARD} alt="" width={1920} height={1200} decoding="async" className="block aspect-[16/10] w-full rounded-md bg-neutral-950 object-cover object-top" />
      </div>
      <div className="mx-[-4%] h-3 rounded-b-xl bg-[linear-gradient(#D6D3D1,#A8A29E)] sm:h-4" />
    </div>
  )
}

/**
 * A phone with the public menu of a business, as its customers see it. The bezel is drawn with insets of the
 * phone itself (a padding in % would follow the parent's width and make it uneven): 4 % of the width on every
 * side, the screen with the capture's own 1:2 proportion (nothing is cropped) and corner radii in proportion,
 * so it stays symmetric at any size.
 */
export function PhoneMockup({ className }: { className?: string }) {
  return (
    // `className` places the phone (it may be absolute); the frame inside keeps its own relative box.
    <div className={className} aria-hidden>
      <div className="relative aspect-[1/1.92] rounded-[17%/8.85%] bg-[#1F1B19] shadow-[0_30px_60px_-20px_rgba(124,45,18,0.6)] ring-1 ring-black/40">
        <div className="absolute inset-x-[4%] inset-y-[2.083%] overflow-hidden rounded-[14.1%/7.07%] bg-white">
          <img src={MENU} alt="" width={780} height={1560} decoding="async" className="block size-full object-cover object-top" />
          {/* The camera island, centered on the screen. */}
          <span className="absolute top-[1.6%] left-1/2 h-[3.4%] w-[30%] -translate-x-1/2 rounded-full bg-black/90" />
        </div>
      </div>
    </div>
  )
}
