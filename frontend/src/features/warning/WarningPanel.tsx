//import { useEffect } from 'react'
import { useWarning } from '../../context/WarningContext'
import atomCountIcon from './atom_count.svg'
import doubleAssignmentIcon from './double_assignment.svg'

export default function WarningPanel() {
  const { warningsByType } = useWarning()

  const atom_count_DBE_Warning = warningsByType.atom_count_DBE
  const double_peak_assignment_Warning = warningsByType.double_peak_assignment
  const hasWarnings = atom_count_DBE_Warning.warning || double_peak_assignment_Warning.warning

  if (!hasWarnings) {
    return null
  }

  //useEffect(() => {
  //  console.log('WarningPanel received warningsByType:', warningsByType)
  //}, [warningsByType])

  return (
    <div
      style={{
        padding: '2px 12px',
        borderRadius: 8,
        border: 'none',
        color: '#222',
        fontSize: 12,
        width: 64,
        minHeight: 32,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {/*{atom_count_DBE_Warning?.info}*/}
      {atom_count_DBE_Warning.warning && (
      <span
        title="Too many atoms or too many double bond equivalents are currently linked to the spectra."
        style={{ cursor: 'help', display: 'inline-flex' }}
      >
        <img
          src={atomCountIcon}
          alt="Atom count warning"
          style={{ width: 32, height: 32 }}
        />
      </span>
      )}

        <span
          title="At least one peak is assigned to multiple fragments."
          style={{ cursor: 'help', display: 'inline-flex' }}
        >
          <img
            src={doubleAssignmentIcon}
            alt="Double assignment warning"
            style={{ width: 32, height: 32 }}
          />
        </span>
      
    </div>
  )
}