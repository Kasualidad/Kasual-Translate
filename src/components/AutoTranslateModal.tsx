import React, { useState } from 'react';
import { translateText } from '../services/translator';
import type { TranslationEngine } from '../services/translator';
import { useTranslationMemory } from '../hooks/useTranslationMemory';
import { useModalLifecycle } from '../hooks/useModalLifecycle';
import './Modal.css';

interface AutoTranslateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTranslate: (entries: Array<{ key: string; original: string; translated: string }>) => void;
  entries: Array<{ key: string; original: string }>;
  targetLang: string;
  t?: (key: string, ...args: Array<string | number>) => string;
}

const AutoTranslateModal: React.FC<AutoTranslateModalProps> = ({
  isOpen,
  onClose,
  onTranslate,
  entries,
  targetLang,
  t = (key: string, ...args: Array<string | number>) => {
    const fallback: Record<string, string> = {
      auto_title: 'Automatic translation',
      entries_to_translate: '{0} entries will be translated',
      translation_engine: 'Engine',
      engine_auto: 'Auto (probar todos)',
      engine_google: 'Google Translate',
      engine_libre: 'LibreTranslate',
      engine_mymemory: 'MyMemory',
      normalize: 'Normalize',
      cancel: 'Cancel',
      start: 'Start'
    };
    return (fallback[key] || key).replace(/\{(\d+)\}/g, (_, index) => String(args[Number(index)] ?? ''));
  }
}) => {
  const [engine, setEngine] = useState<TranslationEngine>('auto');
  const [normalize, setNormalize] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState(0);
  const { saveTranslation, getTranslation } = useTranslationMemory();
  const { shouldRender, isClosing, requestClose } = useModalLifecycle(isOpen, onClose);

  if (!shouldRender) return null;

  const handleStart = async () => {
    setIsTranslating(true);
    setProgress(0);

    const translatedEntries = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      setProgress(Math.round((i / entries.length) * 100));

      // Buscar en memoria
      const cached = getTranslation(entry.original);
      if (cached) {
        translatedEntries.push({ ...entry, translated: cached });
        continue;
      }

      // Traducir
      const result = await translateText(entry.original, targetLang, engine);
      let translated = result.success ? result.text : entry.original;

      // Normalizar si se pide
      if (normalize) {
        translated = translated.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      }

      // Guardar en memoria
      if (result.success) {
        await saveTranslation(entry.original, translated);
      }

      translatedEntries.push({ ...entry, translated });
    }

    setProgress(100);
    onTranslate(translatedEntries);
    setIsTranslating(false);
    requestClose();
  };

  return (
    <div className={`modal-overlay ${isClosing ? 'is-closing' : ''}`}>
      <div className="modal">
        <h3>{t('auto_title').replace('⚡ ', '')}</h3>
        <p>{t('entries_to_translate', entries.length)}</p>

        <div className="form-group">
          <label>{t('translation_engine')}:</label>
          <select value={engine} onChange={(e) => setEngine(e.target.value as TranslationEngine)}>
            <option value="auto">{t('engine_auto')}</option>
            <option value="google">{t('engine_google')}</option>
            <option value="libretranslate">{t('engine_libre')}</option>
            <option value="mymemory">{t('engine_mymemory')}</option>
          </select>
        </div>

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={normalize}
              onChange={(e) => setNormalize(e.target.checked)}
            />
            {t('normalize')}
          </label>
        </div>

        {isTranslating && (
          <div className="progress">
            <div className="progress-bar" style={{ width: `${progress}%` }}>
              {progress}%
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={requestClose} disabled={isTranslating || isClosing}>
            {t('cancel')}
          </button>
          <button className="btn primary" onClick={handleStart} disabled={isTranslating}>
            {t('start')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AutoTranslateModal;
