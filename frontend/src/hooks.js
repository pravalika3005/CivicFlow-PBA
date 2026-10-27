import { useCallback, useEffect, useRef, useState } from 'react'

/** Runs an async loader and tracks { data, error, loading }. Ignores stale responses. */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const counter = useRef(0)

  const run = useCallback(() => {
    const ticket = ++counter.current
    setState((previous) => ({ ...previous, error: null, loading: true }))
    loader()
      .then((data) => {
        if (ticket === counter.current) setState({ data, error: null, loading: false })
      })
      .catch((error) => {
        if (ticket === counter.current) setState({ data: null, error, loading: false })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    run()
    return () => {
      counter.current++
    }
  }, [run])

  return { ...state, reload: run }
}

/** Returns `value` only after it has stopped changing for `delay` ms. */
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
