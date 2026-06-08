// src/services/converter.ts
// Conversión entre formato legacy (.txt) y moderno (.json) con manejo de prefijos específico por tipo

// Lista de tipos de traducción conocidos y sus prefijos
const TYPE_PREFIXES: Record<string, string> = {
  'ItemName': 'ItemName_',
  'Recipes': 'Recipe_',
  'ContextMenu': 'ContextMenu_',
  'IG_UI': 'IGUI_',
  'Tooltip': 'Tooltip_',
  'GameSound': 'GameSound_',
  'Sandbox': 'Sandbox_',
  'UI': 'UI_',
  'Farming': 'Farming_',
  'Moodles': 'Moodles_',
  'Moveables': 'Moveables_',
  'MultiStageBuild': 'MultiStageBuild_',
  'EvolvedRecipeName': 'EvolvedRecipeName_',
  'DynamicRadio': 'DynamicRadio_',
  'Stash': 'Stash_',
  'SurvivalGuide': 'SurvivalGuide_',
  'MakeUp': 'MakeUp_',
  'Challenge': 'Challenge_'
};

// Tipos que en formato moderno (JSON) NO incluyen el prefijo en las claves
// Según observación del usuario: solo Recipes e ItemName
const TYPES_WITHOUT_PREFIX = new Set(['ItemName', 'Recipes']);

/**
 * Obtiene el tipo de archivo a partir del nombre (sin sufijo _XX)
 * Ej: "Recipes_ES.json" -> "Recipes"
 */
function getFileType(fileName: string): string | null {
  const base = fileName.replace(/_[A-Z]{2,4}\.(txt|json)$/, '').replace(/\.(txt|json)$/, '');
  return base in TYPE_PREFIXES ? base : null;
}

/**
 * Convierte contenido de archivo legacy (.txt) a moderno (.json)
 * Elimina el prefijo de las claves solo si el tipo lo requiere (TYPES_WITHOUT_PREFIX)
 */
export function legacyToModern(content: string, fileName: string): string {
  const fileType = getFileType(fileName);
  const prefix = fileType ? TYPE_PREFIXES[fileType] : '';

  const match = content.match(/^\s*[a-zA-Z0-9_]+\s*=\s*\{([\s\S]*)\}\s*$/);
  if (!match) return content; // No es formato legacy reconocible

  const inner = match[1];
  const lines = inner.split('\n');
  const obj: Record<string, string> = {};

  const regex = /^\s*([a-zA-Z0-9_.-]+)\s*=\s*"((?:\\.|[^"\\])*)"\s*,?\s*$/;
  for (const line of lines) {
    const m = line.match(regex);
    if (m) {
      let key = m[1];
      const val = m[2].replace(/\\"/g, '"');
      // Si el tipo no usa prefijo en moderno y la clave comienza con el prefijo, lo eliminamos
      if (fileType && TYPES_WITHOUT_PREFIX.has(fileType) && prefix && key.startsWith(prefix)) {
        key = key.substring(prefix.length);
      }
      // Para tipos que sí usan prefijo, dejamos la clave como está (ya incluye el prefijo)
      obj[key] = val;
    }
  }

  return JSON.stringify(obj, null, 2);
}

/**
 * Convierte contenido de archivo moderno (.json) a legacy (.txt)
 * Añade el prefijo a las claves solo si el tipo lo requiere (TYPES_WITHOUT_PREFIX)
 * Para tipos con prefijo, se asume que la clave ya incluye el prefijo y se deja igual.
 */
export function modernToLegacy(content: string, fileName: string): string {
  const fileType = getFileType(fileName);
  const prefix = fileType ? TYPE_PREFIXES[fileType] : '';
  const varName = fileName.replace(/_[A-Z]{2,4}\.json$/, '').replace('.json', '');

  try {
    const obj = JSON.parse(content);
    const entries = Object.entries(obj).map(([key, value]) => {
      let finalKey = key;
      // Si el tipo no usa prefijo en moderno, entonces en legacy debemos añadirlo
      if (fileType && TYPES_WITHOUT_PREFIX.has(fileType)) {
        finalKey = prefix + key;
      }
      // Si el tipo usa prefijo, asumimos que key ya lo incluye, así que lo dejamos igual
      const escapedVal = String(value).replace(/"/g, '\\"');
      return `    ${finalKey} = "${escapedVal}",`;
    });
    return `${varName} = {\n${entries.join('\n')}\n}`;
  } catch {
    return content; // Si no es JSON válido, se devuelve igual
  }
}

/**
 * Extrae el nombre de la variable de un archivo legacy
 */
export function extractVarName(content: string): string | null {
  const match = content.match(/^\s*([a-zA-Z0-9_]+)\s*=\s*\{/);
  return match ? match[1] : null;
}
