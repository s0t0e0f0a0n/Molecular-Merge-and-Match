import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTags } from '../../../src/api/tags';
import { SettingsPanel } from '../../../src/features/settings/SettingsPanel';

vi.mock('../../../src/api/tags', () => ({
  fetchTags: vi.fn(),
  deleteTag: vi.fn(),
  restoreTag: vi.fn(),
  setTagHidden: vi.fn(),
  setTagStatistics: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderSettingsPanel(cheatBits: string) {
  render(
    <SettingsPanel
      isOpen
      onClose={vi.fn()}
      linkInheritMode="none"
      onLinkInheritModeChange={vi.fn()}
      selectedTheme="Light"
      selectedPreset="User"
      availablePresets={['User']}
      onPresetChange={vi.fn()}
      showTimer
      onShowTimerChange={vi.fn()}
      showCASValidation
      onShowCASValidationChange={vi.fn()}
      showWarnings
      onShowWarningsChange={vi.fn()}
      showSolventText
      onShowSolventTextChange={vi.fn()}
      showExchangeText
      onShowExchangeTextChange={vi.fn()}
      showFormula
      onShowFormulaChange={vi.fn()}
      showIntegralCurves
      onShowIntegralCurvesChange={vi.fn()}
      showMissingText
      onShowMissingTextChange={vi.fn()}
      showCreation={false}
      onShowCreationChange={vi.fn()}
      showApt={false}
      onShowAptChange={vi.fn()}
      showSource={false}
      onShowSourceChange={vi.fn()}
      showTags
      onShowTagsChange={vi.fn()}
      enableDelete={false}
      onEnableDeleteChange={vi.fn()}
      srMode={false}
      onSrModeChange={vi.fn()}
      cheatBits={cheatBits}
      onCheatBitsChange={vi.fn()}
      solvents={[]}
      solventsLoading={false}
      onSolventPreferenceChange={vi.fn()}
    />,
  );
}

describe('SettingsPanel cheat tags', () => {
  it('groups settings into Function and Appearance categories after the preset', () => {
    renderSettingsPanel('000000000000');

    expect(screen.getByLabelText('Presets')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Function' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByLabelText('Theme')).toBeDisabled();
    expect(screen.getByText('Show molecular formula')).toBeInTheDocument();
    expect(screen.getByText('Show Integral Curves')).toBeInTheDocument();
  });

  it('keeps a non-hideable tag unchecked when its database record is hidden', async () => {
    vi.mocked(fetchTags).mockResolvedValue([
      {
        id: 1,
        tag_name: 'cyclic',
        description: null,
        is_persistent: false,
        is_hideable: false,
        is_hidden: true,
        is_cheat: true,
        tag_count: 1,
        user_tag: false,
        allowed_stats: false,
        progression_use: false,
      },
    ]);

    renderSettingsPanel('100000001000');

    await userEvent.setup().click(screen.getByRole('button', { name: /tags/i }));

    expect(await screen.findByRole('checkbox', { name: 'Show tag cyclic' })).not.toBeChecked();
  });

  it('hides cheat tags when cheats are disabled even if the cheat-tag bit remains set', async () => {
    vi.mocked(fetchTags).mockResolvedValue([
      {
        id: 1,
        tag_name: 'cyclic',
        description: null,
        is_persistent: false,
        is_hideable: false,
        is_hidden: false,
        is_cheat: true,
        tag_count: 1,
        user_tag: false,
        allowed_stats: false,
        progression_use: false,
      },
    ]);

    renderSettingsPanel('000000001000');
    await userEvent.setup().click(screen.getByRole('button', { name: /tags/i }));

    expect(await screen.findByText('Tag name')).toBeInTheDocument();
    expect(screen.queryByText('cyclic')).not.toBeInTheDocument();
  });
});
