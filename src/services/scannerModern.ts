// src/services/scannerModern.ts
// Escaner para mods con formato JSON (Build 42.15+) y extraccion desde scripts.
import { SUPPORTED_PZ_LANGUAGE_SUFFIXES, getCanonicalPzLanguageSuffix, getPzLanguageSuffix } from '../constants/languages';

const TRANSLATION_TYPES = [
  'ItemName', 'Recipes', 'ContextMenu', 'IG_UI', 'Tooltip',
  'GameSound', 'Sandbox', 'UI', 'Farming', 'Moodles',
  'Moveables', 'MultiStageBuild', 'EvolvedRecipeName',
  'DynamicRadio', 'Stash', 'SurvivalGuide', 'MakeUp', 'Challenge'
];

const VALID_EXTENSIONS = new Set(['.json', '.txt', '.lua']);
const TYPES_WITHOUT_PREFIX = new Set(['ItemName', 'Recipes']);
const TYPE_PREFIXES: Record<string, string> = {
  ItemName: 'ItemName_',
  Recipes: 'Recipe_',
  ContextMenu: 'ContextMenu_',
  IG_UI: 'IGUI_',
  Tooltip: 'Tooltip_',
  GameSound: 'GameSound_',
  Sandbox: 'Sandbox_',
  UI: 'UI_',
  Farming: 'Farming_',
  Moodles: 'Moodles_',
  Moveables: 'Moveables_',
  MultiStageBuild: 'MultiStageBuild_',
  EvolvedRecipeName: 'EvolvedRecipeName_',
  DynamicRadio: 'DynamicRadio_',
  Stash: 'Stash_',
  SurvivalGuide: 'SurvivalGuide_',
  MakeUp: 'MakeUp_',
  Challenge: 'Challenge_'
};

type TranslationMap = Record<string, string>;
type LanguageMap = Record<string, TranslationMap>;

export interface ScanResult {
  files: Array<{
    name: string;
    originalContent: string;
    workingContent: string;
    committedContent: string;
  }>;
  groups: Record<string, LanguageMap>;
  newEntries: Record<string, TranslationMap>;
  errors: string[];
  skipped: string[];
}

export async function scanModFolderModern(
  dirHandle: FileSystemDirectoryHandle,
  targetLang: string
): Promise<ScanResult> {
  const errors: string[] = [];
  const skipped: string[] = [];
  const groups: Record<string, LanguageMap> = {};
  const newEntries: Record<string, TranslationMap> = {};

  TRANSLATION_TYPES.forEach(type => { newEntries[type] = {}; });

  await scanDirectory(dirHandle, [], groups, newEntries, errors, skipped);

  const files = generateModernFiles(groups, newEntries, targetLang);

  return { files, groups, newEntries, errors, skipped };
}

export function generateModernFiles(
  groups: Record<string, LanguageMap>,
  newEntries: Record<string, TranslationMap>,
  targetLang: string
): ScanResult['files'] {
  const files: ScanResult['files'] = [];
  const currentSuffix = getPzLanguageSuffix(targetLang);
  const allTypes = new Set([...Object.keys(groups), ...Object.keys(newEntries)]);

  for (const type of [...allTypes].sort()) {
    const langMap = groups[type] || {};
    const merged: TranslationMap = {};

    if (langMap.EN) Object.assign(merged, langMap.EN);
    if (langMap[currentSuffix]) Object.assign(merged, langMap[currentSuffix]);
    if (newEntries[type]) Object.assign(merged, newEntries[type]);

    if (Object.keys(merged).length > 0) {
      const fileName = `${type}_${currentSuffix}.json`;
      const content = JSON.stringify(sortObject(merged), null, 2);
      files.push({
        name: fileName,
        originalContent: content,
        workingContent: content,
        committedContent: content
      });
    }
  }

  return files;
}

