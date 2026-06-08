import React, { useState } from 'react';
import type { TranslationEngine } from '../services/translator';
import { FaBolt, FaPlay, FaTimes } from 'react-icons/fa';
import { useModalLifecycle } from '../hooks/useModalLifecycle';
import './TranslateModal.css';

interface TranslateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (engine: TranslationEngine, normalize: boolean) => void;
  isTranslating: boolean;
  t: (key: string, ...args: Array<string | number>) => string;
}

const TranslateModal: React.FC<TranslateModalProps> = ({ isOpen, onClose, onStart, isTranslating, t }) => {
  const [engine, setEngine] = useState<TranslationEngine>('auto');
  const [normalize, setNormalize] = useState(false);
  const { shouldRender, isClosing, requestClose } = useModalLifecycle(isOpen, onClose);

  if (!shouldRender) return null;

  const handleStart = () => onStart(engine, normalize);

  return (
    <div className={`modal-overlay ${isClosing ? 'is-closing' : ''}`}>
      <div className="modal-box">
        <h2 className="modal-title">
          <span className="modal-title-icon"><FaBolt aria-hidden="true" /></span>
          {t('auto_title').replace('⚡ ', '')}
        </h2>
        <div className="modal-content">
          <div className="form-group">
            <label>{t('translation_engine')}</label>
            <select value={engine} onChange={(e) => setEngine(e.target.value as TranslationEngine)} className="select-input" disabled={isTranslating}>
              <option value="auto">{t('engine_auto')}</option>
              <option value="google">{t('engine_google')}</option>
              <option value="libretranslate">{t('engine_libre')}</option>
              <option value="mymemory">{t('engine_mymemory')}</option>
            </select>
          </div>
          <div className="form-group checkbox">
            <label>
              <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} disabled={isTranslating} />
              {t('normalize')}
            </label>
          </div>
          <div className="modal-actions">
            <button onClick={requestClose} className="btn" disabled={isTranslating || isClosing}>
              <FaTimes aria-hidden="true" /> {t('cancel')}
            </button>
            <button onClick={handleStart} className="btn primary" disabled={isTranslating}>
              <FaPlay aria-hidden="true" /> {isTranslating ? t('translating') : t('start')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TranslateModal;
