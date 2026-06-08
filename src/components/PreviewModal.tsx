import React, { useState, useEffect } from 'react';
import { useModalLifecycle } from '../hooks/useModalLifecycle';
import './PreviewModal.css';

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  onApply: (newContent: string) => void;
  t: (key: string, ...args: Array<string | number>) => string;
}

const PreviewModal: React.FC<PreviewModalProps> = ({ isOpen, onClose, content, onApply, t }) => {
  const [editedContent, setEditedContent] = useState(content);
  const [history, setHistory] = useState<string[]>([content]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const { shouldRender, isClosing, requestClose } = useModalLifecycle(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      // Preview content is resynchronized each time the modal opens.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditedContent(content);
      setHistory([content]);
      setHistoryIndex(0);
    }
  }, [isOpen, content]);

  const handleChange = (newContent: string) => {
    setEditedContent(newContent);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newContent);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setEditedContent(history[historyIndex - 1]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setEditedContent(history[historyIndex + 1]);
    }
  };

  const handleApply = () => { onApply(editedContent); requestClose(); };
  const handleCopy = () => { navigator.clipboard.writeText(editedContent); alert(t('copied')); };

  if (!shouldRender) return null;

  return (
    <div className={`modal-overlay ${isClosing ? 'is-closing' : ''}`}>
      <div className="modal-box preview-modal">
        <h2 className="modal-title">{t('preview_title')}</h2>
        <div className="preview-editor">
          <textarea value={editedContent} onChange={(e) => handleChange(e.target.value)} className="preview-textarea" spellCheck={false} />
        </div>
        <div className="preview-toolbar">
          <button onClick={handleCopy} className="btn">📋 {t('copy')}</button>
          <div className="history-controls">
            <button onClick={handleUndo} className="btn" disabled={historyIndex === 0}>↩ {t('undo')}</button>
            <button onClick={handleRedo} className="btn" disabled={historyIndex === history.length - 1}>↪ {t('redo')}</button>
          </div>
          <div className="action-buttons">
            <button onClick={handleApply} className="btn primary">✓ {t('apply')}</button>
            <button onClick={requestClose} className="btn" disabled={isClosing}>✕ {t('close')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreviewModal;
