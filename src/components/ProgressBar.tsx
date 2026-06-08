import React from 'react';
import { FaStopCircle } from 'react-icons/fa';
import kasualLogo from '../assets/kasual-logo-small.png';
import './ProgressBar.css';

interface ProgressBarProps {
  visible: boolean;
  progress?: number;
  text?: string;
  onAbort?: () => void;
  abortText?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ visible, progress, text, onAbort, abortText = 'Abort' }) => {
  if (!visible) return null;

  const isIndeterminate = progress === undefined;
  const progressStyle = isIndeterminate
    ? { width: '50%' }
    : { width: `${Math.min(100, Math.max(0, progress))}%` };

  return (
    <div className="progress-track">
      <div className={`progress-fill ${isIndeterminate ? 'indeterminate' : ''}`} style={progressStyle}>
        {!isIndeterminate && <span className="progress-text">{Math.round(progress)}%</span>}
      </div>
      <img className="progress-runner" src={kasualLogo} alt="" style={{ left: isIndeterminate ? '50%' : `${progress}%` }} />
      {text && <div className="progress-text-outside">{text}</div>}
      {onAbort && (
        <button className="abort-btn" onClick={onAbort}>
          <FaStopCircle aria-hidden="true" /> {abortText}
        </button>
      )}
    </div>
  );
};

export default ProgressBar;
