import React from 'react';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}

const Editor: React.FC<EditorProps> = ({ value, onChange, readOnly = false, placeholder }) => {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      readOnly={readOnly}
      placeholder={placeholder}
      className="plain-editor"
      spellCheck={false}
    />
  );
};

export default Editor;
