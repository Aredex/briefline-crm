/*
 * TanStack Query provider — single client, production defaults.
 * staleTime 30s / gcTime 5min / retry 1 (PH-07 acceptance criteria).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

interface QueryProviderProps {
  children: ReactNode
  /** Tests inject a fresh client; production uses the module-level defaults. */
  client?: QueryClient
}

export function QueryProvider({ children, client }: QueryProviderProps) {
  const [defaultClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 300_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  )
  return <QueryClientProvider client={client ?? defaultClient}>{children}</QueryClientProvider>
}
