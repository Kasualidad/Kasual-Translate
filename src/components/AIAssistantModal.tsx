import React, { useMemo, useState } from 'react';
import { FaBolt, FaCheck, FaPlus, FaRobot, FaSave, FaSearch, FaTimes, FaTrash } from 'react-icons/fa';
import type { AIProviderConfig, AIReviewIssue, GlossaryEntry } from '../services/aiAssistant';
import { reviewDocumentWithAI, testAIConnection, translateDocumentWithAI } from '../services/aiAssistant';
import { useModalLifecycle } from '../hooks/useModalLifecycle';
import WarningPopup from './WarningPopup';
import './AIAssistantModal.css';

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName?: string;
  content?: string;
  targetLang: string;
  onApply: (content: string) => void;
  onSelectIssue?: (key: string) => void;
  t: (key: string, ...args: Array<string | number>) => string;
}

const defaultConfig: AIProviderConfig = {
  endpoint: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: 'gpt-4.1-mini'
};

const presets: Array<{ id: string; label: string; config: AIProviderConfig }> = [
  {
    id: 'openai',
    label: 'OpenAI',
    config: { endpoint: 'https://api.openai.com/v1/chat/completions', apiKey: '', model: 'gpt-4.1-mini' }
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    config: { endpoint: 'https://openrouter.ai/api/v1/chat/completions', apiKey: '', model: 'openai/gpt-4.1-mini' }
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    config: { endpoint: 'http://127.0.0.1:1234/v1/chat/completions', apiKey: '', model: 'local-model' }
  },
  {
    id: 'ollama',
    label: 'Ollama',
    config: { endpoint: 'http://127.0.0.1:11434/v1/chat/completions', apiKey: '', model: 'llama3.1' }
  }
];

function loadConfig(): AIProviderConfig {
  try {
    return { ...defaultConfig, ...JSON.parse(localStorage.getItem('kasual_ai_config') || '{}') };
  } catch {
    return defaultConfig;
  }
}

function loadGlossary(): GlossaryEntry[] {
  try {
    return JSON.parse(localStorage.getItem('kasual_ai_glossary') || '[]');
  } catch {
    return [];
  }
}

