import React, { useState } from 'react';
import { useModalLifecycle } from '../hooks/useModalLifecycle';
import './HelpModal.css';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  t: (key: string, ...args: Array<string | number>) => string;
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, t }) => {
  const [activeTab, setActiveTab] = useState<'shortcuts' | 'colors'>('shortcuts');
  const { shouldRender, isClosing, requestClose } = useModalLifecycle(isOpen, onClose);

  if (!shouldRender) return null;

  return (
    <div className={`modal-overlay ${isClosing ? 'is-closing' : ''}`}>
      <div className="modal-box help-modal">
        <h2 className="modal-title">{t('help_title')}</h2>

        <div className="help-tabs">
          <div className={`help-tab ${activeTab === 'shortcuts' ? 'active' : ''}`} onClick={() => setActiveTab('shortcuts')}>{t('tab_shortcuts')}</div>
          <div className={`help-tab ${activeTab === 'colors' ? 'active' : ''}`} onClick={() => setActiveTab('colors')}>{t('tab_colors')}</div>
        </div>

        <div className="help-content">
          {activeTab === 'shortcuts' && (
            <div className="shortcut-list">
              <div className="shortcut-item"><span className="shortcut-key">Ctrl+S</span><span className="shortcut-desc">{t('shortcuts_save')}</span></div>
              <div className="shortcut-item"><span className="shortcut-key">Ctrl+→</span><span className="shortcut-desc">{t('shortcuts_next')}</span></div>
              <div className="shortcut-item"><span className="shortcut-key">Ctrl+←</span><span className="shortcut-desc">{t('shortcuts_prev')}</span></div>
              <div className="shortcut-item"><span className="shortcut-key">Ctrl+D</span><span className="shortcut-desc">{t('shortcuts_next_diff')}</span></div>
              <div className="shortcut-item"><span className="shortcut-key">Ctrl+F</span><span className="shortcut-desc">{t('shortcuts_search')}</span></div>
            </div>
          )}
          {activeTab === 'colors' && (
            <div className="color-legend">
              <div className="color-item"><span className="color-dot" style={{ background: '#ff5555' }}></span><span>{t('color_unsaved')}</span></div>
              <div className="color-item"><span className="color-dot" style={{ background: '#55ff55' }}></span><span>{t('color_saved')}</span></div>
              <div className="color-item"><span className="color-dot" style={{ background: '#aa55ff' }}></span><span>{t('color_deleted')}</span></div>
              <div className="color-item"><span className="color-dot" style={{ background: '#888' }}></span><span>{t('color_unchanged')}</span></div>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button onClick={requestClose} className="btn primary">{t('close')}</button>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
