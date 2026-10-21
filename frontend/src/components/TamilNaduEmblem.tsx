import React from 'react';

interface EmblemProps {
  className?: string;
  size?: number;
}

export const TamilNaduEmblem: React.FC<EmblemProps> = ({
  className = 'w-10 h-10',
  size = 40,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Government of Tamil Nadu Seal"
    >
      {/* Outer Golden Circle */}
      <circle cx="50" cy="50" r="48" fill="#0c2340" stroke="#f59e0b" strokeWidth="3" />
      <circle cx="50" cy="50" r="44" fill="none" stroke="#d97706" strokeWidth="1" strokeDasharray="3 2" />

      {/* Temple Gopuram (Tamil Nadu State Symbol) */}
      <path
        d="M50 12 L53 18 L47 18 Z
           M47 18 H53 L55 26 H45 Z
           M45 26 H55 L57 36 H43 Z
           M43 36 H57 L59 48 H41 Z
           M41 48 H59 L61 62 H39 Z
           M39 62 H61 L63 78 H37 Z"
        fill="#fbbf24"
        stroke="#78350f"
        strokeWidth="1"
      />

      {/* Gopuram Entrance Doorway */}
      <path d="M46 78 V66 C46 64 54 64 54 66 V78 Z" fill="#78350f" />

      {/* Kalasam (Top Spire Finials) */}
      <circle cx="50" cy="10" r="2" fill="#ef4444" />
      <circle cx="46" cy="11" r="1.5" fill="#f59e0b" />
      <circle cx="54" cy="11" r="1.5" fill="#f59e0b" />

      {/* Base Banner Platform */}
      <rect x="25" y="78" width="50" height="6" rx="2" fill="#d97706" stroke="#78350f" strokeWidth="0.8" />

      {/* Indian National Flag Ribbon Motif */}
      <path d="M25 84 H75 V87 H25 Z" fill="#f97316" />
      <path d="M25 87 H75 V90 H25 Z" fill="#ffffff" />
      <path d="M25 90 H75 V93 H25 Z" fill="#15803d" />
      <circle cx="50" cy="88.5" r="1.2" fill="#1e3a8a" />
    </svg>
  );
};
