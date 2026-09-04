import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import InfoMD from '../../INFO.md?raw';
import ChangelogMD from '../../CHANGELOG.md?raw';
import AboutMD from '../../ABOUT.md?raw';
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

const TABS: Array<{ id: SettingsTabId; label: React.ReactNode }> = [
  { id: 'settingstab', label: <>
  		<svg style={{ verticalAlign: 'middle' }} width="18px" height="18px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g stroke-width="0"></g><g stroke-linecap="round" stroke-linejoin="round"></g><g> <path d="M3 8L15 8M15 8C15 9.65686 16.3431 11 18 11C19.6569 11 21 9.65685 21 8C21 6.34315 19.6569 5 18 5C16.3431 5 15 6.34315 15 8ZM9 16L21 16M9 16C9 17.6569 7.65685 19 6 19C4.34315 19 3 17.6569 3 16C3 14.3431 4.34315 13 6 13C7.65685 13 9 14.3431 9 16Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path> </g>
  		</svg>&nbsp;<span>Settings</span></> },
  { id: 'solventstab', label: <>
		{/* @ts-expect-error legacy SVG uses an SVG namespace attribute spelling */}
  		<svg fill="currentColor" style={{ verticalAlign: 'middle' }} width="18px" height="18px"  id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 507.967 507.967" xml:space="preserve"><g stroke-width="0"></g><g stroke-linecap="round" stroke-linejoin="round"></g><g> <g> <g> <path d="M471.9,281.393l-233.3-233.3c3.5-5.4,2.9-12.8-1.8-17.6c-5.5-5.5-14.4-5.5-19.9,0l-160,160c-5.5,5.5-5.5,14.4,0,19.9 c4.9,4.9,11.3,5.7,17.6,1.8l233.3,233.3c34.9,34.9,104.3,59.8,164.1,0C532.3,385.093,505.9,315.393,471.9,281.393z M94.6,192.493 L219,68.193l166.1,166.1H136.4L94.6,192.493z M452.1,425.593c-42.9,42.9-100.2,24.2-124.3,0l-163.3-163.2h248.7l38.9,38.9 C477.2,326.393,495.6,382.093,452.1,425.593z"></path> </g> </g> <g> <g> <path d="M77.7,307.193c-2.8-3.4-6.9-5.4-11.2-5.4c-4.4,0-8.5,2-11.1,5.5c-9.3,12-55.4,73.6-55.4,105.7c0,36.6,29.8,66.5,66.5,66.5 c36.6,0,66.5-29.8,66.5-66.5C133,380.893,86.9,319.293,77.7,307.193z M66.5,451.393c-21.1,0-38.3-17.2-38.3-38.3 c0-13.8,19.9-47.2,38.4-73.4c18.5,26.3,38.3,59.6,38.3,73.4C104.8,434.193,87.6,451.393,66.5,451.393z"></path> </g> </g> </g>
  		</svg>&nbsp;<span>Solvents</span></> },
  { id: 'tagstab', label: <>
		{/* @ts-expect-error legacy SVG uses an HTML class attribute spelling */}
  		<svg fill="currentColor" style={{ verticalAlign: 'middle' }} width="18px" height="18px" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" class="icon"><g stroke-width="0"></g><g stroke-linecap="round" stroke-linejoin="round"></g><g> <path d="M483.2 790.3L861.4 412c1.7-1.7 2.5-4 2.3-6.3l-25.5-301.4c-.7-7.8-6.8-13.9-14.6-14.6L522.2 64.3c-2.3-.2-4.7.6-6.3 2.3L137.7 444.8a8.03 8.03 0 0 0 0 11.3l334.2 334.2c3.1 3.2 8.2 3.2 11.3 0zm62.6-651.7l224.6 19 19 224.6L477.5 694 233.9 450.5l311.9-311.9zm60.16 186.23a48 48 0 1 0 67.88-67.89 48 48 0 1 0-67.88 67.89zM889.7 539.8l-39.6-39.5a8.03 8.03 0 0 0-11.3 0l-362 361.3-237.6-237a8.03 8.03 0 0 0-11.3 0l-39.6 39.5a8.03 8.03 0 0 0 0 11.3l243.2 242.8 39.6 39.5c3.1 3.1 8.2 3.1 11.3 0l407.3-406.6c3.1-3.1 3.1-8.2 0-11.3z"></path> </g>
  		</svg>&nbsp;<span>Tags</span></> },
  { id: 'cheatstab', label: <>
  		<svg fill="currentColor" style={{ verticalAlign: 'middle' }} width="18px" height="18px" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g stroke-width="0"></g><g stroke-linecap="round" stroke-linejoin="round"></g><g><path fill-rule="evenodd" d="M253.617407,12.4967773 L434.398258,193.277628 C451.060628,209.939998 451.060628,236.955037 434.398258,253.617407 L253.617407,434.398258 C236.955037,451.060628 209.939998,451.060628 193.277628,434.398258 L12.4967773,253.617407 C-4.16559245,236.955037 -4.16559245,209.939998 12.4967773,193.277628 L193.277628,12.4967773 C209.939998,-4.16559245 236.955037,-4.16559245 253.617407,12.4967773 Z M223.447518,282.114184 C208.209422,282.114184 196.780851,293.378184 196.780851,308.396851 C196.780851,324.098184 207.863102,335.362184 223.447518,335.362184 C238.685613,335.362184 250.114184,324.098184 250.114184,308.738184 C250.114184,293.378184 238.685613,282.114184 223.447518,282.114184 Z M244.780851,116.780851 L202.114184,116.780851 L202.114184,244.780851 L244.780851,244.780851 L244.780851,116.780851 Z" transform="translate(32.552 32.552)"></path></g>
  		</svg>&nbsp;<span>Cheats</span></> },
  { id: 'informationtab', label: <>
  		<svg style={{ verticalAlign: 'middle' }} width="18px" height="18px" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M3.214 1.072C4.813.752 6.916.71 8.354 2.146A.5.5 0 0 1 8.5 2.5v11a.5.5 0 0 1-.854.354c-.843-.844-2.115-1.059-3.47-.92-1.344.14-2.66.617-3.452 1.013A.5.5 0 0 1 0 13.5v-11a.5.5 0 0 1 .276-.447L.5 2.5l-.224-.447.002-.001.004-.002.013-.006a5.017 5.017 0 0 1 .22-.103 12.958 12.958 0 0 1 2.7-.869zM1 2.82v9.908c.846-.343 1.944-.672 3.074-.788 1.143-.118 2.387-.023 3.426.56V2.718c-1.063-.929-2.631-.956-4.09-.664A11.958 11.958 0 0 0 1 2.82z"/><path fill-rule="evenodd" d="M12.786 1.072C11.188.752 9.084.71 7.646 2.146A.5.5 0 0 0 7.5 2.5v11a.5.5 0 0 0 .854.354c.843-.844 2.115-1.059 3.47-.92 1.344.14 2.66.617 3.452 1.013A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.276-.447L15.5 2.5l.224-.447-.002-.001-.004-.002-.013-.006-.047-.023a12.582 12.582 0 0 0-.799-.34 12.96 12.96 0 0 0-2.073-.609zM15 2.82v9.908c-.846-.343-1.944-.672-3.074-.788-1.143-.118-2.387-.023-3.426.56V2.718c1.063-.929 2.631-.956 4.09-.664A11.956 11.956 0 0 1 15 2.82z"/>
  		</svg>&nbsp;<span>Information</span></> },
  { id: 'changelogtab', label: <>
  		<svg style={{ verticalAlign: 'middle' }} width="18px" height="18px" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><g stroke-width="0"></g><g stroke-linecap="round" stroke-linejoin="round"></g><g><path d="M550.208 960H209.28A81.792 81.792 0 0 1 128 877.76V146.24A81.92 81.92 0 0 1 209.344 64h613.632a81.92 81.92 0 0 1 81.28 82.432v405.76a29.824 29.824 0 1 1-59.584 0V146.56a22.272 22.272 0 0 0-21.76-22.656H209.408a22.08 22.08 0 0 0-21.696 22.528v731.52a21.76 21.76 0 0 0 21.44 22.464h341.056a29.824 29.824 0 0 1 0.064 59.584z m196.352-600.96H285.824a29.824 29.824 0 1 1 0-59.712h460.8a29.824 29.824 0 1 1 0 59.712z m-204.8 156.8H285.824a29.824 29.824 0 1 1 0-59.712h255.936a29.824 29.824 0 1 1 0 59.648z m179.2 391.936c-101.12 0-183.424-83.84-183.424-186.624a29.824 29.824 0 1 1 59.712 0c0 70.016 55.552 126.976 123.584 126.976 17.408 0 34.24-3.712 50.048-10.88a29.888 29.888 0 0 1 24.768 54.336c-23.552 10.688-48.64 16.192-74.688 16.192z m153.6-156.8a29.824 29.824 0 0 1-29.824-29.824c0-70.016-55.552-126.976-123.648-126.976-16.32 0-32.384 3.2-47.36 9.6a29.888 29.888 0 0 1-23.424-54.912 180.224 180.224 0 0 1 70.784-14.336c101.12 0 183.424 83.84 183.424 186.624a30.016 30.016 0 0 1-29.952 29.824z m-204.8-104.576h-51.264a29.76 29.76 0 0 1-25.28-14.08 30.144 30.144 0 0 1-1.536-28.928l25.6-52.352a29.696 29.696 0 0 1 53.632 0l25.6 52.352a29.696 29.696 0 0 1-1.472 28.928 29.504 29.504 0 0 1-25.28 14.08z m127.552 269.568h-1.024a29.696 29.696 0 0 1-24.896-14.848l-25.6-44.288a29.888 29.888 0 0 1 23.808-44.672l58.048-4.032c11.392-0.704 22.144 5.12 27.904 14.848a30.016 30.016 0 0 1-1.024 31.616l-32.448 48.256a29.824 29.824 0 0 1-24.768 13.12z" fill="currentColor"></path></g>
  		</svg>&nbsp;<span>Changelog</span></> },
  { id: 'abouttab', label: <>
		{/* @ts-expect-error legacy SVG uses an SVG namespace attribute spelling */}
  		<svg style={{ verticalAlign: 'middle' }} fill="currentColor" height="18px" width="18px" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 511.936 511.936" xml:space="preserve"><g stroke-width="0"></g><g stroke-linecap="round" stroke-linejoin="round"></g><g> <g> <g> <g> <path d="M255.959,128c11.776,0,21.333-9.557,21.333-21.333s-9.557-21.333-21.333-21.333s-21.333,9.557-21.333,21.333 S244.183,128,255.959,128z"></path> <path d="M383.968,0h-256C80.907,0,42.635,38.272,42.635,85.333v213.333c0,47.061,38.272,85.333,85.333,85.333h64l0.085,92.075 c0,14.571,8.683,27.584,22.165,33.173c4.331,1.792,8.875,2.688,13.397,2.688c9.557,0,19.157-3.968,27.051-11.968L350.475,384 h33.493c47.061,0,85.333-38.272,85.333-85.333V85.333C469.301,38.272,431.029,0,383.968,0z M426.635,298.667 c0,23.531-19.157,42.667-42.667,42.667h-36.629c-9.621,0-18.645,3.755-26.752,12.011l-85.888,103.979l-0.064-80.085 c0-19.797-16.107-35.904-35.904-35.904h-70.763c-23.531,0-42.667-19.136-42.667-42.667V85.333 c0-23.531,19.136-42.667,42.667-42.667h256c23.509,0,42.667,19.136,42.667,42.667V298.667z"></path> <path d="M298.626,256h-21.333v-85.333c0-11.776-9.536-21.333-21.333-21.333h-21.333c-11.797,0-21.333,9.557-21.333,21.333 S222.829,192,234.626,192v64h-21.333c-11.797,0-21.333,9.557-21.333,21.333s9.536,21.333,21.333,21.333h85.333 c11.797,0,21.333-9.557,21.333-21.333S310.423,256,298.626,256z"></path> </g> </g> </g> </g>
  		</svg>&nbsp;<span>About</span></> },
];


