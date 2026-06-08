import { useState } from 'react';
import type { Extra } from '../types';

const STORAGE_KEY = 'kasual_extras';
type Translator = (key: string, ...args: Array<string | number>) => string;

function loadStoredExtras(): Extra[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is Extra =>
        item && typeof item === 'object' && 'id' in item && 'name' in item && 'icon' in item && 'action' in item
    );
  } catch (error) {
    console.error('Error al cargar extras:', error);
    return [];
  }
}

export function useExtras() {
  const [extras, setExtras] = useState<Extra[]>(loadStoredExtras);
  const [editingExtra, setEditingExtra] = useState<Extra | null>(null);

  const saveExtras = (newExtras: Extra[]) => {
    setExtras(newExtras);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newExtras));
  };

  const addExtra = (extra: Omit<Extra, 'id'>) => {
    const newExtra: Extra = {
      ...extra,
      id: Date.now().toString(36) + Math.random().toString(36).substring(2)
    };
    saveExtras([...extras, newExtra]);
    return newExtra;
  };

  const updateExtra = (id: string, updated: Partial<Omit<Extra, 'id'>>) => {
    const newExtras = extras.map(extra => (extra.id === id ? { ...extra, ...updated } : extra));
    saveExtras(newExtras);
  };

  const deleteExtra = (id: string) => {
    saveExtras(extras.filter(extra => extra.id !== id));
    if (editingExtra?.id === id) setEditingExtra(null);
  };

  const executeExtra = (extra: Extra, t: Translator) => {
    try {
      const func = new Function(extra.action);
      func();
    } catch (error) {
      console.error('Error al ejecutar extra:', error);
      const message = error instanceof Error ? error.message : String(error);
      alert(t('extra_execute_failed', message));
    }
  };

  const importExtras = (jsonData: string, t: Translator): { success: boolean; count?: number; error?: string } => {
    try {
      const imported = JSON.parse(jsonData);
      if (Array.isArray(imported)) {
        const validExtras = imported.filter(e => e && typeof e === 'object' && e.name && e.action);
        saveExtras([...extras, ...validExtras]);
        return { success: true, count: validExtras.length };
      }
      return { success: false, error: t('extra_import_invalid_array') };
    } catch {
      return { success: false, error: t('extra_import_invalid_json') };
    }
  };

  const exportExtras = (): string => {
    return JSON.stringify(extras, null, 2);
  };

  return {
    extras,
    editingExtra,
    setEditingExtra,
    addExtra,
    updateExtra,
    deleteExtra,
    executeExtra,
    importExtras,
    exportExtras
  };
}
