import React from 'react';
import './SourceToggle.css';

interface SourceToggleOption {
  label: string;
  value: string;
}

interface SourceToggleProps {
  options: SourceToggleOption[];
  value: string;
  onChange: (value: string) => void;
}

export const SourceToggle: React.FC<SourceToggleProps> = ({ options, value, onChange }) => {
  const activeIndex = Math.max(0, options.findIndex(o => o.value === value));

  return (
    <div className="source-toggle" style={{ ['--count' as any]: options.length }}>
      <div
        className="source-toggle-thumb"
        style={{ ['--active' as any]: activeIndex }}
      />
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`source-toggle-option ${opt.value === value ? 'is-active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};
