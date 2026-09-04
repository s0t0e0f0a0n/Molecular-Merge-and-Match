import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type WarningType = 'atom_count_DBE' | 'double_peak_assignment'

export type WarningResponse = {
  type: WarningType
  warning: boolean
  info: string
}

type WarningsByType = Record<WarningType, WarningResponse>

type WarningContextValue = {
  warningsByType: WarningsByType
  setWarningResult: (warning: WarningResponse) => void
  resetWarnings: () => void
}

const defaultWarnings: WarningsByType = {
  atom_count_DBE: {
    type: 'atom_count_DBE',
    warning: false,
    info: 'Atom count: {} ,DBE: 0',
  },
  double_peak_assignment: {
    type: 'double_peak_assignment',
    warning: false,
    info: '',
  },
}

const WarningContext = createContext<WarningContextValue | undefined>(undefined)

export function WarningProvider({ children }: { children: ReactNode }) {
  const [warningsByType, setWarningsByType] = useState<WarningsByType>(defaultWarnings)

  const setWarningResult = useCallback((warning: WarningResponse) => {
    setWarningsByType(prev => ({
      ...prev,
      [warning.type]: warning,
    }))
  }, [])

  const resetWarnings = useCallback(() => {
    setWarningsByType(defaultWarnings)
  }, [])

  const value = useMemo(
    () => ({ warningsByType, setWarningResult, resetWarnings }),
    [warningsByType, setWarningResult, resetWarnings],
  )

  return (
    <WarningContext.Provider value={value}>
      {children}
    </WarningContext.Provider>
  )
}

export function useWarning() {
  const context = useContext(WarningContext)

  if (!context) {
    throw new Error('useWarning must be used within a WarningProvider')
  }

  return context
}