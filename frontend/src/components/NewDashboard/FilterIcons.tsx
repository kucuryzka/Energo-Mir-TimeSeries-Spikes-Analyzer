import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

export const SlidersIcon: React.FC<IconProps> = ({ size = 22, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <line x1="4" y1="6" x2="20" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="8" cy="6" r="2.2" stroke="currentColor" strokeWidth="2" fill="none" />

    <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="15" cy="12" r="2.2" stroke="currentColor" strokeWidth="2" fill="none" />

    <line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="9" cy="18" r="2.2" stroke="currentColor" strokeWidth="2" fill="none" />
  </svg>
);

export const RoundedGridIcon: React.FC<IconProps> = ({ size = 22, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="3" y="3" width="8" height="8" rx="2.2" stroke="currentColor" strokeWidth="2" />
    <rect x="13" y="3" width="8" height="8" rx="2.2" stroke="currentColor" strokeWidth="2" />
    <rect x="3" y="13" width="8" height="8" rx="2.2" stroke="currentColor" strokeWidth="2" />
    <rect x="13" y="13" width="8" height="8" rx="2.2" stroke="currentColor" strokeWidth="2" />
  </svg>
);
