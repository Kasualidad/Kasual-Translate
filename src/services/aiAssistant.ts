import { buildTranslationFile, detectFormat, extractVarName, parseTranslationFile } from './translator';
import { getLanguageLabel } from '../constants/languages';

export type AIProviderConfig = {
  endpoint: string;
  apiKey: string;
  model: string;
};

export type GlossaryEntry = {
  source: string;
  target: string;
};

export type AIReviewIssue = {
  key: string;
  severity: 'warning' | 'error';
  message: string;
};

const TOKEN_PATTERN = /(%[\d]+|%s|<[^>]+>|\{[^}]+\}|\\[ntr])/g;

function getTokens(text: string): string[] {
  return text.match(TOKEN_PATTERN) || [];
}

function buildGlossaryPrompt(glossary: GlossaryEntry[]) {
  if (glossary.length === 0) return 'No custom glossary.';
  return glossary
    .filter(entry => entry.source.trim() && entry.target.trim())
    .map(entry => `- ${entry.source.trim()} => ${entry.target.trim()}`)
    .join('\n');
}

async function callChatCompletion(config: AIProviderConfig, messages: Array<{ role: 'system' | 'user'; content: string }>) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey.trim()) headers.Authorization = `Bearer ${config.apiKey.trim()}`;

  let response: Response;
  try {
    response = await fetch(config.endpoint.trim(), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model.trim(),
        temperature: 0.2,
        messages
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`NETWORK_ERROR: ${message}`);
  }

  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = data?.error?.message || data?.message || JSON.stringify(data);
    } catch {
      detail = await response.text().catch(() => '');
    }
    throw new Error(`HTTP_${response.status}${detail ? `: ${detail}` : ''}`);
  }
  const data = await response.json();
  return String(data?.choices?.[0]?.message?.content || '').trim();
}

export async function testAIConnection(config: AIProviderConfig): Promise<string> {
  const response = await callChatCompletion(config, [
    {
      role: 'system',
      content: 'Reply with exactly: OK'
    },
    {
      role: 'user',
      content: 'Connection test'
    }
  ]);
  return response || 'OK';
}

function parseJsonObject(text: string): Record<string, string> {
  const clean = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('AI response did not contain JSON');
  const parsed = JSON.parse(clean.slice(start, end + 1));
  return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
}

export async function translateDocumentWithAI(
  content: string,
  fileName: string,
  targetLang: string,
  config: AIProviderConfig,
  glossary: GlossaryEntry[]
): Promise<string> {
  const format = detectFormat(content);
  const varName = format === 'legacy' ? extractVarName(content) || fileName.replace(/\.(txt|json)$/i, '') : '';
  const entries = parseTranslationFile(content, format);
  const payload = Object.fromEntries(entries.map(entry => [entry.key, entry.value]));
  const targetLabel = getLanguageLabel(targetLang);

  const response = await callChatCompletion(config, [
    {
      role: 'system',
      content: [
        'You are a professional videogame localization assistant for Project Zomboid mods.',
        'Translate values only. Never translate keys.',
        'Preserve placeholders and control tokens exactly: %1, %s, {0}, <LINE>, <br>, \\n, \\t.',
        'Keep item names natural, concise, and consistent for survival game UI.',
        'Return only valid JSON object with the same keys.'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `Target language: ${targetLabel}`,
        `File: ${fileName}`,
        'Glossary:',
        buildGlossaryPrompt(glossary),
        'JSON entries:',
        JSON.stringify(payload, null, 2)
      ].join('\n\n')
    }
  ]);

  const translated = parseJsonObject(response);
  const nextEntries = entries.map(entry => ({
    key: entry.key,
    value: translated[entry.key] ?? entry.value
  }));

  return buildTranslationFile(varName, nextEntries, format);
}

export async function reviewDocumentWithAI(
  content: string,
  fileName: string,
  targetLang: string,
  config: AIProviderConfig | null,
  glossary: GlossaryEntry[]
): Promise<AIReviewIssue[]> {
  const format = detectFormat(content);
  const entries = parseTranslationFile(content, format);
  const localIssues: AIReviewIssue[] = [];

  for (const entry of entries) {
    if (!entry.value.trim()) {
      localIssues.push({ key: entry.key, severity: 'warning', message: 'Empty text' });
    }
    const tokens = getTokens(entry.value);
    if (new Set(tokens).size !== tokens.length) {
      localIssues.push({ key: entry.key, severity: 'warning', message: 'Repeated placeholder or token' });
    }
    if (/__TOKEN_\d+__/.test(entry.value)) {
      localIssues.push({ key: entry.key, severity: 'error', message: 'Protected token leaked into text' });
    }
    for (const glossaryEntry of glossary) {
      if (glossaryEntry.source && entry.value.toLowerCase().includes(glossaryEntry.source.toLowerCase()) && !entry.value.toLowerCase().includes(glossaryEntry.target.toLowerCase())) {
        localIssues.push({ key: entry.key, severity: 'warning', message: `Glossary candidate: ${glossaryEntry.source} => ${glossaryEntry.target}` });
      }
    }
  }

  if (!config || !config.endpoint.trim() || !config.model.trim()) return localIssues;

  try {
    const sample = Object.fromEntries(entries.slice(0, 120).map(entry => [entry.key, entry.value]));
    const targetLabel = getLanguageLabel(targetLang);
    const response = await callChatCompletion(config, [
      {
        role: 'system',
        content: [
          'You review Project Zomboid mod localization quality.',
          'Return only a JSON array: [{"key":"...","severity":"warning|error","message":"..."}].',
          'Check literal translations, untranslated English, broken placeholders, bad glossary usage, weird UI wording, and inconsistent survival-game terminology.'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `Target language: ${targetLabel}`,
          `File: ${fileName}`,
          'Glossary:',
          buildGlossaryPrompt(glossary),
          'Entries:',
          JSON.stringify(sample, null, 2)
        ].join('\n\n')
      }
    ]);
    const clean = response.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const start = clean.indexOf('[');
    const end = clean.lastIndexOf(']');
    if (start === -1 || end === -1) return localIssues;
    const aiIssues = JSON.parse(clean.slice(start, end + 1)) as AIReviewIssue[];
    return [...localIssues, ...aiIssues].slice(0, 80);
  } catch {
    return localIssues;
  }
}
