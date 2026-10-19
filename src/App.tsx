import { router } from '@/app/routes'
import { BrandIntro } from '@/shared/brand/BrandIntro'
import { AuthProvider } from '@/shared/hooks/useAuth'
import { queryClient } from '@/shared/lib/queryClient'
import { TenantProvider } from '@/shared/tenant/TenantProvider'
import { ToastProvider } from '@/shared/ui/Toast'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          {/* The organization of the subdomain, resolved once for the whole app (ADR 0021). */}
          <TenantProvider>
            <RouterProvider router={router} />
          </TenantProvider>
          {/* Over everything, once, right after signing in (ADR 0070). */}
          <BrandIntro />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
