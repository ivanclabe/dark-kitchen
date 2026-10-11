import { lazy, Suspense } from 'react'

// ADR 0052: the public menu and order tracking are loaded apart (outside the app).
const PublicMenuPage = lazy(() => import('./PublicMenuPage').then((m) => ({ default: m.PublicMenuPage })))
const OrderTrackingPage = lazy(() => import('./OrderTrackingPage').then((m) => ({ default: m.OrderTrackingPage })))
const fallback = <div className="min-h-screen bg-stone-50" />

export function PublicMenuRoute() {
  return (
    <Suspense fallback={fallback}>
      <PublicMenuPage />
    </Suspense>
  )
}

export function OrderTrackingRoute() {
  return (
    <Suspense fallback={fallback}>
      <OrderTrackingPage />
    </Suspense>
  )
}
