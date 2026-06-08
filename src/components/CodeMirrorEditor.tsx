import { useEffect, useId, useRef, forwardRef, useImperativeHandle } from 'react';
import CodeMirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/dracula.css';
import 'codemirror/mode/lua/lua';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/addon/search/search';
import 'codemirror/addon/search/searchcursor';
import 'codemirror/addon/dialog/dialog';
import 'codemirror/addon/dialog/dialog.css';

interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  onScroll?: (scrollInfo: CodeMirror.ScrollInfo) => void;
  leftIdColor?: string;
  leftTextColor?: string;
  mode?: 'lua' | 'json';
}

export interface CodeMirrorEditorHandle {
  getEditor: () => CodeMirror.Editor | null;
}

const placeholderOverlay = {
  token: function(stream: CodeMirror.StringStream) {
    if (stream.match(/%[sd]|%\d+(\$\w+)?/)) {
      return 'placeholder';
    }
    stream.next();
    return null;
  }
};

const jsonKeyValueOverlay = {
  token: function(stream: CodeMirror.StringStream) {
    if (stream.match(/^"([^"\\]|\\.)*"\s*:/)) {
      return 'json-key';
    }
    if (stream.match(/^"([^"\\]|\\.)*"/)) {
      return 'json-string';
    }
    stream.next();
    return null;
  }
};

const CodeMirrorEditor = forwardRef<CodeMirrorEditorHandle, CodeMirrorEditorProps>(({
  value,
  onChange,
  onScroll,
  leftIdColor = '#F5A645',
  leftTextColor = '#f1fa8c',
  mode = 'lua'
}, ref) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const cmInstance = useRef<CodeMirror.Editor | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const reactId = useId();
  const instanceClass = `cm-color-scope-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const onChangeRef = useRef(onChange);
  const onScrollRef = useRef(onScroll);
  const initialValueRef = useRef(value);
  const initialModeRef = useRef(mode);
  const isSyncingFromProps = useRef(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onScrollRef.current = onScroll;
  }, [onScroll]);

  useImperativeHandle(ref, () => ({
    getEditor: () => cmInstance.current
  }));

  useEffect(() => {
    if (editorRef.current && !cmInstance.current) {
      const cmMode = initialModeRef.current === 'json' ? 'application/json' : 'lua';
      const cm = CodeMirror(editorRef.current, {
        value: initialValueRef.current,
        mode: cmMode,
        theme: 'dracula',
        lineNumbers: false,
        indentUnit: 4,
        lineWrapping: false,
        extraKeys: {
          'Ctrl-F': 'findPersistent',
          'Cmd-F': 'findPersistent'
        }
      });

      cm.on('change', () => {
        if (!isSyncingFromProps.current) {
          onChangeRef.current(cm.getValue());
        }
      });

      cm.on('scroll', (instance) => {
        if (onScrollRef.current) {
          const scrollInfo = instance.getScrollInfo();
          onScrollRef.current(scrollInfo);
        }
      });

      if (initialModeRef.current === 'json') {
        cm.addOverlay(jsonKeyValueOverlay);
      }
      cm.addOverlay(placeholderOverlay);

      cmInstance.current = cm;
    }

    return () => {
      if (cmInstance.current) {
        const cm = cmInstance.current;
        const wrapper = cm.getWrapperElement();
        if (wrapper && wrapper.parentNode) {
          wrapper.parentNode.removeChild(wrapper);
        }
        cmInstance.current = null;
      }
      if (styleRef.current && styleRef.current.parentNode) {
        styleRef.current.parentNode.removeChild(styleRef.current);
        styleRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const cm = cmInstance.current;
    if (cm && cm.getValue() !== value) {
      isSyncingFromProps.current = true;
      cm.setValue(value);
      isSyncingFromProps.current = false;
    }
  }, [value]);

  useEffect(() => {
    const cm = cmInstance.current;
    if (cm) {
      const cmMode = mode === 'json' ? 'application/json' : 'lua';
      cm.setOption('mode', cmMode);
      cm.removeOverlay(jsonKeyValueOverlay);
      cm.removeOverlay(placeholderOverlay);

      if (initialModeRef.current === 'json') {
        cm.addOverlay(jsonKeyValueOverlay);
      }
      cm.addOverlay(placeholderOverlay);
      cm.refresh();
    }
  }, [mode]);

  useEffect(() => {
    if (!styleRef.current) {
      styleRef.current = document.createElement('style');
      styleRef.current.id = `${instanceClass}-colors`;
      document.head.appendChild(styleRef.current);
    }

    const scope = `.${instanceClass}`;

    if (mode === 'lua') {
      styleRef.current.innerHTML = `
        ${scope} .cm-s-dracula .cm-string,
        ${scope} .cm-s-dracula .cm-string-2 {
          color: ${leftTextColor} !important;
        }
        ${scope} .cm-s-dracula .cm-variable,
        ${scope} .cm-s-dracula .cm-keyword,
        ${scope} .cm-s-dracula .cm-def,
        ${scope} .cm-s-dracula .cm-property {
          color: ${leftIdColor} !important;
        }
        ${scope} .cm-placeholder {
          background-color: rgba(255, 255, 0, 0.3) !important;
          border-radius: 3px !important;
          font-weight: bold !important;
          color: #ffaa00 !important;
          text-shadow: 0 0 2px black !important;
        }
      `;
    } else {
      styleRef.current.innerHTML = `
        ${scope} .cm-json-key {
          color: ${leftIdColor} !important;
        }
        ${scope} .cm-json-string {
          color: ${leftTextColor} !important;
        }
        ${scope} .cm-placeholder {
          background-color: rgba(255, 255, 0, 0.3) !important;
          border-radius: 3px !important;
          font-weight: bold !important;
          color: #ffaa00 !important;
          text-shadow: 0 0 2px black !important;
        }
      `;
    }

    const cm = cmInstance.current;
    if (cm) {
      cm.refresh();
    }
  }, [instanceClass, leftIdColor, leftTextColor, mode]);

  return <div ref={editorRef} className={`codemirror-editor ${instanceClass}`} />;
});

export default CodeMirrorEditor;
