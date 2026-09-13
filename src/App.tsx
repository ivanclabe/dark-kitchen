import { router } from '@/app/routes'
import { AuthProvider } from '@/shared/hooks/useAuth'
import { queryClient } from '@/shared/lib/queryClient'
import { ToastProvider } from '@/shared/ui/Toast'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