const AIAssistantModal: React.FC<AIAssistantModalProps> = ({ isOpen, onClose, fileName, content, targetLang, onApply, onSelectIssue, t }) => {
  const [config, setConfig] = useState<AIProviderConfig>(() => loadConfig());
  const [glossary, setGlossary] = useState<GlossaryEntry[]>(() => loadGlossary());
  const [newSource, setNewSource] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [issues, setIssues] = useState<AIReviewIssue[]>([]);
  const [busy, setBusy] = useState<'translate' | 'review' | 'test' | null>(null);
  const [status, setStatus] = useState('');
  const [warning, setWarning] = useState<{ title: string; message: string } | null>(null);

  const hasDocument = !!fileName && !!content;
  const canCallAI = !!config.endpoint.trim() && !!config.model.trim();
  const configLabel = useMemo(() => config.endpoint.includes('localhost') || config.endpoint.includes('127.0.0.1') ? t('ai_local_endpoint') : t('ai_online_endpoint'), [config.endpoint, t]);
  const { shouldRender, isClosing, requestClose } = useModalLifecycle(isOpen, onClose);

  if (!shouldRender) return null;

  const saveConfig = () => {
    localStorage.setItem('kasual_ai_config', JSON.stringify(config));
    localStorage.setItem('kasual_ai_glossary', JSON.stringify(glossary));
    setStatus(t('ai_settings_saved'));
  };

  const showWarning = (message: string, title = t('warning')) => {
    setWarning({ title, message });
  };

  const explainAIError = (message: string) => {
    const providerDetail = message.replace(/^HTTP_\d+:\s*/, '').trim();
    const withProviderDetail = (key: string) => providerDetail ? `${t(key)}\n\n${t('ai_provider_detail')}: ${providerDetail}` : t(key);
    if (message.includes('HTTP_401')) return withProviderDetail('ai_error_401');
    if (message.includes('HTTP_403')) return withProviderDetail('ai_error_403');
    if (message.includes('HTTP_404')) return withProviderDetail('ai_error_404');
    if (message.includes('HTTP_429')) return withProviderDetail('ai_error_429');
    if (message.includes('NETWORK_ERROR')) return t('ai_error_network', message.replace('NETWORK_ERROR: ', ''));
    if (message.includes('Failed to fetch')) return t('ai_error_network', message);
    return message;
  };

  const validateDocument = () => {
    if (!hasDocument) {
      showWarning(t('ai_error_no_document'));
      return false;
    }
    return true;
  };

  const validateAIConfig = () => {
    const cleanApiKey = config.apiKey.trim();
    if (!config.endpoint.trim()) {
      showWarning(t('ai_error_no_endpoint'));
      return false;
    }
    if (!config.model.trim()) {
      showWarning(t('ai_error_no_model'));
      return false;
    }
    if (config.endpoint.includes('api.openai.com')) {
      if (!cleanApiKey) {
        showWarning(t('ai_error_no_api_key'));
        return false;
      }
      if (!cleanApiKey.startsWith('sk-')) {
        showWarning(t('ai_error_bad_openai_key_format'));
        return false;
      }
    }
    return true;
  };

  const applyPreset = (preset: AIProviderConfig) => {
    setConfig(prev => ({ ...preset, apiKey: prev.apiKey }));
    setStatus(t('ai_preset_applied'));
  };

  const runConnectionTest = async () => {
    if (!validateAIConfig()) return;
    setBusy('test');
    setStatus('');
    try {
      await testAIConnection(config);
      setStatus(t('ai_connection_ok'));
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : t('ai_connection_failed');
      const message = explainAIError(rawMessage);
      setStatus(message);
      showWarning(t('ai_error_connection_detail', message));
    } finally {
      setBusy(null);
    }
  };

  const addGlossary = () => {
    if (!newSource.trim() || !newTarget.trim()) return;
    const next = [...glossary, { source: newSource.trim(), target: newTarget.trim() }];
    setGlossary(next);
    localStorage.setItem('kasual_ai_glossary', JSON.stringify(next));
    setNewSource('');
    setNewTarget('');
  };

  const removeGlossary = (index: number) => {
    const next = glossary.filter((_, itemIndex) => itemIndex !== index);
    setGlossary(next);
    localStorage.setItem('kasual_ai_glossary', JSON.stringify(next));
  };

  const runReview = async () => {
    if (!validateDocument()) return;
    setBusy('review');
    setStatus('');
    try {
      const result = await reviewDocumentWithAI(content!, fileName!, targetLang, canCallAI ? config : null, glossary);
      setIssues(result);
      setStatus(result.length === 0 ? t('ai_review_clean') : t('ai_review_found', result.length));
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : t('ai_review_failed');
      const message = explainAIError(rawMessage);
      setStatus(message);
      showWarning(message);
    } finally {
      setBusy(null);
    }
  };

  const runTranslate = async () => {
    if (!validateDocument() || !validateAIConfig()) return;
    setBusy('translate');
    setStatus('');
    try {
      const translated = await translateDocumentWithAI(content!, fileName!, targetLang, config, glossary);
      onApply(translated);
      setStatus(t('ai_translation_applied'));
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : t('ai_translation_failed');
      const message = explainAIError(rawMessage);
      setStatus(message);
      showWarning(t('ai_error_translation_detail', message));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`modal-overlay ${isClosing ? 'is-closing' : ''}`}>
      <div className="modal-box ai-modal">
        <div className="ai-modal-header">
          <h2 className="modal-title">
            <span className="modal-title-icon"><FaRobot aria-hidden="true" /></span>
            {t('ai_assistant')}
          </h2>
          <button className="btn icon-only" onClick={requestClose} aria-label={t('close')} disabled={isClosing}>
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="ai-active-doc">
          <span>{t('ai_active_document')}</span>
          <strong>{fileName || t('no_file_selected')}</strong>
          <small>{configLabel}</small>
        </div>

        <div className="ai-grid">
          <section className="ai-panel">
            <h3>{t('ai_settings')}</h3>
            <div className="ai-presets" aria-label={t('ai_presets')}>
              {presets.map(preset => (
                <button key={preset.id} onClick={() => applyPreset(preset.config)}>{preset.label}</button>
              ))}
            </div>
            <label>
              {t('ai_endpoint')}
              <input value={config.endpoint} onChange={(event) => setConfig(prev => ({ ...prev, endpoint: event.target.value }))} />
            </label>
            <label>
              {t('ai_model')}
              <input value={config.model} onChange={(event) => setConfig(prev => ({ ...prev, model: event.target.value }))} />
            </label>
            <label>
              {t('ai_api_key')}
              <input type="password" value={config.apiKey} onChange={(event) => setConfig(prev => ({ ...prev, apiKey: event.target.value }))} />
            </label>
            <div className="ai-settings-actions">
              <button className="btn btn-tool" onClick={saveConfig}>
                <FaSave aria-hidden="true" /> {t('save')}
              </button>
              <button className="btn btn-tool" onClick={runConnectionTest} disabled={busy !== null}>
                <FaBolt aria-hidden="true" /> {busy === 'test' ? t('ai_testing') : t('ai_test_connection')}
              </button>
            </div>
          </section>

          <section className="ai-panel">
            <h3>{t('ai_glossary')}</h3>
            <div className="ai-glossary-add">
              <input value={newSource} onChange={(event) => setNewSource(event.target.value)} placeholder={t('ai_glossary_source_placeholder')} />
              <input value={newTarget} onChange={(event) => setNewTarget(event.target.value)} placeholder={t('ai_glossary_target_placeholder')} />
              <button className="btn icon-only" onClick={addGlossary} title={t('add')}>
                <FaPlus aria-hidden="true" />
              </button>
            </div>
            <div className="ai-glossary-list">
              {glossary.length === 0 && <p>{t('ai_glossary_empty')}</p>}
              {glossary.map((entry, index) => (
                <div key={`${entry.source}-${index}`} className="ai-glossary-item">
                  <strong>{entry.source}</strong>
                  <span>{entry.target}</span>
                  <button onClick={() => removeGlossary(index)} title={t('remove_line')}>
                    <FaTrash aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="ai-actions">
          <button className="btn" onClick={runReview} disabled={busy !== null}>
            <FaSearch aria-hidden="true" /> {busy === 'review' ? t('ai_reviewing') : t('ai_review')}
          </button>
          <button className="btn primary" onClick={runTranslate} disabled={busy !== null}>
            <FaBolt aria-hidden="true" /> {busy === 'translate' ? t('ai_translating') : t('ai_translate_document')}
          </button>
          {status && <span className="ai-status"><FaCheck aria-hidden="true" /> {status}</span>}
        </div>

        <div className="ai-review-list">
          {issues.map((issue, index) => (
            <button key={`${issue.key}-${index}`} className={`ai-review-item ${issue.severity}`} onClick={() => onSelectIssue?.(issue.key)}>
              <strong>{issue.key}</strong>
              <span>{issue.message}</span>
            </button>
          ))}
        </div>
        <WarningPopup
          isOpen={!!warning}
          title={warning?.title || t('warning')}
          message={warning?.message || ''}
          actionLabel={t('ok')}
          onClose={() => setWarning(null)}
        />
      </div>
    </div>
  );
};

export default AIAssistantModal;
