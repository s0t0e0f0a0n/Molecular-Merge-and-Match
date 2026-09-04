import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import ChangelogMD from '../../CHANGELOG.md?raw';
import { DEFAULT_CHEATS, normalizeCheatBits } from '../../hooks/useCheating';
import type { SolventPreference } from '../../api/solvents';
import type { LinkInheritMode } from '../linking/LinkInheritOptionsPopup';
import { formatChemistryText } from '../../utils/formatChemistryText';
import './settingsStyles.css';
import { fetchTags, deleteTag, restoreTag, setTagHidden, Tag } from '../../api/tags';

type SettingsTabId = 'settingstab' | 'solventstab' | 'tagstab' | 'cheatstab' | 'informationtab' | 'changelogtab' | 'abouttab';

type SettingsPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  linkInheritMode: LinkInheritMode;
  onLinkInheritModeChange: (value: LinkInheritMode) => void;
  selectedTheme: string;
  availableThemes: string[];
  onThemeChange: (value: string) => void;
  selectedPreset: string;
  availablePresets: string[];
  onPresetChange: (value: string) => void;
  showTimer: boolean;
  onShowTimerChange: (value: boolean) => void;
  showCASValidation: boolean;
  onShowCASValidationChange: (value: boolean) => void;
  showWarnings: boolean;
  onShowWarningsChange: (value: boolean) => void;
  showSolventText: boolean;
  onShowSolventTextChange: (value: boolean) => void;
  showExchangeText: boolean;
  onShowExchangeTextChange: (value: boolean) => void;
  showMissingText: boolean;
  onShowMissingTextChange: (value: boolean) => void;
  showCreation: boolean;
  onShowCreationChange: (value: boolean) => void;
  cheatBits: string;
  onCheatBitsChange: (value: string) => void;
  solvents: SolventPreference[];
  solventsLoading: boolean;
  onSolventPreferenceChange: (solventId: number, preference: number) => void;
  onTagsUpdated?: () => void;
};

type ToggleRowProps = {
  id: string;
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title?: string;
  disabled?: boolean;
};

type SelectOption = {
  value: string;
  label: string;
  title?: string;
};

type SelectRowProps = {
  id: string;
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  title?: string;
};

const TABS: Array<{ id: SettingsTabId; label: string }> = [
  { id: 'settingstab', label: 'Settings' },
  { id: 'solventstab', label: 'Solvents' },
  { id: 'tagstab', label: 'Tags' },
  { id: 'cheatstab', label: 'Cheats' },
  { id: 'informationtab', label: 'Information' },
  { id: 'changelogtab', label: 'Changelog' },
  { id: 'abouttab', label: 'About' },
];

const LINK_INHERIT_OPTIONS: SelectOption[] = [
  {
    value: 'none',
    label: "Don't transfer links",
    title: "Merged product will not inherit links.",
  },
  {
    value: 'transfer',
    label: 'Transfer links',
    title: 'Links will be transfered to merged product.',
  },
  {
    value: 'copy',
    label: 'Copy links',
    title: 'Fragments keep their links, merged also inherits links. This can make it easier to see which fragment was linked to which peak. Warnings from the working fragments are turned off because the same peaks and atoms can be counted multiple times in this mode. The warnings for the working solution are still active.',
  },
];

function readCheatBit(bits: string, oneBasedPosition: number): boolean {
  const normalized = normalizeCheatBits(bits);
  return normalized[oneBasedPosition - 1] === '1';
}

function writeCheatBit(bits: string, oneBasedPosition: number, value: boolean): string {
  const normalized = normalizeCheatBits(bits);
  const padded = normalized.padEnd(DEFAULT_CHEATS.length, '0').slice(0, DEFAULT_CHEATS.length).split('');
  padded[oneBasedPosition - 1] = value ? '1' : '0';
  return padded.join('');
}

function ToggleRow({ id, label, checked, onChange, title, disabled = false }: ToggleRowProps) {
  return (
    <div className={`settings-toggle-row${disabled ? ' is-disabled' : ''}`} title={title}>
      <span className="settings-toggle-label">{label}</span>
      <input
        id={id}
        className="settings-toggle-input"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        title={title}
      />
      <label className="settings-toggle-switch" htmlFor={id} title={title} />
    </div>
  );
}