async function scanDirectory(
  dirHandle: FileSystemDirectoryHandle,
  pathParts: string[],
  groups: Record<string, LanguageMap>,
  newEntries: Record<string, TranslationMap>,
  errors: string[],
  skipped: string[]
) {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') {
      await scanDirectory(entry, [...pathParts, entry.name], groups, newEntries, errors, skipped);
    } else if (entry.kind === 'file') {
      await processFile(entry, pathParts, groups, newEntries, errors, skipped);
    }
  }
}

async function processFile(
  fileHandle: FileSystemFileHandle,
  pathParts: string[],
  groups: Record<string, LanguageMap>,
  newEntries: Record<string, TranslationMap>,
  errors: string[],
  skipped: string[]
) {
  const fileName = fileHandle.name;
  const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
  const displayPath = [...pathParts, fileName].join('/');

  if (!VALID_EXTENSIONS.has(ext)) {
    skipped.push(displayPath);
    return;
  }

  try {
    const file = await fileHandle.getFile();
    const content = await file.text();

    if (isBinary(content)) {
      skipped.push(`${displayPath} (binario)`);
      return;
    }

    if (ext === '.json') {
      processJsonTranslationFile(content, fileName, pathParts, groups);
    } else {
      await extractFromScript(content, newEntries);
    }
  } catch (error) {
    errors.push(`Error en ${displayPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function processJsonTranslationFile(
  content: string,
  fileName: string,
  pathParts: string[],
  groups: Record<string, LanguageMap>
) {
  const baseName = normalizeTypeName(fileName.replace(/\.json$/i, ''));
  if (!TRANSLATION_TYPES.includes(baseName)) return;

  const langCode = findLanguageCode(pathParts);
  if (!langCode) return;

  const jsonData = JSON.parse(content) as unknown;
  if (!jsonData || typeof jsonData !== 'object' || Array.isArray(jsonData)) {
    throw new Error('El JSON de traduccion debe ser un objeto de clave/valor');
  }

  const entries: TranslationMap = {};
  for (const [key, value] of Object.entries(jsonData)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      entries[normalizeModernKey(baseName, key)] = String(value);
    }
  }

  if (Object.keys(entries).length === 0) return;
  if (!groups[baseName]) groups[baseName] = {};
  if (!groups[baseName][langCode]) groups[baseName][langCode] = {};
  Object.assign(groups[baseName][langCode], entries);
}

function findLanguageCode(pathParts: string[]): string | null {
  for (let i = pathParts.length - 1; i >= 0; i--) {
    const code = getCanonicalPzLanguageSuffix(pathParts[i]);
    if (SUPPORTED_PZ_LANGUAGE_SUFFIXES.has(code)) return code;
  }
  return null;
}

function normalizeTypeName(type: string): string {
  return type === 'Items' ? 'ItemName' : type;
}

function normalizeModernKey(type: string, key: string): string {
  const prefix = TYPE_PREFIXES[type];
  if (prefix && TYPES_WITHOUT_PREFIX.has(type) && key.startsWith(prefix)) {
    return key.substring(prefix.length);
  }
  return key;
}

function toModernKey(type: string, legacyKey: string): string {
  return normalizeModernKey(type, legacyKey);
}

function sortObject(obj: TranslationMap): TranslationMap {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

function isBinary(content: string): boolean {
  if (content.length === 0) return false;
  let controlCount = 0;
  for (let i = 0; i < Math.min(1000, content.length); i++) {
    const code = content.charCodeAt(i);
    if (code === 0 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) controlCount++;
  }
  return (controlCount / Math.min(1000, content.length)) > 0.1;
}

async function extractFromScript(
  content: string,
  newEntries: Record<string, TranslationMap>
) {
  const lines = content.split('\n');
  let i = 0;
  let currentModule = 'Base';
  const addedKeys = new Set<string>();

  for (let j = 0; j < Math.min(20, lines.length); j++) {
    const line = lines[j].trim();
    const moduleMatch = line.match(/^module\s+([a-zA-Z0-9_]+)/);
    if (moduleMatch) {
      currentModule = moduleMatch[1];
      break;
    }
  }

  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.startsWith('item ')) {
      const itemMatch = line.match(/^item\s+(?:"([^"]+)"|([a-zA-Z0-9_-]+))/);
      if (itemMatch) {
        const itemName = itemMatch[1] || itemMatch[2];
        const displayName = extractFieldFromBlock(lines, i, 'DisplayName');
        if (displayName && isHumanReadable(displayName) && !displayName.startsWith('Tooltip_')) {
          addEntry(newEntries, addedKeys, 'ItemName', `${currentModule}.${itemName}`, displayName);
        }

        const category = extractFieldFromBlock(lines, i, 'DisplayCategory');
        if (category && isHumanReadable(category)) {
          addEntry(newEntries, addedKeys, 'IG_UI', `IGUI_ItemCat_${category.replace(/\s+/g, '_')}`, category);
        }

        const tooltip = extractFieldFromBlock(lines, i, 'Tooltip');
        if (tooltip && isHumanReadable(tooltip) && !tooltip.startsWith('Tooltip_') && !tooltip.startsWith('IGUI_')) {
          addEntry(newEntries, addedKeys, 'Tooltip', `Tooltip_${itemName}`, tooltip);
        }
      }
      i = skipBlock(lines, i);
    } else if (line.startsWith('recipe ')) {
      const recipeMatch = line.match(/^recipe\s+(.+?)(?:\s*\{|$)/);
      if (recipeMatch) {
        let rawName = recipeMatch[1].trim();
        rawName = rawName.includes('.') ? rawName : `${currentModule}.${rawName}`;
        const fullName = rawName.replace(/\s+/g, ' ').trim();
        const displayName = extractFieldFromBlock(lines, i, 'DisplayName');
        if (displayName && isHumanReadable(displayName)) {
          addEntry(newEntries, addedKeys, 'Recipes', fullName, displayName);
        }
      }
      i = skipBlock(lines, i);
    } else {
      i++;
    }
  }
}

function addEntry(
  newEntries: Record<string, TranslationMap>,
  addedKeys: Set<string>,
  type: string,
  key: string,
  value: string
) {
  const modernKey = toModernKey(type, key);
  const dedupeKey = `${type}:${modernKey}`;
  if (!addedKeys.has(dedupeKey)) {
    newEntries[type][modernKey] = value;
    addedKeys.add(dedupeKey);
  }
}

function extractFieldFromBlock(lines: string[], startLine: number, fieldName: string): string | null {
  let braceCount = 0;
  let inBlock = false;
  for (let j = startLine; j < lines.length; j++) {
    const line = lines[j].trim();
    if (!inBlock) {
      if (line.includes('{')) {
        inBlock = true;
        braceCount = (line.match(/{/g) || []).length;
      }
      continue;
    }
    braceCount += (line.match(/{/g) || []).length;
    braceCount -= (line.match(/}/g) || []).length;

    const regex = new RegExp(`${fieldName}\\s*=\\s*(.+)$`);
    const match = line.match(regex);
    if (match) {
      let value = match[1].trim();
      if (value.endsWith(',')) value = value.slice(0, -1).trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      return value;
    }

    if (braceCount <= 0) break;
  }
  return null;
}

function skipBlock(lines: string[], startLine: number): number {
  let braceCount = 0;
  let i = startLine;
  for (; i < lines.length; i++) {
    const line = lines[i];
    braceCount += (line.match(/{/g) || []).length;
    braceCount -= (line.match(/}/g) || []).length;
    if (braceCount === 0 && i > startLine) break;
  }
  return i + 1;
}

function isHumanReadable(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  if (/^(Tooltip_|IGUI_|ItemName_|Recipe_)/.test(trimmed)) return false;
  if (!/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(trimmed)) return false;
  if (/^\d+$/.test(trimmed)) return false;
  const alphaNum = (trimmed.match(/[a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ]/g) || []).length;
  return alphaNum / trimmed.length >= 0.5;
}
