import React, { useEffect, useRef } from 'react';
import type { TranslationFile } from '../types';

interface DiffViewProps {
  file: TranslationFile | null;
  rightIdColor?: string;
  rightTextColor?: string;
  emptyText?: string;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function splitLineIntoIdAndText(line: string, idColor: string, textColor: string, isJson: boolean): string {
  if (isJson) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      return `<span class="line-text"><span class="text-part" style="color:${textColor}">${line}</span></span>`;
    }
    const idPart = line.substring(0, colonIndex).trim();
    const textPart = line.substring(colonIndex + 1).trim();
    return `<span class="line-text"><span class="id-part" style="color:${idColor}">${idPart}</span>: <span class="text-part" style="color:${textColor}">${textPart}</span></span>`;
  }

  const equalIndex = line.indexOf('=');
  if (equalIndex === -1) {
    return `<span class="line-text"><span class="text-part" style="color:${textColor}">${line}</span></span>`;
  }
  const idPart = line.substring(0, equalIndex).trim();
  const textPart = line.substring(equalIndex + 1).trim();
  return `<span class="line-text"><span class="id-part" style="color:${idColor}">${idPart}</span> = <span class="text-part" style="color:${textColor}">${textPart}</span></span>`;
}

const DiffView: React.FC<DiffViewProps> = ({
  file,
  rightIdColor = '#F5A645',
  rightTextColor = '#f1fa8c',
  emptyText = 'Select a file to view differences'
}) => {
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleContentScroll = () => {
    if (lineNumbersRef.current && contentRef.current) {
      lineNumbersRef.current.scrollTop = contentRef.current.scrollTop;
    }
  };

  useEffect(() => {
    if (!file) return;

    // Normalizar saltos de línea y dividir
    const originalLines = file.originalContent.split(/\r?\n/);
    const workingLines = file.workingContent.split(/\r?\n/);
    const committedLines = file.committedContent.split(/\r?\n/);

    // Eliminar última línea vacía si el archivo termina en salto de línea
    if (originalLines.length > 0 && originalLines[originalLines.length - 1] === '') {
      originalLines.pop();
    }
    // Nota: workingLines y committedLines pueden tener diferente longitud,
    // pero compararemos por índice; si no existe, se tratará como null.

    const isJson = file.name.endsWith('.json');

    // Generar contenido con su estado
    let html = '';
    for (let i = 0; i < originalLines.length; i++) {
      const origLine = originalLines[i] || '';
      const workLine = i < workingLines.length ? workingLines[i] : null;
      const commitLine = i < committedLines.length ? committedLines[i] : null;

      // Determinar estado
      let statusSymbol: string;
      let statusClass: string;

      if (workLine === null) {
        // Línea eliminada (no existe en working)
        statusSymbol = '●';
        statusClass = 'status-deleted';
      } else if (workLine !== commitLine) {
        // Línea modificada sin guardar
        statusSymbol = '●';
        statusClass = 'status-unsaved';
      } else if (commitLine !== origLine) {
        // Línea guardada (committed diferente de original)
        statusSymbol = '●';
        statusClass = 'status-saved';
      } else {
        // Sin cambios
        statusSymbol = '●';
        statusClass = 'status-unchanged';
      }

      const escapedLine = escapeHtml(origLine);
      const parts = splitLineIntoIdAndText(escapedLine, rightIdColor, rightTextColor, isJson);
      html += `<div class="diff-line"><span class="status-indicator ${statusClass}">${statusSymbol}</span>${parts}</div>`;
    }

    if (contentRef.current) {
      contentRef.current.innerHTML = html;
    }

    // Generar números de línea (siempre 1..originalLines.length)
    let lineNumbersHtml = '';
    for (let i = 1; i <= originalLines.length; i++) {
      lineNumbersHtml += `<div>${i}</div>`;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.innerHTML = lineNumbersHtml;
    }

    // Reset scroll al cambiar de archivo
    if (contentRef.current) contentRef.current.scrollTop = 0;
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = 0;
  }, [file, rightIdColor, rightTextColor]);

  if (!file) {
    return <div className="diff-view empty">{emptyText}</div>;
  }

  return (
    <div className="diff-view">
      <div className="diff-line-numbers" ref={lineNumbersRef}></div>
      <div
        className="diff-content"
        ref={contentRef}
        onScroll={handleContentScroll}
      ></div>
    </div>
  );
};

export default DiffView;
