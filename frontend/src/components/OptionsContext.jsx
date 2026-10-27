import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getOptions } from '../api'
import { ErrorState, Loading } from './ui'

const OptionsContext = createContext(null)

/** Loads the fixed choices (categories, statuses, limits...) from the backend once. */
export function OptionsProvider({ children }) {
  const [options, setOptions] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setError(null)
    getOptions().then(setOptions).catch(setError)
  }, [])

  useEffect(load, [load])

  if (error) {
    return (
      <div className="boot">
        <ErrorState error={error} onRetry={load} />
      </div>
    )
  }
  if (!options) {
    return (
      <div className="boot">
        <Loading label="Connecting to CivicFlow…" />
      </div>
    )
  }
  return <OptionsContext.Provider value={options}>{children}</OptionsContext.Provider>
}

export function useOptions() {
  const value = useContext(OptionsContext)
  if (!value) throw new Error('useOptions must be used inside <OptionsProvider>')
  return value
}
