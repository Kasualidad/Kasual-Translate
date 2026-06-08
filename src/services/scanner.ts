// src/services/scanner.ts
// Escáner para mods con formato legacy (.txt) y extracción de scripts
import { getCanonicalPzLanguageSuffix, getPzLanguageSuffix } from '../constants/languages';

const TRANSLATION_TYPES = [
  'ItemName', 'Recipes', 'ContextMenu', 'IG_UI', 'Tooltip',
  'GameSound', 'Sandbox', 'UI', 'Farming', 'Moodles',
  'Moveables', 'MultiStageBuild', 'EvolvedRecipeName',
  'DynamicRadio', 'Stash', 'SurvivalGuide', 'MakeUp', 'Challenge'
];

const VALID_EXTENSIONS = new Set(['.txt', '.lua']);

export interface ScanResult {
  files: Array<{
    name: string;
    originalContent: string;
    workingContent: string;
    committedContent: string;
  }>;
  groups: Record<string, Record<string, Record<string, string>>>;
  newEntries: Record<string, Record<string, string>>;
  errors: string[];
  skipped: string[];
}

export async function scanModFolder(
  dirHandle: FileSystemDirectoryHandle,
  targetLang: string
): Promise<ScanResult> {
  const errors: string[] = [];
  const skipped: string[] = [];
  const groups: Record<string, Record<string, Record<string, string>>> = {};
  const newEntries: Record<string, Record<string, string>> = {};

  TRANSLATION_TYPES.forEach(type => { newEntries[type] = {}; });

  await scanDirectory(dirHandle, groups, newEntries, errors, skipped);

  const currentSuffix = getPzLanguageSuffix(targetLang);
  const files: ScanResult['files'] = [];

  for (const [baseName, langMap] of Object.entries(groups)) {
    const allowedSuffixes = [currentSuffix, 'EN'];
    const allKeys = new Set<string>();

    for (const suffix of allowedSuffixes) {
      if (langMap[suffix]) {
        Object.keys(langMap[suffix]).forEach(k => allKeys.add(k));
      }
    }

    const merged: Record<string, string> = {};
    for (const key of allKeys) {
      let value = null;
      if (langMap[currentSuffix]?.[key] !== undefined) value = langMap[currentSuffix][key];
      else if (langMap['EN']?.[key] !== undefined) value = langMap['EN'][key];
      if (value !== null) merged[key] = value;
    }

    if (newEntries[baseName]) {
      Object.assign(merged, newEntries[baseName]);
    }

    if (Object.keys(merged).length > 0) {
      const fileName = `${baseName}_${currentSuffix}.txt`;
      const content = formatAsFile(`${baseName}_${currentSuffix}`, merged);
      files.push({
        name: fileName,
        originalContent: content,
        workingContent: content,
        committedContent: content
      });
    }
  }

  for (const [type, entries] of Object.entries(newEntries)) {
    if (Object.keys(entries).length > 0 && !groups[type]) {
      const fileName = `${type}_${currentSuffix}.txt`;
      const content = formatAsFile(`${type}_${currentSuffix}`, entries);
      files.push({
        name: fileName,
        originalContent: content,
        workingContent: content,
        committedContent: content
      });
    }
  }

  return { files, groups, newEntries, errors, skipped };
}

async function scanDirectory(
  dirHandle: FileSystemDirectoryHandle,
  groups: Record<string, Record<string, Record<string, string>>>,
  newEntries: Record<string, Record<string, string>>,
  errors: string[],
  skipped: string[]
) {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') {
      await scanDirectory(entry, groups, newEntries, errors, skipped);
    } else if (entry.kind === 'file') {
      await processFile(entry, groups, newEntries, errors, skipped);
    }
  }
}

