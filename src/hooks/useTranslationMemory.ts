import { useEffect, useState } from 'react';
import Dexie from 'dexie';

const db = new Dexie('KasualNeonDB');
db.version(31).stores({
  memory: 'original,translation'
});

export interface MemoryEntry {
  original: string;
  translation: string;
}

export function useTranslationMemory() {
  const [memory, setMemory] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const loadMemory = async () => {
      const entries = await db.table('memory').toArray() as MemoryEntry[];
      const map = new Map(entries.map(e => [e.original, e.translation]));
      setMemory(map);
    };
    loadMemory();
  }, []);

  const saveTranslation = async (original: string, translation: string) => {
    await db.table('memory').put({ original, translation });
    setMemory(prev => new Map(prev).set(original, translation));
  };

  const getTranslation = (original: string): string | undefined => {
    return memory.get(original);
  };

  return { memory, saveTranslation, getTranslation };
}