import { useEffect, useRef, useState } from 'react';
import { useHistory, describeEntry } from '../../context/HistoryContext';

export function LogbookPanel() {
  const { entries, cursor, canUndo, canRedo, undo, redo, jumpTo, clearHistory } = useHistory();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const totalSteps = entries.length;

  // Close the logbook when the user clicks anywhere outside of it.
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div
      ref={panelRef}
      style={{
        borderRadius: 12,
        border: '1px solid #ddd',
        background: 'white',
        padding: 8,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          onClick={() => void undo()}
          disabled={!canUndo}
          title="Undo (last action)"
          style={btnStyle(canUndo)}
        >
          {'\u2190'} Undo
        </button>
        <button
          type="button"
          onClick={() => void redo()}
          disabled={!canRedo}
          title="Redo"
          style={btnStyle(canRedo)}
        >
          {'\u2192'} Redo
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{
            ...btnStyle(true),
            marginLeft: 'auto',
            background: open ? '#111' : 'white',
            color: open ? 'white' : '#111',
          }}
          title={open ? 'Hide logbook' : 'Show logbook'}
        >
          Logbook ({cursor}/{totalSteps}) {open ? '▴' : '▾'}
        </button>
      </div>

      {open && (
        <div
          style={{
            maxHeight: 220,
            overflowY: 'auto',
            border: '1px solid #eee',
            borderRadius: 8,
            background: '#fafafa',
          }}
        >
          {entries.length === 0 ? (
            <div style={{ padding: 8, fontSize: 12, opacity: 0.6 }}>
              No actions yet. Make a change to start the logbook.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {entries.map((entry, i) => {
                const stepIndex = i + 1; // 1-based
                const isCurrent = stepIndex === cursor;
                const isFuture = stepIndex > cursor;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => void jumpTo(stepIndex)}
                      title={`Jump to step ${stepIndex}`}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 10px',
                        border: 'none',
                        borderBottom: '1px solid #eee',
                        background: isCurrent ? '#e3f2fd' : 'transparent',
                        color: isFuture ? '#888' : '#111',
                        cursor: 'pointer',
                        fontSize: 12,
                        display: 'flex',
                        gap: 8,
                        alignItems: 'baseline',
                      }}
                    >
                      <span style={{ fontWeight: 600, minWidth: 24 }}>{stepIndex}.</span>
                      <span style={{ flex: 1 }}>{describeEntry(entry)}</span>
                      <span style={{ fontSize: 10, opacity: 0.5 }}>
                        {new Date(entry.ts).toLocaleTimeString()}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {entries.length > 0 && (
            <div style={{ padding: 6, borderTop: '1px solid #eee', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      'Clear the logbook for this exercise? This removes all undo/redo history forever.',
                    )
                  ) {
                    clearHistory();
                  }
                }}
                style={{ ...btnStyle(true), fontSize: 11 }}
                title="Clear logbook (does not undo any actions)"
              >
                Clear logbook
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function btnStyle(enabled: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid #ccc',
    background: 'white',
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontSize: 12,
    opacity: enabled ? 1 : 0.5,
  };
}