function SelectRow({ id, label, value, options, onChange, title }: SelectRowProps) {
  const activeOptionTitle = options.find((option) => option.value === value)?.title;
  return (
    <div className="settings-select-row" title={title}>
      <label className="settings-toggle-label" htmlFor={id} title={title}>{label}</label>
      <select
        id={id}
        className="settings-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        title={activeOptionTitle ?? title}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} title={option.title}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

type TagsTabProps = {
  onTagsUpdated?: () => void;
  showCheatTags: boolean;
};

function TagsTab({ onTagsUpdated, showCheatTags }: TagsTabProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleted, setDeleted] = useState<Record<number, boolean>>({});

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetchTags();
        if (!mounted) return;
        // sort alphabetically by tag_name
        res.sort((a, b) => a.tag_name.localeCompare(b.tag_name, undefined, { sensitivity: 'base' }));
        setTags(res);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const displayedTags = useMemo(
    () => (showCheatTags ? tags : tags.filter((tag) => !tag.is_cheat)),
    [showCheatTags, tags],
  );

  if (loading) {
    return <p className="settings-placeholder-text">Loading tags...</p>;
  }

  const sortedTags = [...displayedTags].sort((a, b) => 
    a.tag_name.localeCompare(b.tag_name, undefined, { sensitivity: 'base' })
  );

  async function handleDelete(t: Tag) {
    if (deleted[t.id]) {
      // restore
      await restoreTag(t.id);
      setDeleted((prev) => { const copy = { ...prev }; delete copy[t.id]; return copy; });
      setTags((prev) => prev.map((tag) => (tag.id === t.id ? { ...tag, deleted_at: null } : tag)));
      onTagsUpdated?.();
      return;
    }

    // soft-delete
    await deleteTag(t.id);
    setDeleted((prev) => ({ ...prev, [t.id]: true }));
    onTagsUpdated?.();
  }

  async function handleHide(t: Tag, value: boolean) {
    await setTagHidden(t.id, value);
    setTags((prev) => prev.map((tag) => (tag.id === t.id ? { ...tag, is_hidden: value } : tag)));
    onTagsUpdated?.();
  }

  return (
    <div className="tags-tab-inner">
      <div className="tags-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div className="tag-column">
          <div className="tag-column-header">
            <span>Tag name</span>
            <span>Count</span>
            <span style={{ display: 'block', textAlign: 'center' }}>Hide</span>
            <span style={{ display: 'block', textAlign: 'center' }}>Delete</span>
            <span>Description</span>
          </div>

          {sortedTags.map((t) => (
            <div className={`tag-row${deleted[t.id] ? ' is-deleted' : ''}`} key={t.id}>
              <div className="tag-name">{t.tag_name}</div>
              <div className="settings-solvent-count">
                Tag used in <b>{t.tag_count}</b> exercises.<br />
              </div>
              <div className="tag-hide" style={{ textAlign: 'center' }}>
                {t.is_hideable ? (
                  <input
                    type="checkbox"
                    checked={t.is_hidden}
                    onChange={(e) => handleHide(t, e.target.checked)}
                  />
                ) : (
                  <span />
                )}
              </div>
              
              <div className="tag-delete" style={{ textAlign: 'center' }}>
                {!t.is_persistent ? (
                  <button type="button" onClick={() => handleDelete(t)}>
                    {deleted[t.id] ? 'Undo' : '✕'}
                  </button>
                ) : (
                  <span />
                )}
              </div>
              
              <div className="settings-solvent-count">
                {t.user_tag ? ' (user created) ' : ' '}
                {t.description ?? ''}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


export function SettingsPanel({
  isOpen,
  onClose,
  linkInheritMode,
  onLinkInheritModeChange,
  selectedTheme,
  availableThemes,
  onThemeChange,
  selectedPreset,
  availablePresets,
  onPresetChange,
  showTimer,
  onShowTimerChange,
  showCASValidation,
  onShowCASValidationChange,
  showWarnings,
  onShowWarningsChange,
  showSolventText,
  onShowSolventTextChange,
  showExchangeText,
  onShowExchangeTextChange,
  showMissingText,
  onShowMissingTextChange,
  showCreation,
  onShowCreationChange,
  cheatBits,
  onCheatBitsChange,
  solvents,
  solventsLoading,
  onSolventPreferenceChange,
  onTagsUpdated,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('settingstab');

  const normalizedCheatBits = useMemo(
    () => normalizeCheatBits(cheatBits).padEnd(DEFAULT_CHEATS.length, '0').slice(0, DEFAULT_CHEATS.length),
    [cheatBits],
  );

  const setCheat = (position: number, value: boolean) => {
    onCheatBitsChange(writeCheatBit(normalizedCheatBits, position, value));
  };

  const cheatsEnabled = readCheatBit(normalizedCheatBits, 1);
  const coupledMultiplicityCheatEnabled = readCheatBit(normalizedCheatBits, 4);
  const visibleTabs = cheatsEnabled
    ? TABS
    : TABS.filter((tab) => tab.id !== 'cheatstab');

  useEffect(() => {
    if (!cheatsEnabled && activeTab === 'cheatstab') {
      setActiveTab('settingstab');
    }
  }, [cheatsEnabled, activeTab]);

  useEffect(() => {
    if (!coupledMultiplicityCheatEnabled && readCheatBit(normalizedCheatBits, 5)) {
      setCheat(5, false);
    }
  }, [coupledMultiplicityCheatEnabled, normalizedCheatBits]);

  if (!isOpen) {
    return null;
  }

    return createPortal(
    <div
      className="settings-panel-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="settings-panel-surface" role="dialog" aria-modal="true" aria-label="Settings panel">
        <div className="settings-panel-header">
          <div className="settings-panel-tabs">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`settings-panel-tab${tab.id === activeTab ? ' is-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button type="button" className="settings-panel-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="settings-panel-content">
          {activeTab === 'settingstab' && (
            <div className="settings-tab-content" id="settingstab">
              <ToggleRow 
                id="setting-show-timer" 
                label="Show timer" 
                checked={showTimer} 
                onChange={onShowTimerChange}
                title="When enabled, a timer will be displayed in the interface to track elapsed time for the active exercise. The timer starts with a 5 second delay, can be paused, and will resume after pause and switching from another exercise. The time spent is stored and is used in the statistics page."
              />
              <ToggleRow
                id="setting-manual-cas-validation"
                label="Show manual CAS validation"
                checked={showCASValidation}
                onChange={onShowCASValidationChange}
                title="When enabled, a manual CAS validation input box will be displayed in the interface. If you are sure your structure is correct, or you believe it is faster to look up a CAS number, you can validate your suspicion manually through a CAS number check."
              />
              <ToggleRow
                id="setting-solvent-annotation"
                label='Show "solvent" annotation in spectra'
                checked={showSolventText}
                onChange={onShowSolventTextChange}
                title='When enabled, the "solvent" label which is embedded in the spectra will be displayed in the spectra.'
              />
              <ToggleRow
                id="setting-exchanges-annotation"
                label={<>Show "exchanges with D<sub>2</sub>O" annotation in spectra</>}
                checked={showExchangeText}
                onChange={onShowExchangeTextChange}
                title='When enabled, the "exchanges with D₂O" label which is embedded in the spectra will be displayed in the spectra.'
              />
              <ToggleRow
                id="setting-warning-panel"
                label="Enable Warning Panel"
                checked={showWarnings}
                onChange={onShowWarningsChange}
                title="Warning symbols will be shown when too many atoms are used or too many DBE are set in the working solution, or when too many atoms are linked to a signal in the spectra."
              />
              <ToggleRow
                id="setting-missing-atoms"
                label="Show potentially missing atoms in working solution space"
                checked={showMissingText}
                onChange={onShowMissingTextChange}
                title="In the Working Solution Space, a small text serves as a check if you miss any atoms and if so, which ones and how many."
              />
              <ToggleRow
                id="setting-enable-cheats"
                label="Enable cheats"
                checked={readCheatBit(normalizedCheatBits, 1)}
                onChange={(checked) => setCheat(1, checked)}
                title="You wanna be like that? Enabling cheats will unlock a set op options in the Cheats tab. These options can be used to make the exercises easier, but the use of cheats is stored per exercises and its use will be shown in the statistics page."
              />
              <ToggleRow
                id="setting-single-exercise-creation"
                label="Enable single exercise creation"
                checked={showCreation}
                onChange={onShowCreationChange}
                title="Enable the option to create a single exercise. This will be visible in the exercise drop-down menu, below the ZIP import function."
              />
              <SelectRow
                id="setting-link-inherit-mode"
                label="Link inherit mode"
                value={linkInheritMode}
                options={LINK_INHERIT_OPTIONS}
                onChange={(value) => onLinkInheritModeChange(value as LinkInheritMode)}
                title="Choose what should happen with fragment links after merging two fragments."
              />
              <SelectRow
                id="setting-theme-select"
                label="Select theme (NOT WORKING)"
                value={selectedTheme}
                options={availableThemes.map((theme) => ({ value: theme, label: theme }))}
                onChange={onThemeChange}
                title="Currently, only a light theme is available."
              />
              <SelectRow
                id="setting-preset-select"
                label="Presets"
                value={selectedPreset}
                options={availablePresets.map((preset) => ({ value: preset, label: preset }))}
                onChange={onPresetChange}
                title="Set the options back to default or one of the other presets. This will overwrite your current settings."
              />
            </div>
          )}

          {activeTab === 'solventstab' && (
            <div className="settings-tab-content" id="solventstab">          
                <div className="settings-solvent-option" style={{ borderBottom: '1px solid #f1f5f9', padding: '12px 14px' }}>                 
                        You can select your preferred notation for each deuterated solvent. 
                        The selected notation will be used in the spectra titles.
                        The list is ordered by how often the solvent is used in the exercises and excludes the examples and references.
                </div>
              {solventsLoading && <p className="settings-placeholder-text">Loading solvents...</p>}
              {!solventsLoading && solvents.length === 0 && (
                <p className="settings-placeholder-text">No solvents available.</p>
              )}
              {!solventsLoading && solvents.map((solvent) => (
                <div className="settings-solvent-row" key={solvent.id}> 
                  <div className="settings-solvent-name">{solvent.display}</div>
                  <div className="settings-solvent-options">
                    {solvent.options.map((option, index) => (
                      <label className="settings-solvent-option" key={`${solvent.id}-${index}`}>
                        <input
                          type="checkbox"
                          checked={solvent.preference === index}
                          onChange={(event) => {
                            if (event.target.checked) {
                              onSolventPreferenceChange(solvent.id, index);
                            }
                          }}
                        />
                        <span>{formatChemistryText(option)}</span>
                      </label>
                    ))}
                  </div>
                  <p className="settings-solvent-count">
                    There are <b>{solvent.count}</b> exercises using this solvent
                  </p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'tagstab' && (
            <div className="settings-tab-content" id="tagstab">
                <div className="settings-solvent-option" style={{ borderBottom: '1px solid #f1f5f9', padding: '12px 14px' }}> 
                        This is a list of all current tags and how often they occur, including the examples and references. You can choose to hide them, and some can even be deleted.
                        Hidden tags will not be shown in the exercise selection menu. Tags marked as cheats are normally excluded from this list unless the cheat toggle is enabled in the Cheats tab.
                        Deleting tags can only be undone in the current active window: close this settings panel and deletion is irreversible.
                </div>
              <TagsTab onTagsUpdated={onTagsUpdated} showCheatTags={readCheatBit(normalizedCheatBits, 9)} />
            </div>
          )}

          {cheatsEnabled && activeTab === 'cheatstab' && (
            <div className="settings-tab-content" id="cheatstab">
              <ToggleRow
                id="setting-helper-overlays"
                label={<>Show helper overlays in <sup>1</sup>H and <sup>13</sup>C spectra</>}
                checked={readCheatBit(normalizedCheatBits, 2)}
                onChange={(checked) => setCheat(2, checked)}
                title="In both the ¹H and ¹³C spectra, an overlay will be displayed. This overlay can help beginners remind them in what section of the spectra which types of signals are generally found."
              />
              <ToggleRow
                id="setting-correct-dbe"
                label="Show correct Double Bond Equivalents (DBE)"
                checked={readCheatBit(normalizedCheatBits, 3)}
                onChange={(checked) => setCheat(3, checked)}
                title="Always show the correct DBE value for the exercise at hand. This value cannot be changed."
              />
              <ToggleRow
                id="setting-multiplicity-c"
                label={<>Show multiplicity for coupled <sup>13</sup>C spectra in the data table</>}
                checked={readCheatBit(normalizedCheatBits, 4)}
                onChange={(checked) => setCheat(4, checked)}
                title="In addition to peak ppm, also show the multiplicity descriptor (s, d, t, dd, etc...) for coupled ¹³C spectra."
              />
              <ToggleRow
                id="setting-coupling-constants-c"
                label={<>Show coupling constants for coupled <sup>13</sup>C spectra in the data table</>}
                checked={readCheatBit(normalizedCheatBits, 5)}
                onChange={(checked) => setCheat(5, checked)}
                title={
                  coupledMultiplicityCheatEnabled
                    ? 'In addition to peak ppm AND multiplicity, also show the coupling constants for coupled ¹³C spectra.'
                    : 'Enable "Show multiplicity for coupled ¹³C spectra" first to use this option.'
                }
                disabled={!coupledMultiplicityCheatEnabled}
              />
              <ToggleRow
                id="setting-coupling-constants-h"
                label={<>Show coupling constants for <sup>1</sup>H spectra in the data table</>}
                checked={readCheatBit(normalizedCheatBits, 6)}
                onChange={(checked) => setCheat(6, checked)}
                title="In addition to peak ppm and multiplicity, also show the coupling constants for coupled ¹H spectra."
              />
              <ToggleRow
                id="setting-atom-counts"
                label="Show correct atom counts in the data table"
                checked={readCheatBit(normalizedCheatBits, 7)}
                onChange={(checked) => setCheat(7, checked)}
                title="Show the correct atom counts (integrals) for both ¹H and ¹³C spectra. This can very rarely be useful, for example when ¹³C signals exactly overlap, even though the overlap is not caused by symmetry"
              />
              <ToggleRow
                id="setting-alt-nuclei"
                label="Show data table entries for other NMR-active nuclei"
                checked={readCheatBit(normalizedCheatBits, 8)}
                onChange={(checked) => setCheat(8, checked)}
                title="Show additional tabulrized date for other NMR-active nuclei, such as ¹⁹F, ³¹P, ²⁹Si, etc... This is only useful if the exercise contains additional spectra for these nuclei."
              />
              <ToggleRow
                id="setting-cheat-tags"
                label="Show cheat tags (NOT WORKING)"
                checked={readCheatBit(normalizedCheatBits, 9)}
                onChange={(checked) => setCheat(9, checked)}
                title="Include tags marked as cheats in the Tags tab so they can be hidden or deleted like regular tags."
              />
              <ToggleRow
                id="setting-spectrum-data-source"
                label="Show spectrum data source labels"
                checked={readCheatBit(normalizedCheatBits, 10)}
                onChange={(checked) => setCheat(10, checked)}
                title="Display the spectrum data source text in the bottom-left corner of the ¹H and ¹³C spectra."
              />
            </div>
          )}

          {activeTab === 'informationtab' && (
            <div className="settings-tab-content" id="informationtab">
              <h2 className="settings-tab-title">Information</h2>
              <p className="settings-placeholder-text">Information content will be added here.</p>
            </div>
          )}
		  {activeTab === 'changelogtab' && (
            <div className="settings-tab-content" id="changelogtab">
			  <div className="markdown-body">
				<ReactMarkdown>{ChangelogMD}</ReactMarkdown>
			  </div>
            </div>
          )}
		  {activeTab === 'abouttab' && (
            <div className="settings-tab-content" id="abouttab">
              <h2 className="settings-tab-title">Information</h2>
              <p className="settings-placeholder-text">Credits etc. will be added here.</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
