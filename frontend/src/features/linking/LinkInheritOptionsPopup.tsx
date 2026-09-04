import { useState } from 'react';
import ReactDOM from 'react-dom';

export type LinkInheritMode = 'none' | 'transfer' | 'copy';

const options: { value: LinkInheritMode; label: string; description?: string }[] = [
  {
    value: 'none',
    label: "Merged product won't inherit links.",
  },
  {
    value: 'transfer',
    label: 'Links will be transfered to merged product.',
  },
  {
    value: 'copy',
    label: 'Fragments keep their links, merged also inherits links.',
    description: 'This can make it easier to see which fragment was linked to which peak. Warnings from the working fragments are turned off because the same peaks and atoms can be counted multiple times in this mode. The warnings for the working solution are still active.',
  },
];

export function LinkInheritOptionsPopup({
  value,
  onChange,
}: {
  value: LinkInheritMode;
  onChange: (value: LinkInheritMode) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          padding: '4px 8px',
          borderRadius: 6,
          border: '1px solid #ccc',
          background: 'white',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        Options
      </button>

      {isOpen &&
        ReactDOM.createPortal(
          <div
            role="dialog"
            aria-label="Link inherit options"
            style={{
              fontFamily: 'system-ui, sans-serif',  
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.4)',
            }}
          >
            <div
              style={{
                background: 'white',
                borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                padding: 24,
                minWidth: 340,
                maxWidth: 520,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                Link inherit options
              </div>

              <div style={{ fontSize: 13, color: '#555' }}>
                Choose what should happen with fragment links after merging two fragments.
              </div>

              {options.map((option) => (
                <label
                  key={option.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #e0e0e0',
                    background: value === option.value ? '#eeeeee' : '#fafafa',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  <input
                      type="radio"
                      name="link-inherit-mode"
                      checked={value === option.value}
                      onChange={() => onChange(option.value)}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span>{option.label}</span>
                      {option.description && (
                        <span style={{ fontSize: 12, color: '#666' }}>
                          {option.description}
                        </span>
                      )}
                    </div>
                </label>
              ))}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  style={{
                    padding: '6px 16px',
                    borderRadius: 8,
                    border: '1px solid #2196F3',
                    background: '#2196F3',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}