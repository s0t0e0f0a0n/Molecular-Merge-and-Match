import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { AboutIcon, ChangelogIcon, InformationIcon, TutorialIcon } from '../../components/PanelIcons';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import InfoMD from '../../info/INFO.md?raw';
import ChangelogMD from '../../info/CHANGELOG.md?raw';
import AboutMD from '../../info/ABOUT.md?raw';
import '../../panelStyles.css';

type InfoTabId = 'information' | 'tutorial' | 'changelog' | 'about';

const TABS: Array<{ id: InfoTabId; label: ReactNode }> = [
  { id: 'information', label: <><InformationIcon />&nbsp;<span>Information</span></> },
  { id: 'tutorial', label: <><TutorialIcon />&nbsp;<span>Tutorial</span></> },
  { id: 'changelog', label: <><ChangelogIcon />&nbsp;<span>Changelog</span></> },
  { id: 'about', label: <><AboutIcon />&nbsp;<span>About</span></> },
];

export function InfoPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<InfoTabId>('information');

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
      <div className="settings-panel-surface" role="dialog" aria-modal="true" aria-label="Information panel">
        <div className="settings-panel-header">
          <div className="settings-panel-tabs">
            {TABS.map((tab) => (
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
          {activeTab === 'information' && (
            <div className="settings-tab-content" id="informationtab">
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                  {InfoMD}
                </ReactMarkdown>
              </div>
            </div>
          )}
          {activeTab === 'tutorial' && (
            <div className="settings-tab-content" id="tutorialtab">
              <div className="markdown-body">
                <h1>Tutorial</h1>
                <ol>
                  <li>Choose an exercise from the exercise menu.</li>
                  <li>Review the spectra and peak data to identify signals that support your structure.</li>
                  <li>
                    Add fragments using the fragment menu or draw them in the molecule editor. Match peaks by
                    selecting a peak and then the fragment it belongs to.
                  </li>
                  <li>Connect fragments to build the proposed molecule.</li>
                  <li>Move the completed structure to the solution workspace and validate your answer.</li>
                </ol>
                <p>
                  You can keep multiple fragments while working and use the settings to control how peak matches
                  are handled when fragments are combined.
                </p>
              </div>
            </div>
          )}
          {activeTab === 'changelog' && (
            <div className="settings-tab-content" id="changelogtab">
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                  {ChangelogMD}
                </ReactMarkdown>
              </div>
            </div>
          )}
          {activeTab === 'about' && (
            <div className="settings-tab-content" id="abouttab">
              <div className="markdown-body">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={{
                    ascii: ({ children }: { children?: React.ReactNode }) => {
                      const rawText = String(children);
                      const formattedText = `<span class="c1">${rawText}</span>`
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
                    },
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
