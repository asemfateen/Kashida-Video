import { useSyncExternalStore } from 'react'
import { isOnline, subscribeBackend } from './api'

// Reactive backend connectivity — re-renders the component when the backend
// goes online/offline (tracked from the results of real API calls).
export function useBackendOnline(): boolean {
  return useSyncExternalStore(subscribeBackend, isOnline, isOnline)
}