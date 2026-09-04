import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ApiAdditionalSpectrum } from '../../api/exercises'
import { forceSvgFontFamily, isSvgPath } from './svgFontOverride'

type ViewMode = 'fit' | 'scroll'

interface Props {
  spectra: ApiAdditionalSpectrum[]
}

function tabLabel(spectrum: ApiAdditionalSpectrum, index: number): string {
  return spectrum.label ?? `Spectrum ${index + 1}`
}

function getSpectrumSortName(spectrum: ApiAdditionalSpectrum): string {
  return (spectrum.label ?? spectrum.file_path ?? '').toLocaleLowerCase()
}

function compareSpectra(left: ApiAdditionalSpectrum, right: ApiAdditionalSpectrum): number {
  const leftPriority = left.priority ?? 0
  const rightPriority = right.priority ?? 0

  if (leftPriority !== 0 && rightPriority !== 0) {
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority
    }
  } else if (leftPriority === 0 && rightPriority !== 0) {
    return 1
  } else if (leftPriority !== 0 && rightPriority === 0) {
    return -1
  }

  const sortNameComparison = getSpectrumSortName(left).localeCompare(getSpectrumSortName(right), undefined, {
    sensitivity: 'base',
  })

  if (sortNameComparison !== 0) {
    return sortNameComparison
  }

  return left.id - right.id
}

export function AdditionalSpectraPopup({ spectra }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [viewMode, setViewMode] = useState<ViewMode>('fit')
  const [zoom, setZoom] = useState(1.2)
  const [activeSvgContent, setActiveSvgContent] = useState<string>('')

  const hasSpectra = spectra.length > 0
  const sortedSpectra = [...spectra].sort(compareSpectra)
  const safeTab = hasSpectra ? Math.min(activeTab, sortedSpectra.length - 1) : 0
  const active = hasSpectra ? sortedSpectra[safeTab] : null
  const activeFilePath = active?.file_path ?? ''
  const activeIsSvg = isSvgPath(activeFilePath)
  const useInlineSvg = activeIsSvg;
  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.2, 10))
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.2, 1))

  function open() {
    setActiveTab(0)
    setIsOpen(true)
  }

  useEffect(() => {
    if (!isOpen || !useInlineSvg || !activeFilePath) {
      setActiveSvgContent('')
      return
    }

    let cancelled = false

    fetch(activeFilePath)
      .then((res) => res.text())
      .then((text) => {
        if (cancelled) return

        const processed = forceSvgFontFamily(text, { forceFill: true })
          .replace(/<title[\s\S]*?<\/title>/gi, '')
          .replace(/<desc[\s\S]*?<\/desc>/gi, '')
          .replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
          .replace(/\s+title="[^"]*"/gi, '')
          .replace(/\s+data-name="[^"]*"/gi, '')

        setActiveSvgContent(processed)
      })
      .catch((err) => {
        console.error('Failed to load additional spectrum SVG', err)
        if (!cancelled) {
          setActiveSvgContent('')
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeFilePath, isOpen, useInlineSvg])

  if (!hasSpectra || !active) return null

  return (
    <>
      <button
        type="button"
        onClick={open}
        style={{
          padding: '4px 12px',
          borderRadius: 8,
          border: '1px solid #ccc',
          background: 'white',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Additional Spectra
      </button>

      {isOpen && createPortal(
        <div
          style={{
            fontFamily: 'var(--font-ui)',
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 40,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false) }}
        >
          <div
            style={{
              width: '95%',
              background: 'white',
              borderRadius: 12,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            }}
          >
            {/* Tab bar + controls + close — single row */}
            <div
              style={{
                display: 'flex',

                alignItems: 'stretch',
                borderBottom: '1px solid #eee',
                background: '#f9f9f9',
                flexShrink: 0,
                paddingRight: '12px',
                paddingLeft: '12px',
                paddingTop: '2px',
                paddingBottom: '2px',
                gap: 4,
              }}
            >
              {/* Tabs */}
              {sortedSpectra.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveTab(i)}
                  style={{
                    padding: '10px 16px',
                    border: 'none',
                    borderBottom: i === safeTab ? '2px solid #111' : '2px solid transparent',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: i === safeTab ? 700 : 400,
                    color: i === safeTab ? '#111' : '#555',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tabLabel(s, i)}
                </button>
              ))}

              {/* Right-side controls */}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 8 }}>
                {/* Fit / Scroll toggle */}
                <div style={{ display: 'flex', background: '#eee', borderRadius: 6, padding: 2 }}>
                  <button
                    type="button"
                    onClick={() => setViewMode('fit')}
                    style={{
                      border: 'none',
                      background: viewMode === 'fit' ? 'white' : 'transparent',
                      boxShadow: viewMode === 'fit' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      borderRadius: 4,
                      padding: '4px 8px',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Fit
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('scroll')}
                    style={{
                      border: 'none',
                      background: viewMode === 'scroll' ? 'white' : 'transparent',
                      boxShadow: viewMode === 'scroll' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      borderRadius: 4,
                      padding: '4px 8px',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Scroll
                  </button>
                </div>

                {/* Zoom controls — only active in scroll mode */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: viewMode === 'scroll' ? 1 : 0.4 }}>
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    disabled={viewMode !== 'scroll'}
                    style={{
                      border: '1px solid #ccc',
                      borderRadius: 4,
                      width: 24,
                      height: 24,
                      cursor: viewMode === 'scroll' ? 'pointer' : 'default',
                      background: 'white',
                    }}
                  >
                    -
                  </button>
                  <span style={{ fontSize: 12, minWidth: 36, textAlign: 'center' }}>
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    disabled={viewMode !== 'scroll'}
                    style={{
                      border: '1px solid #ccc',
                      borderRadius: 4,
                      width: 24,
                      height: 24,
                      cursor: viewMode === 'scroll' ? 'pointer' : 'default',
                      background: 'white',
                    }}
                  >
                    +
                  </button>
                </div>

                {/* Close */}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  style={{
                    padding: '4px 10px',
                    border: '1px solid #ccc',
                    borderRadius: 4,
                    background: 'white',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Spectrum image — 2.5:1 ratio, scrollable in scroll mode SvdV: alignSelf added, only relevant when width<100%, changed aspectratio,changed height in img style*/}
            <div
              style={{
                width: '98.5%',
                alignSelf: 'center',
                aspectRatio: '5 / 2',
                overflow: viewMode === 'scroll' ? 'auto' : 'hidden',
              }}
            >
              {useInlineSvg ? (
                activeSvgContent ? (
                  <div
                    key={`${active.file_path}:inline`}
                    style={{
                      display: 'block',
                      width: viewMode === 'fit' ? '100%' : `${zoom * 100}%`,
                      height: viewMode === 'fit' ? '100%' : 'auto',
                      minWidth: '100%',
                      padding: 7,
                      boxSizing: 'border-box',
                    }}
                    dangerouslySetInnerHTML={{ __html: activeSvgContent }}
                  />
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%',
                      height: '100%',
                      color: '#666',
                      fontSize: 13,
                    }}
                  >
                    Loading SVG...
                  </div>
                )
              ) : (
                <img
                  key={active.file_path}
                  src={active.file_path}
                  alt={tabLabel(active, safeTab)}
                  style={{
                    display: 'block',
                    width: viewMode === 'fit' ? '100%' : `${zoom * 100}%`,
                    height: viewMode === 'fit' ? '100%' : 'auto',
                    padding: 7,
                    objectFit: viewMode === 'fit' ? 'contain' : undefined,
                    minWidth: '100%',
                  }}
                />
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
