import React, { useRef } from 'react';
import type { ReactNode } from 'react';
import type { TranslationFile } from '../types';
import './DiffPanel.css';

interface DiffPanelProps {
  file: TranslationFile | null;
  onNavigate?: (line: number) => void;
  t?: (key: string, ...args: Array<string | number>) => string;
}

const DiffPanel: React.FC<DiffPanelProps> = ({ file, onNavigate, t = (key) => key }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  if (!file) {
    return <div className="diff-panel empty">{t('no_file_selected')}</div>;
  }

  const workingLines = file.workingContent.split('\n');
  const committedLines = file.committedContent.split('\n');
  const originalLines = file.originalContent.split('\n');

  const renderDiff = () => {
    let iOrig = 0, iWork = 0;
    const elements: ReactNode[] = [];

    while (iOrig < originalLines.length || iWork < workingLines.length) {
      if (iOrig >= originalLines.length) {
        iWork++;
        continue;
      }
      if (iWork >= workingLines.length) {
        const origLine = originalLines[iOrig] || '';
        const parts = splitLine(escapeHtml(origLine));
        elements.push(
          <div key={`diff-${iOrig}`} className="diff-line deleted" data-line={iOrig + 1}>
            <span className="line-number">{iOrig + 1}</span>
            <span className="status">🟣</span>
            <span className="line-content">{parts}</span>
          </div>
        );
        iOrig++;
        continue;
      }

      const workLine = workingLines[iWork] || '';
      const commitLine = committedLines[iWork] || '';
      const origLine = originalLines[iOrig] || '';

      if (workLine === origLine && commitLine === origLine) {
        const parts = splitLine(escapeHtml(origLine));
        elements.push(
          <div key={`diff-${iOrig}`} className="diff-line unchanged" data-line={iOrig + 1}>
            <span className="line-number">{iOrig + 1}</span>
            <span className="status">⚪</span>
            <span className="line-content">{parts}</span>
          </div>
        );
        iOrig++;
        iWork++;
        continue;
      }

      // Buscar si la línea de trabajo existe más adelante en el original
      let found = false;
      for (let k = iOrig + 1; k < originalLines.length; k++) {
        if (originalLines[k] === workLine) {
          found = true;
          break;
        }
      }

      if (found) {
        const parts = splitLine(escapeHtml(origLine));
        elements.push(
          <div key={`diff-${iOrig}`} className="diff-line deleted" data-line={iOrig + 1}>
            <span className="line-number">{iOrig + 1}</span>
            <span className="status">🟣</span>
            <span className="line-content">{parts}</span>
          </div>
        );
        iOrig++;
      } else {
        let statusClass = '';
        let statusSymbol = '';
        if (workLine !== commitLine) {
          statusClass = 'unsaved';
          statusSymbol = '🔴';
        } else if (commitLine !== origLine) {
          statusClass = 'saved';
          statusSymbol = '🟢';
        } else {
          statusClass = 'unchanged';
          statusSymbol = '⚪';
        }
        const parts = splitLine(escapeHtml(origLine));
        elements.push(
          <div key={`diff-${iOrig}`} className={`diff-line ${statusClass}`} data-line={iOrig + 1}>
            <span className="line-number">{iOrig + 1}</span>
            <span className="status">{statusSymbol}</span>
            <span className="line-content">{parts}</span>
          </div>
        );
        iOrig++;
        iWork++;
      }
    }
    return elements;
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const diffLine = target.closest('.diff-line');
    if (diffLine && onNavigate) {
      const line = diffLine.getAttribute('data-line');
      if (line) {
        onNavigate(parseInt(line) - 1); // 0-based para editor
      }
    }
  };

  return (
    <div className="diff-panel" ref={containerRef} onClick={handleClick}>
      <div className="diff-header">{t('differences')}</div>
      <div className="diff-content">{renderDiff()}</div>
    </div>
  );
};

// Escapar HTML
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Dividir línea en ID y texto (formato "clave = valor")
function splitLine(line: string): React.ReactNode {
  const equalIndex = line.indexOf('=');
  if (equalIndex === -1) {
    return <span className="text-part">{line}</span>;
  }
  const idPart = line.substring(0, equalIndex).trim();
  const textPart = line.substring(equalIndex + 1).trim();
  return (
    <>
      <span className="id-part">{idPart}</span>
      <span className="equals"> = </span>
      <span className="text-part">{textPart}</span>
    </>
  );
}

export default DiffPanel;
