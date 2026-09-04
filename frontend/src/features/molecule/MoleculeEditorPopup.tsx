import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { MoleculeWorkspace, type MoleculeWorkspaceProps, type EditorType } from './MoleculeWorkspace';

const POPUP_WIDTH = 740;
const POPUP_HEIGHT = 580;
const EDGE_GAP = 16;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function _clampAxis(pos: number, gap: number, viewport: number, panel: number) {
  const minPos = Math.min(gap, viewport - panel - gap);
  const maxPos = Math.max(gap, viewport - panel - gap);
  return clamp(pos, minPos, maxPos);
}

function getInitialPosition() {
  if (typeof window === 'undefined') {
    return { x: EDGE_GAP, y: EDGE_GAP };
  }

  const maxX = Math.max(EDGE_GAP, window.innerWidth - POPUP_WIDTH - EDGE_GAP);
  const maxY = Math.max(EDGE_GAP, window.innerHeight - POPUP_HEIGHT - EDGE_GAP);

  return {
    x: clamp(window.innerWidth - POPUP_WIDTH - 24, EDGE_GAP, maxX),
    y: clamp(96, EDGE_GAP, maxY),
  };
}

export function MoleculeEditorPopup(props: MoleculeWorkspaceProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editor, setEditor] = useState<EditorType>('ketcher');
  // Only mount the workspace once the popup has been opened at least once,
  // so we don't eagerly load heavy editors on page load.
  const [hasBeenOpened, setHasBeenOpened] = useState(false);

  // Auto-open when an external edit is requested
  useEffect(() => {
    if (props.editingFragment) {
      setIsOpen(true);
      setHasBeenOpened(true);
    }
  }, [props.editingFragment]);

  // Close the popup and clear parent edit state together
  const handleEditComplete = () => {
    setIsOpen(false);
    props.onEditComplete?.();
  };
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(getInitialPosition);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Keep popup within window bounds on resize (e.g., exiting fullscreen)
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        const width = panelRef.current && panelRef.current.offsetWidth > 0 ? panelRef.current.offsetWidth : POPUP_WIDTH;
        const height = panelRef.current && panelRef.current.offsetHeight > 0 ? panelRef.current.offsetHeight : POPUP_HEIGHT;

        const maxX = Math.max(EDGE_GAP, window.innerWidth - width - EDGE_GAP);
        const maxY = Math.max(EDGE_GAP, window.innerHeight - height - EDGE_GAP);

        return {
          x: clamp(prev.x, EDGE_GAP, maxX),
          y: clamp(prev.y, EDGE_GAP, maxY),
        };
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleToggle = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) setHasBeenOpened(true);
      return next;
    });
  };

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      setPosition({
        x: clamp(event.clientX - dragOffsetRef.current.x, EDGE_GAP, window.innerWidth - 100),
        y: clamp(event.clientY - dragOffsetRef.current.y, EDGE_GAP, window.innerHeight - 50),
      });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging]);

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!panelRef.current) {
      return;
    }

    const rect = panelRef.current.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setIsDragging(true);
    event.preventDefault();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        aria-pressed={isOpen}
        style={{
          padding: '6px 12px',
          borderRadius: 999,
          border: '1px solid #ccc',
          background: isOpen ? '#111' : 'white',
          color: isOpen ? 'white' : '#111',
          cursor: 'pointer',
          fontSize: 13,
          whiteSpace: 'nowrap',
        }}
      >
        {isOpen ? 'Hide molecule editor' : 'Open molecule editor'}
      </button>

      {/* Keep the workspace mounted (but hidden) so the editor canvas state
          is preserved across open / close. Only create it after first open. */}
      {hasBeenOpened && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Molecule editor popup"
          aria-hidden={!isOpen}
          style={{
            position: 'fixed',
            left: position.x,
            top: position.y,
            width: POPUP_WIDTH,
            minWidth: 400,
            height: POPUP_HEIGHT,
            minHeight: 360,
            zIndex: 1100,
            border: '1px solid #ccc',
            borderRadius: 14,
            background: 'white',
            boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
            overflow: 'hidden',
            display: 'flex',
            visibility: isOpen ? 'visible' : 'hidden',
            pointerEvents: isOpen ? 'auto' : 'none',
            opacity: isOpen ? 1 : 0,
            flexDirection: 'column',
            resize: 'both',
          }}
        >
          <div
            data-testid="drag-header"
            onPointerDown={handleDragStart}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '6px 12px',
              borderBottom: '1px solid #e0e0e0',
              background: '#f5f5f5',
              cursor: 'move',
              userSelect: 'none',
              touchAction: 'none',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13 }}>Molecule editor</div>

            <div
              onPointerDown={(event) => event.stopPropagation()}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              {(['ketcher', 'rdkit'] as EditorType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setEditor(type)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 999,
                    border: '1px solid #ccc',
                    background: editor === type
                      ? type === 'ketcher' ? '#c0392b' : '#2980b9'
                      : 'white',
                    color: editor === type ? 'white' : '#111',
                    cursor: 'pointer',
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {type === 'ketcher' ? 'Draw' : 'View'}
                </button>
              ))}
            </div>

            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleEditComplete}
              style={{
                border: '1px solid #ccc',
                borderRadius: 8,
                background: 'white',
                cursor: 'pointer',
                fontSize: 12,
                padding: '4px 8px',
              }}
            >
              Close
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
            <MoleculeWorkspace {...props} onEditComplete={handleEditComplete} editor={editor} onEditorChange={setEditor} />
          </div>
        </div>
      )}
    </>
  );
}
