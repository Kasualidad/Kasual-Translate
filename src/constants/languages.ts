export type TargetLanguage = {
  code: string;
  label: string;
  pzSuffix: string;
  translatorCode: string;
};

export const TARGET_LANGUAGES: TargetLanguage[] = [
  { code: 'ar', label: 'Español (AR)', pzSuffix: 'AR', translatorCode: 'es' },
  { code: 'ca', label: 'Català', pzSuffix: 'CA', translatorCode: 'ca' },
  { code: 'ch', label: '中文 (繁體)', pzSuffix: 'CH', translatorCode: 'zh-TW' },
  { code: 'cn', label: '中文 (简体)', pzSuffix: 'CN', translatorCode: 'zh-CN' },
  { code: 'cs', label: 'Čeština', pzSuffix: 'CS', translatorCode: 'cs' },
  { code: 'da', label: 'Dansk', pzSuffix: 'DA', translatorCode: 'da' },
  { code: 'de', label: 'Deutsch', pzSuffix: 'DE', translatorCode: 'de' },
  { code: 'en', label: 'English', pzSuffix: 'EN', translatorCode: 'en' },
  { code: 'es', label: 'Español', pzSuffix: 'ES', translatorCode: 'es' },
  { code: 'fi', label: 'Suomi', pzSuffix: 'FI', translatorCode: 'fi' },
  { code: 'fr', label: 'Français', pzSuffix: 'FR', translatorCode: 'fr' },
  { code: 'hu', label: 'Magyar', pzSuffix: 'HU', translatorCode: 'hu' },
  { code: 'id', label: 'Indonesia', pzSuffix: 'ID', translatorCode: 'id' },
  { code: 'it', label: 'Italiano', pzSuffix: 'IT', translatorCode: 'it' },
  { code: 'jp', label: '日本語', pzSuffix: 'JP', translatorCode: 'ja' },
  { code: 'ko', label: '한국어', pzSuffix: 'KO', translatorCode: 'ko' },
  { code: 'nl', label: 'Nederlands', pzSuffix: 'NL', translatorCode: 'nl' },
  { code: 'no', label: 'Norsk', pzSuffix: 'NO', translatorCode: 'no' },
  { code: 'ph', label: 'Tagalog', pzSuffix: 'PH', translatorCode: 'tl' },
  { code: 'pl', label: 'Polski', pzSuffix: 'PL', translatorCode: 'pl' },
  { code: 'pt', label: 'Português', pzSuffix: 'PT', translatorCode: 'pt' },
  { code: 'ptbr', label: 'Português (Brasil)', pzSuffix: 'PTBR', translatorCode: 'pt-BR' },
  { code: 'ro', label: 'Română', pzSuffix: 'RO', translatorCode: 'ro' },
  { code: 'ru', label: 'Русский', pzSuffix: 'RU', translatorCode: 'ru' },
  { code: 'th', label: 'ไทย', pzSuffix: 'TH', translatorCode: 'th' },
  { code: 'tr', label: 'Türkçe', pzSuffix: 'TR', translatorCode: 'tr' },
  { code: 'ua', label: 'Українська', pzSuffix: 'UA', translatorCode: 'uk' }
];

const LANGUAGE_ALIASES: Record<string, string> = {
  ja: 'jp',
  jp: 'jp',
  br: 'ptbr'
};

export const SUPPORTED_PZ_LANGUAGE_SUFFIXES = new Set(TARGET_LANGUAGES.map(language => language.pzSuffix));

export function normalizeLanguageCode(code: string | null | undefined): string {
  const normalized = (code || 'es').toLowerCase();
  return LANGUAGE_ALIASES[normalized] || normalized;
}

function findLanguage(code: string) {
  const normalized = normalizeLanguageCode(code);
  return TARGET_LANGUAGES.find(language => language.code === normalized);
}

export function getLanguageLabel(code: string): string {
  return findLanguage(code)?.label || code.toUpperCase();
}

export function getPzLanguageSuffix(code: string): string {
  return findLanguage(code)?.pzSuffix || code.toUpperCase();
}

export function getCanonicalPzLanguageSuffix(suffix: string): string {
  const upper = suffix.toUpperCase();
  if (upper === 'JA') return 'JP';
  if (upper === 'BR') return 'PTBR';
  return SUPPORTED_PZ_LANGUAGE_SUFFIXES.has(upper) ? upper : upper;
}

export function getTranslatorLanguageCode(code: string): string {
  return findLanguage(code)?.translatorCode || code;
}
