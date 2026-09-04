import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

const editorSpy = vi.fn();

vi.mock('ketcher-react', () => ({
  Editor: (props: unknown) => {
    editorSpy(props);
    return null;
  },
}));

vi.mock('ketcher-standalone', () => ({
  StandaloneStructServiceProvider: class StandaloneStructServiceProvider {},
}));

import KetcherEditor from '../../src/components/KetcherEditor';

describe('KetcherEditor smoke', () => {
  it('passes restricted toolbar config and disables macromolecules mode', () => {
    render(<KetcherEditor onExportFragment={vi.fn()} /> as ReactElement);

    expect(editorSpy).toHaveBeenCalled();

    const props = editorSpy.mock.calls[0][0] as {
      disableMacromoleculesEditor?: boolean;
      buttons?: Record<string, { hidden?: boolean }>;
    };

    expect(props.disableMacromoleculesEditor).toBe(true);

    // Requested removals
    expect(props.buttons?.arom?.hidden).toBe(true);
    expect(props.buttons?.dearom?.hidden).toBe(true);
    expect(props.buttons?.clean?.hidden).toBe(true);
    expect(props.buttons?.cip?.hidden).toBe(true);
    expect(props.buttons?.miew?.hidden).toBe(true);

    // Keep only single/double/triple bond tools.
    expect(props.buttons?.['bond-stereo']?.hidden).toBe(true);
    expect(props.buttons?.['bond-aromatic']?.hidden).toBe(true);
    expect(props.buttons?.['bond-any']?.hidden).toBe(true);

    // Explicitly removed buttons.
    expect(props.buttons?.['create-monomer']?.hidden).toBe(true);
    expect(props.buttons?.images?.hidden).toBe(true);
  });
});

