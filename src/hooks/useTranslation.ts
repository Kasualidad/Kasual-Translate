import { useState } from 'react';
import { 
  translateText, 
  parseTranslationFile, 
  buildTranslationFile, 
  normalizeText, 
  detectFormat, 
  extractVarName 
} from '../services/translator';
import type { TranslationEngine } from '../services/translator';
import { useTranslationMemory } from './useTranslationMemory';

export function useTranslation() {
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const { saveTranslation, getTranslation } = useTranslationMemory();

  const translateFile = async (
    content: string,
    targetLang: string,
    engine: TranslationEngine,
    normalize: boolean,
    onProgress?: (current: number, total: number) => void
  ): Promise<string | null> => {
    setIsTranslating(true);

    try {
      // Detectar el formato del archivo
      const format = detectFormat(content);
      let entries: Array<{ key: string; value: string }> = [];
      let varName: string | null = null;

      if (format === 'legacy') {
        varName = extractVarName(content);
        if (!varName) throw new Error('No se pudo determinar el nombre de la variable');
        entries = parseTranslationFile(content, 'legacy');
      } else {
        entries = parseTranslationFile(content, 'json');
      }

      if (entries.length === 0) throw new Error('No hay entradas para traducir');

      setProgress({ current: 0, total: entries.length });

      const translatedEntries = [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];

        const cached = getTranslation(entry.value);
        if (cached) {
          translatedEntries.push({ key: entry.key, value: cached });
        } else {
          const result = await translateText(entry.value, targetLang, engine);
          if (result.success) {
            let translated = result.text;
            if (normalize) translated = normalizeText(translated);
            await saveTranslation(entry.value, translated);
            translatedEntries.push({ key: entry.key, value: translated });
          } else {
            // Si falla, mantener original
            translatedEntries.push({ key: entry.key, value: entry.value });
          }
        }

        setProgress({ current: i + 1, total: entries.length });
        if (onProgress) onProgress(i + 1, entries.length);
      }

      // Reconstruir archivo según formato
      if (format === 'legacy' && varName) {
        return buildTranslationFile(varName, translatedEntries, 'legacy');
      } else {
        return buildTranslationFile('', translatedEntries, 'json');
      }
    } catch (error) {
      console.error('Error en traducción:', error);
      return null;
    } finally {
      setIsTranslating(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  return {
    isTranslating,
    progress,
    translateFile
  };
}