/* fill="currentColor" style={{ verticalAlign: 'middle' }} width="18px" height="18px" */




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
            ✕ Close
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
				{/* <SelectRow
                id="setting-theme-select"
                label="Select theme (NOT WORKING)"
                value={selectedTheme}
                options={availableThemes.map((theme) => ({ value: theme, label: theme }))}
                onChange={onThemeChange}
                title="Currently, only a light theme is available."
              />  */}
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
                label="Show cheat tags"
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
			  <div className="markdown-body">
				<ReactMarkdown
				  remarkPlugins={[remarkGfm]} 
          		  rehypePlugins={[rehypeRaw]}
          >{InfoMD}</ReactMarkdown>
			  </div>
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
      <div className="markdown-body">
        <ReactMarkdown 
          remarkPlugins={[remarkGfm]} 
          rehypePlugins={[rehypeRaw]}
          components={{
            // Directly targets <ascii> inside your markdown file
            'ascii': ({ children }: { children?: React.ReactNode }) => {
              const rawText = String(children);
              
              // Perform your exact string substitutions cleanly
              let formattedText = `<span class="c1">${rawText}</span>`
                    .replace(/\$y/g, '</span><span class="y0">')
      .replace(/\$x/g, '</span><span class="x0">')
      .replace(/\$z/g, '</span><span class="z0">')
      .replace(/\$9/g, '</span><span class="c9">')
      .replace(/\$8/g, '</span><span class="c8">')
      .replace(/\$7/g, '</span><span class="c7">')
      .replace(/\$6/g, '</span><span class="c6">')
      .replace(/\$5/g, '</span><span class="c5">')
      .replace(/\$4/g, '</span><span class="c4">')
      .replace(/\$3/g, '</span><span class="c3">')
      .replace(/\$2/g, '</span><span class="c2">')
      .replace(/\$1/g, '</span><span class="c1">')
      .replace(/\$0/g, '</span><span class="c0">');

              return (
                <div 
                  className="dedicated-ascii-terminal"
                  dangerouslySetInnerHTML={{ __html: formattedText }} 
                />
              );
            }
          } as never}
        >
          {AboutMD}
        </ReactMarkdown>
      </div>
    </div>
          
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