async function processFile(
  fileHandle: FileSystemFileHandle,
  groups: Record<string, Record<string, Record<string, string>>>,
  newEntries: Record<string, Record<string, string>>,
  errors: string[],
  skipped: string[]
) {
  const fileName = fileHandle.name;
  const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();

  if (!VALID_EXTENSIONS.has(ext)) {
    skipped.push(fileName);
    return;
  }

  try {
    const file = await fileHandle.getFile();
    const content = await file.text();

    if (isBinary(content)) {
      skipped.push(fileName + ' (binario)');
      return;
    }

    // Extraer de scripts Lua (items, recetas)
    await extractFromScript(content, newEntries);

    // Procesar archivos de traducción existentes (_XX.txt)
    const match = fileName.match(/^(.+)_([A-Z]{2,4})\.txt$/);
    if (match) {
      let baseName = match[1];
      const suffix = getCanonicalPzLanguageSuffix(match[2]);
      if (baseName === 'Items') baseName = 'ItemName';

      const entries = parseTranslationFile(content);
      if (Object.keys(entries).length === 0) return;

      if (!groups[baseName]) groups[baseName] = {};
      if (!groups[baseName][suffix]) groups[baseName][suffix] = {};
      Object.assign(groups[baseName][suffix], entries);
    }
  } catch (error) {
    errors.push(`Error en ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
  }
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
  newEntries: Record<string, Record<string, string>>
) {
  const lines = content.split('\n');
  let i = 0;
  let currentModule = 'Base';
  const addedKeys = new Set<string>(); // Para evitar duplicados dentro del mismo archivo

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

    // Items
    if (line.startsWith('item ')) {
      const itemMatch = line.match(/^item\s+(?:"([^"]+)"|([a-zA-Z0-9_-]+))/);
      if (itemMatch) {
        const itemName = itemMatch[1] || itemMatch[2];
        const displayName = extractFieldFromBlock(lines, i, 'DisplayName');
        if (displayName && isHumanReadable(displayName) && !displayName.startsWith('Tooltip_')) {
          const key = `ItemName_${currentModule}.${itemName}`;
          if (!addedKeys.has(key)) {
            newEntries['ItemName'][key] = displayName;
            addedKeys.add(key);
          }
        }
        const category = extractFieldFromBlock(lines, i, 'DisplayCategory');
        if (category && isHumanReadable(category)) {
          const catKey = `IGUI_ItemCat_${category.replace(/\s+/g, '_')}`;
          if (!addedKeys.has(catKey)) {
            newEntries['IG_UI'][catKey] = category;
            addedKeys.add(catKey);
          }
        }
        const tooltip = extractFieldFromBlock(lines, i, 'Tooltip');
        if (tooltip && isHumanReadable(tooltip) && !tooltip.startsWith('Tooltip_') && !tooltip.startsWith('IGUI_')) {
          const tooltipKey = `Tooltip_${itemName}`;
          if (!addedKeys.has(tooltipKey)) {
            newEntries['Tooltip'][tooltipKey] = tooltip;
            addedKeys.add(tooltipKey);
          }
        }
      }
      i = skipBlock(lines, i);
    }
    // Recetas
    else if (line.startsWith('recipe ')) {
      const recipeMatch = line.match(/^recipe\s+(.+?)(?:\s*\{|$)/);
      if (recipeMatch) {
        const rawName = recipeMatch[1].trim();
        
        // Determinar el nombre completo con módulo
        let fullName: string;
        if (rawName.includes('.')) {
          fullName = rawName;
        } else {
          fullName = `${currentModule}.${rawName}`;
        }
        
        fullName = fullName.replace(/\s+/g, ' ').trim();
        const key = `Recipe_${fullName}`;
        
        const displayName = extractFieldFromBlock(lines, i, 'DisplayName');
        if (displayName && isHumanReadable(displayName)) {
          if (!addedKeys.has(key)) {
            newEntries['Recipes'][key] = displayName;
            addedKeys.add(key);
          }
        }
      }
      i = skipBlock(lines, i);
    } else {
      i++;
    }
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

function parseTranslationFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const match = content.match(/\{\s*([\s\S]*?)\s*\}/);
  if (!match) return result;
  const inner = match[1];
  const lineRegex = /^\s*([a-zA-Z0-9_.-]+)\s*=\s*"((?:\\.|[^"\\])*)"\s*,?\s*$/gm;
  let m;
  while ((m = lineRegex.exec(inner)) !== null) {
    const val = m[2].replace(/\\"/g, '"');
    result[m[1]] = val;
  }
  return result;
}

function formatAsFile(varName: string, obj: Record<string, string>): string {
  const sortedKeys = Object.keys(obj).sort();
  const lines = [`${varName} = {`];
  for (const k of sortedKeys) {
    const v = obj[k];
    const escapedVal = v.replace(/"/g, '\\"');
    lines.push(`    ${k} = "${escapedVal}",`);
  }
  lines.push('}');
  return lines.join('\n');
}

function isHumanReadable(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  if (/^(Tooltip_|IGUI_|ItemName_|Recipe_)/.test(trimmed)) return false;
  if (!/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(trimmed)) return false;
  if (/^\d+$/.test(trimmed)) return false;
  const alphaNum = (trimmed.match(/[a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ]/g) || []).length;
  if (alphaNum / trimmed.length < 0.5) return false;
  return true;
}
