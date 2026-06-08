import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './ColorPicker.css';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  onClose: () => void;
  position: { x: number; y: number };
  label?: string;
}

const PRESET_COLORS = [
  '#ff79c6', '#f1fa8c', '#ff5555', '#55ff55', '#aa55ff', '#ffaa00',
  '#8be9fd', '#bd93f9', '#50fa7b', '#ffb86c', '#ff6e6e', '#6effe8'
];

const ColorPicker: React.FC<ColorPickerProps> = ({ color, onChange, onClose, position, label = 'Custom:' }) => {
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return createPortal(
    <div ref={pickerRef} className="floating-color-picker" style={{ left: position.x, top: position.y }}>
      <div className="preset-colors">
        {PRESET_COLORS.map(c => (
          <div
            key={c}
            className="color-swatch"
            style={{ backgroundColor: c, border: c === color ? '2px solid white' : '1px solid #4a4f55' }}
            onClick={() => { onChange(c); onClose(); }}
          />
        ))}
      </div>
      <div className="custom-color">
        <span>{label}</span>
        <input type="color" value={color} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>,
    document.body
  );
};

export default ColorPicker;
