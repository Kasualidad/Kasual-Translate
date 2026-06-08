type LocaleDictionary = Record<string, string>;

const localeModules = import.meta.glob('./locales/*.json', {
  eager: true,
  query: '?raw',
  import: 'default'
}) as Record<string, string>;

export const UI_TRANSLATIONS = Object.fromEntries(
  Object.entries(localeModules).map(([path, source]) => {
    const code = path.match(/\/([^/]+)\.json$/)?.[1] || 'es';
    return [code, JSON.parse(source) as LocaleDictionary];
  })
) as Record<string, LocaleDictionary>;

export function createTranslator(languageCode: string) {
  const dictionary = UI_TRANSLATIONS[languageCode] || UI_TRANSLATIONS.es;
  const fallback = UI_TRANSLATIONS.es || {};

  return (key: string, ...args: Array<string | number>): string => {
    const template = dictionary?.[key] || fallback[key] || key;
    return args.reduce<string>(
      (text, value, index) => text.replaceAll(`{${index}}`, String(value)),
      template
    );
  };
}
