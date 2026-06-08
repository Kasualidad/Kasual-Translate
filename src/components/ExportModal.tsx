import React, { useState } from 'react';
import type { ExportOptions } from '../services/export';
import { FaBoxOpen, FaDownload, FaHammer, FaTimes } from 'react-icons/fa';
import { useModalLifecycle } from '../hooks/useModalLifecycle';
import './ExportModal.css';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExportLocal: () => void;
  onExportWorkshop: (options: ExportOptions) => void;
  t: (key: string, ...args: Array<string | number>) => string;
}

const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  onExportLocal,
  onExportWorkshop,
  t
}) => {
  const [mode, setMode] = useState<'local' | 'workshop'>('local');
  const [options, setOptions] = useState<ExportOptions>({
    folderName: 'MiMod',
    modId: '',
    modName: '',
    author: '',
    description: '',
    version: '',
    url: '',
    require: ''
  });
  const { shouldRender, isClosing, requestClose } = useModalLifecycle(isOpen, onClose);

  if (!shouldRender) return null;

  const handleWorkshopExport = () => {
    onExportWorkshop(options);
  };

  return (
    <div className={`modal-overlay ${isClosing ? 'is-closing' : ''}`}>
      <div className="modal-box export-modal">
        <h2 className="modal-title">
          <span className="modal-title-icon"><FaBoxOpen aria-hidden="true" /></span>
          {t('export_title').replace('📦 ', '')}
        </h2>

        <div className="export-tabs">
          <button
            className={`tab-btn ${mode === 'local' ? 'active' : ''}`}
            onClick={() => setMode('local')}
          >
            <FaDownload aria-hidden="true" /> {t('export_local')}
          </button>
          <button
            className={`tab-btn ${mode === 'workshop' ? 'active' : ''}`}
            onClick={() => setMode('workshop')}
          >
            <FaHammer aria-hidden="true" /> {t('export_workshop')}
          </button>
        </div>

        {mode === 'local' ? (
          <div className="modal-content">
            <div className="export-summary">
              <FaDownload aria-hidden="true" />
              <span>{t('export_ready')}</span>
            </div>
            <div className="modal-actions">
              <button onClick={requestClose} className="btn" disabled={isClosing}>
                <FaTimes aria-hidden="true" /> {t('cancel')}
              </button>
              <button onClick={onExportLocal} className="btn primary">
                <FaDownload aria-hidden="true" /> {t('export_local')}
              </button>
            </div>
          </div>
        ) : (
          <div className="modal-content">
            <div className="form-group">
              <label>{t('mod_folder')} *</label>
              <input
                type="text"
                value={options.folderName}
                onChange={(e) => setOptions({ ...options, folderName: e.target.value })}
                className="text-input"
                placeholder={t('mod_folder_placeholder')}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>{t('mod_id')}</label>
                <input
                  type="text"
                  value={options.modId}
                  onChange={(e) => setOptions({ ...options, modId: e.target.value })}
                  className="text-input"
                  placeholder="1234567890"
                />
              </div>

              <div className="form-group">
                <label>{t('mod_name')}</label>
                <input
                  type="text"
                  value={options.modName}
                  onChange={(e) => setOptions({ ...options, modName: e.target.value })}
                  className="text-input"
                  placeholder={t('mod_name_placeholder')}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>{t('ws_author')}</label>
                <input
                  type="text"
                  value={options.author}
                  onChange={(e) => setOptions({ ...options, author: e.target.value })}
                  className="text-input"
                  placeholder={t('your_name')}
                />
              </div>

              <div className="form-group">
                <label>{t('ws_version')}</label>
                <input
                  type="text"
                  value={options.version}
                  onChange={(e) => setOptions({ ...options, version: e.target.value })}
                  className="text-input"
                  placeholder="1.0"
                />
              </div>
            </div>

            <div className="form-group">
              <label>{t('ws_desc')}</label>
              <textarea
                value={options.description}
                onChange={(e) => setOptions({ ...options, description: e.target.value })}
                className="text-input"
                rows={3}
                placeholder={t('mod_description_placeholder')}
              />
            </div>

            <div className="form-group">
              <label>{t('ws_url')}</label>
              <input
                type="text"
                value={options.url}
                onChange={(e) => setOptions({ ...options, url: e.target.value })}
                className="text-input"
                placeholder={t('ws_url_placeholder')}
              />
            </div>

            <div className="form-group">
              <label>{t('ws_require')}</label>
              <input
                type="text"
                value={options.require}
                onChange={(e) => setOptions({ ...options, require: e.target.value })}
                className="text-input"
                placeholder={t('ws_require_placeholder')}
              />
            </div>

            <div className="modal-actions">
              <button onClick={requestClose} className="btn" disabled={isClosing}>
                <FaTimes aria-hidden="true" /> {t('cancel')}
              </button>
              <button onClick={handleWorkshopExport} className="btn primary">
                <FaBoxOpen aria-hidden="true" /> {t('generate_zip')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExportModal;
