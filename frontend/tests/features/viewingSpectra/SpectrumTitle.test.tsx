import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { SpectrumViewer } from '../../../src/features/viewingSpectra/SpectraPrototype';

// SpectrumViewer fetches the spectrum SVG; stub it to a no-op for these tests.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({ ok: true, text: () => Promise.resolve('<svg></svg>') } as Response),
    ),
  );
});

function commonProps(overrides: Partial<React.ComponentProps<typeof SpectrumViewer>> = {}) {
  return {
    src: '',
    type: 'H' as const,
    peaks: [],
    axisRange: [10, 0] as [number, number],
    ...overrides,
  };
}

/**
 * Regression: switching between exercises with italic-containing solvents used to leave the 
 * previous exercise's italic `<em>` content in the DOM, so a second switch appeared to append
 * the new italic content rather than replace it. The title is now keyed by solvent content 
 * so a different solvent forces React to fully unmount and remount the formatted subtree.
 */
describe('SpectrumViewer title — italic solvent rerender', () => {
  it('replaces italic solvent content cleanly when the prop changes', () => {
    const { container, rerender } = render(
      <SpectrumViewer {...commonProps({ solvent: '/it{Cl}3', frequencyMhz: 300 })} />,
    );

    const html1 = container.innerHTML;
    expect(html1).toMatch(/<em[^>]*>Cl<\/em>/);
    expect(html1).toContain('300 MHz');

    rerender(
      <SpectrumViewer {...commonProps({ solvent: '/it{Br}3', frequencyMhz: 400 })} />,
    );

    const html2 = container.innerHTML;
    // After the switch the title must contain the new content and nothing
    // left over from the previous render.
    expect(html2).toMatch(/<em[^>]*>Br<\/em>/);
    expect(html2).not.toContain('>Cl<');
    expect(html2).toContain('400 MHz');
    expect(html2).not.toContain('300 MHz');
  });

  it('replaces multi-letter italic solvent (e.g. /it{CDCl3}) on switch', () => {
    const { container, rerender } = render(
      <SpectrumViewer {...commonProps({ solvent: '/it{CDCl3}', frequencyMhz: 300 })} />,
    );
    expect(container.innerHTML).toMatch(/<em[^>]*>CDCl<\/em>/);

    rerender(
      <SpectrumViewer {...commonProps({ solvent: '/it{D2O}', frequencyMhz: 300 })} />,
    );

    const html = container.innerHTML;
    expect(html).toMatch(/<em[^>]*>D<\/em>/);
    expect(html).not.toContain('>CDCl<');
  });

  it('replaces plain solvent with italic and back without leftover content', () => {
    const { container, rerender } = render(
      <SpectrumViewer {...commonProps({ solvent: 'CDCl3', frequencyMhz: 300 })} />,
    );
    expect(container.innerHTML).toContain('CDCl');

    rerender(
      <SpectrumViewer {...commonProps({ solvent: '/it{Cl}3', frequencyMhz: 300 })} />,
    );
    expect(container.innerHTML).toMatch(/<em[^>]*>Cl<\/em>/);
    expect(container.innerHTML).not.toContain('>CDCl<');

    rerender(
      <SpectrumViewer {...commonProps({ solvent: 'DMSO', frequencyMhz: 500 })} />,
    );
    const html = container.innerHTML;
    expect(html).toContain('DMSO');
    expect(html).not.toMatch(/<em[^>]*>Cl<\/em>/);
    expect(html).toContain('500 MHz');
    expect(html).not.toContain('300 MHz');
  });
});
