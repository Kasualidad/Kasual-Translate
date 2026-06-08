import React, { useState, useEffect } from 'react';
import type { Extra } from '../types';
import { useModalLifecycle } from '../hooks/useModalLifecycle';
import './ExtrasModal.css';

interface ExtrasModalProps {
  isOpen: boolean;
  onClose: () => void;
  extras: Extra[];
  onAdd: (extra: Omit<Extra, 'id'>) => void;
  onUpdate: (id: string, updated: Partial<Omit<Extra, 'id'>>) => void;
  onDelete: (id: string) => void;
  onExecute: (extra: Extra) => void;
  onImport: (jsonData: string) => { success: boolean; count?: number; error?: string };
  exportData: () => string;
  t: (key: string, ...args: Array<string | number>) => string;
}

const PREDEFINED_ICONS = ['⚙️', '🔧', '📁', '🛠️', '🔍', '🎨', '💾', '📂', '🔨', '🧰', '📌', '⭐', '🔥', '💡', '🔔', '📎'];

const ExtrasModal: React.FC<ExtrasModalProps> = ({
  isOpen, onClose, extras, onAdd, onUpdate, onDelete, onExecute, onImport, exportData, t
}) => {
  const [formData, setFormData] = useState({ name: '', icon: '⚙️', action: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState('');
  const { shouldRender, isClosing, requestClose } = useModalLifecycle(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) {
      // Reset transient form state when the modal is fully closed.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({ name: '', icon: '⚙️', action: '' });
      setEditingId(null);
      setImportStatus('');
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.action.trim()) {
      alert(t('extra_name_action_required'));
      return;
    }
    if (editingId) onUpdate(editingId, formData);
    else onAdd(formData);
    setFormData({ name: '', icon: '⚙️', action: '' });
    setEditingId(null);
  };

  const handleEdit = (extra: Extra) => {
    setFormData({ name: extra.name, icon: extra.icon, action: extra.action });
    setEditingId(extra.id);
  };

  const handleCancelEdit = () => {
    setFormData({ name: '', icon: '⚙️', action: '' });
    setEditingId(null);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const result = onImport(content);
      if (result.success) setImportStatus(t('extra_imported_count', result.count || 0));
      else setImportStatus(`❌ ${t('scan_error')}: ${result.error}`);
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    const data = exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kasual_extras_backup.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!shouldRender) return null;

  return (
    <div className={`modal-overlay ${isClosing ? 'is-closing' : ''}`}>
      <div className="modal-box extras-modal">
        <h2 className="modal-title">{t('extras_title')}</h2>

        <div className="extras-content">
          <form onSubmit={handleSubmit} className="extra-form">
            <div className="form-row">
              <div className="form-group"><label>{t('extra_name')}</label><input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="text-input" placeholder={t('extra_name_placeholder')} /></div>
              <div className="form-group icon-selector">
                <label>{t('extra_icon')}</label>
                <div className="icon-input-group">
                  <input type="text" value={formData.icon} onChange={(e) => setFormData({ ...formData, icon: e.target.value })} className="text-input icon-input" placeholder="⚙️" maxLength={2} />
                  <div className="icon-grid">
                    {PREDEFINED_ICONS.map(icon => (
                      <button key={icon} type="button" className={`icon-option ${formData.icon === icon ? 'selected' : ''}`} onClick={() => setFormData({ ...formData, icon })}>{icon}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="form-group"><label>{t('extra_action')}</label><textarea value={formData.action} onChange={(e) => setFormData({ ...formData, action: e.target.value })} className="text-input code-input" rows={5} placeholder={t('extra_action_placeholder')} /></div>
            <div className="form-actions">
              {editingId && <button type="button" onClick={handleCancelEdit} className="btn">{t('cancel')}</button>}
              <button type="submit" className="btn primary">{editingId ? t('extra_saved') : t('extra_save')}</button>
            </div>
          </form>

          <div className="extras-list-section">
            <h3>{t('extra_list')} ({extras.length})</h3>
            <div className="extras-list">
              {extras.length === 0 ? <p className="no-extras">{t('extra_no_extras')}</p> : extras.map(extra => (
                <div key={extra.id} className="extra-item">
                  <span className="extra-icon">{extra.icon}</span>
                  <span className="extra-name">{extra.name}</span>
                  <div className="extra-actions">
                    <button onClick={() => onExecute(extra)} className="btn small" title={t('extra_execute')}>▶️</button>
                    <button onClick={() => handleEdit(extra)} className="btn small" title={t('extra_edit')}>✏️</button>
                    <button onClick={() => onDelete(extra.id)} className="btn small danger" title={t('extra_delete')}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="import-export-section">
            <h3>{t('extra_import')} / {t('extra_export')}</h3>
            <div className="import-export-actions">
              <div className="import-group">
                <input type="file" id="import-file" accept=".json" onChange={handleImportFile} className="file-input" />
                <label htmlFor="import-file" className="btn">📥 {t('extra_import')} JSON</label>
                {importStatus && <span className="import-status">{importStatus}</span>}
              </div>
              <button onClick={handleExport} className="btn">📤 {t('extra_export')} JSON</button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={requestClose} className="btn" disabled={isClosing}>{t('close')}</button>
        </div>
      </div>
    </div>
  );
};

export default ExtrasModal;
