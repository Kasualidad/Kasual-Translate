// src/services/translator.ts
import { getTranslatorLanguageCode } from '../constants/languages';

export type TranslationEngine = 'auto' | 'google' | 'libretranslate' | 'mymemory';

interface TranslationResult {
  success: boolean;
  text: string;
  engine?: string;
  error?: string;
}

export type FileFormat = 'legacy' | 'json';

/**
 * Detecta el formato del archivo (legacy .txt o JSON)
 */
export function detectFormat(content: string): FileFormat {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return 'json';
  }
  // Si empieza con un identificador seguido de '=', probablemente es legacy
  if (/^[a-zA-Z0-9_]+\s*=/.test(trimmed)) {
    return 'legacy';
  }
  // Por defecto, legacy
  return 'legacy';
}

/**
 * Extrae el nombre de la variable de un archivo legacy
 */
export function extractVarName(content: string): string | null {
  const match = content.match(/^\s*([a-zA-Z0-9_]+)\s*=\s*\{/);
  return match ? match[1] : null;
}

/**
 * Parsea un archivo de traducción (legacy o JSON) y devuelve las entradas
 */
export function parseTranslationFile(content: string, format: FileFormat): Array<{ key: string; value: string }> {
  const entries: Array<{ key: string; value: string }> = [];

  if (format === 'legacy') {
    const varNameMatch = content.match(/^\s*[a-zA-Z0-9_]+\s*=\s*\{([\s\S]*)\}\s*$/);
    if (!varNameMatch) return entries;

    const inner = varNameMatch[1];
    const lines = inner.split('\n');
    const regex = /^\s*([a-zA-Z0-9_.-]+)\s*=\s*"((?:\\.|[^"\\])*)"\s*,?\s*$/;

    for (const line of lines) {
      const m = line.match(regex);
      if (m) {
        const val = m[2].replace(/\\"/g, '"');
        entries.push({ key: m[1], value: val });
      }
    }
  } else {
    // Formato JSON
    try {
      const obj = JSON.parse(content);
      for (const [key, value] of Object.entries(obj)) {
        entries.push({ key, value: String(value) });
      }
    } catch (e) {
      console.error('Error parsing JSON:', e);
    }
  }
  return entries;
}

/**
 * Reconstruye un archivo de traducción a partir de las entradas
 */
export function buildTranslationFile(varName: string, entries: Array<{ key: string; value: string }>, format: FileFormat): string {
  const sorted = [...entries].sort((a, b) => a.key.localeCompare(b.key));

  if (format === 'legacy') {
    const lines = [`${varName} = {`];
    for (const entry of sorted) {
      const escaped = entry.value.replace(/"/g, '\\"');
      lines.push(`    ${entry.key} = "${escaped}",`);
    }
    lines.push('}');
    return lines.join('\n');
  } else {
    const obj: Record<string, string> = {};
    for (const entry of sorted) {
      obj[entry.key] = entry.value;
    }
    return JSON.stringify(obj, null, 2);
  }
}

// Funciones de traducción (sin cambios)
export async function translateText(
  text: string,
  targetLang: string,
  engine: TranslationEngine = 'auto'
): Promise<TranslationResult> {
  const translatorLang = getTranslatorLanguageCode(targetLang);
  if (engine === 'auto') {
    const engines: TranslationEngine[] = ['google', 'libretranslate', 'mymemory'];
    for (const eng of engines) {
      const result = await translateWithEngine(text, translatorLang, eng);
      if (result.success) return { ...result, engine: eng };
    }
    return { success: false, text, error: 'Todos los motores fallaron' };
  }
  return await translateWithEngine(text, translatorLang, engine);
}

async function translateWithEngine(
  text: string,
  targetLang: string,
  engine: TranslationEngine
): Promise<TranslationResult> {
  try {
    const { safeText, tokenMap } = protectTokens(text);
    let translated: string | null = null;

    switch (engine) {
      case 'google':
        translated = await translateGoogle(safeText, targetLang);
        break;
      case 'libretranslate':
        translated = await translateLibre(safeText, targetLang);
        break;
      case 'mymemory':
        translated = await translateMyMemory(safeText, targetLang);
        break;
      default:
        return { success: false, text, error: 'Motor no soportado' };
    }

    if (!translated) return { success: false, text, error: 'No se obtuvo traducción' };
    const finalText = restoreTokens(translated, tokenMap);
    return { success: true, text: finalText };
  } catch (error) {
    return {
      success: false,
      text,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function translateGoogle(text: string, targetLang: string): Promise<string | null> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.[0]?.[0]?.[0] || null;
}

async function translateLibre(text: string, targetLang: string): Promise<string | null> {
  const url = 'https://libretranslate.de/translate';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: 'auto', target: targetLang, format: 'text' })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.translatedText || null;
}

async function translateMyMemory(text: string, targetLang: string): Promise<string | null> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${targetLang}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.responseData?.translatedText || null;
}

function protectTokens(text: string): { safeText: string; tokenMap: Map<string, string> } {
  const tokenMap = new Map<string, string>();
  let tokenCounter = 0;
  const safeText = text.replace(/(%[\d]+|%s|<[^>]+>|\{[^}]+\}|\\[ntr])/g, (match) => {
    const token = `__TOKEN_${tokenCounter++}__`;
    tokenMap.set(token, match);
    return token;
  });
  return { safeText, tokenMap };
}

function restoreTokens(text: string, tokenMap: Map<string, string>): string {
  let result = text;
  tokenMap.forEach((value, token) => {
    result = result.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  });
  return result;
}

export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
