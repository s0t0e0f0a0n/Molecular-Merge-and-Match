import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoleculeEditorPopup } from '../../../src/features/molecule/MoleculeEditorPopup';

const defaultProps = {
  onCreateFragment: vi.fn(async () => 1),
  onUpdateFragment: vi.fn(async () => true),
};

describe('MoleculeEditorPopup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens a resizable popup window', async () => {
    const user = userEvent.setup();
    render(<MoleculeEditorPopup {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /Open molecule editor/ }));

    const dialog = screen.getByRole('dialog', { name: /Molecule editor popup/ });
    expect(dialog).toHaveStyle({ resize: 'both' });
    expect(await screen.findByText(/Molecule editor/)).toBeInTheDocument();
  });

  it('can be dragged beyond the page boundaries', async () => {
    const user = userEvent.setup();
    render(<MoleculeEditorPopup {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /Open molecule editor/ }));
    await screen.findByText(/Molecule editor/);

    const dialog = screen.getByRole('dialog', { name: /Molecule editor popup/ });
    const header = screen.getByTestId('drag-header');
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 100,
      left: 100,
      top: 100,
      right: 960,
      bottom: 820,
      width: 860,
      height: 720,
      toJSON: () => ({}),
    } as DOMRect);
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    try {
      const pointerDownEvent = new Event('pointerdown', { bubbles: true, cancelable: true }) as PointerEvent;
      Object.defineProperty(pointerDownEvent, 'clientX', { value: 120 });
      Object.defineProperty(pointerDownEvent, 'clientY', { value: 130 });
      await act(async () => {
        header.dispatchEvent(pointerDownEvent);
      });

      await waitFor(() => {
        expect(addEventListenerSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
      });

      const pointerMoveHandler = addEventListenerSpy.mock.calls.find(([type]) => type === 'pointermove')?.[1];
      expect(pointerMoveHandler).toEqual(expect.any(Function));

      await act(async () => {
        (pointerMoveHandler as (event: PointerEvent) => void)({
          clientX: -50,
          clientY: -20,
        } as PointerEvent);
      });

      await waitFor(() => {
        expect(dialog).toHaveStyle({ left: '16px', top: '16px' });
      });
    } finally {
      rectSpy.mockRestore();
      addEventListenerSpy.mockRestore();
    }
  });
});
