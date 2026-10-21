import React from 'react';
import { ExternalLink, ShieldCheck, Building2, MapPin, Landmark, FileText } from 'lucide-react';
import { TamilNaduEmblem } from './TamilNaduEmblem';

interface CmdaBuildingBannerProps {
  onLearnMoreClick?: () => void;
}

export const CmdaBuildingBanner: React.FC<CmdaBuildingBannerProps> = () => {
  return (
    <div className="w-full bg-slate-900 border-b border-amber-500/30 text-slate-100 overflow-hidden">
      {/* Top Official Government Utility Bar */}
      <div className="bg-slate-950 px-4 sm:px-6 py-1.5 border-b border-slate-800 text-[11px] sm:text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TamilNaduEmblem size={22} className="w-5 h-5 flex-shrink-0" />
          <span className="font-semibold tracking-wide text-amber-400">
            தமிழ்நாடு அரசு | Government of Tamil Nadu
          </span>
          <span className="hidden sm:inline text-slate-600">|</span>
          <span className="hidden sm:inline text-slate-300">
            Chennai Metropolitan Development Authority (CMDA)
          </span>
        </div>

        <div className="flex items-center gap-4 text-slate-400">
          <a
            href="https://www.cmdachennai.gov.in"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-amber-400 transition-colors flex items-center gap-1 font-medium"
          >
            <span>Official Portal (cmdachennai.gov.in)</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <span className="hidden md:inline text-slate-700">|</span>
          <a
            href="https://www.cmdachennai.gov.in/onlineppa.html"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex items-center gap-1 hover:text-cyan-400 transition-colors"
          >
            <FileText className="w-3 h-3 text-cyan-400" />
            <span>Online PPA & Planning Permissions</span>
          </a>
          <span className="hidden lg:inline text-slate-700">|</span>
          <span className="hidden lg:inline text-emerald-400 font-semibold flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Official GeoAI Monitoring Platform
          </span>
        </div>
      </div>

      {/* Main CMDA Government Header & Chennai Visual Hero */}
      <div className="relative bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-4 sm:px-6 py-4 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Branding Left Section */}
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-slate-900/90 rounded-xl border border-amber-500/40 shadow-lg flex-shrink-0">
              <TamilNaduEmblem size={52} className="w-13 h-13" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase">
                  CMDA Official GeoAI Portal
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 uppercase flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  Velachery CMA Zone 10
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-100 tracking-tight flex items-center gap-2">
                சென்னை பெருநகர் வளர்ச்சி குழுமம்
              </h1>
              <h2 className="text-sm sm:text-base font-semibold text-slate-300 tracking-normal mt-0.5">
                Chennai Metropolitan Development Authority — GeoAI Water & Encroachment Monitor
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
                Automated multi-spectral satellite raster analytics, lakebed recede tracking, Land Use Land Cover (LULC) transition detection, and urban encroachment monitoring for sustainable Chennai planning.
              </p>
            </div>
          </div>

          {/* Chennai Landmark Building Illustration & Quick Stats Right Section */}
          <div className="flex items-center gap-4 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80 shadow-md">
            {/* SVG Visual of CMDA Tower & Ripon Building Silhouette */}
            <div className="hidden sm:block w-36 h-20 relative flex-shrink-0">
              <svg viewBox="0 0 160 90" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Sky backdrop */}
                <rect width="160" height="90" rx="6" fill="#0f172a" />
                {/* CMDA Tower Silhouette */}
                <rect x="15" y="25" width="28" height="60" fill="#334155" />
                <rect x="18" y="20" width="22" height="5" fill="#f59e0b" />
                {/* Windows on CMDA tower */}
                <rect x="19" y="30" width="4" height="6" fill="#38bdf8" opacity="0.8" />
                <rect x="25" y="30" width="4" height="6" fill="#38bdf8" opacity="0.8" />
                <rect x="31" y="30" width="4" height="6" fill="#38bdf8" opacity="0.8" />
                <rect x="19" y="40" width="4" height="6" fill="#38bdf8" opacity="0.8" />
                <rect x="25" y="40" width="4" height="6" fill="#38bdf8" opacity="0.8" />
                <rect x="31" y="40" width="4" height="6" fill="#38bdf8" opacity="0.8" />
                <rect x="19" y="50" width="4" height="6" fill="#38bdf8" opacity="0.8" />
                <rect x="25" y="50" width="4" height="6" fill="#38bdf8" opacity="0.8" />
                <rect x="31" y="50" width="4" height="6" fill="#38bdf8" opacity="0.8" />

                {/* Chennai Ripon Building Clock Tower Silhouette */}
                <rect x="55" y="35" width="50" height="50" fill="#1e293b" />
                <path d="M55 35 L80 15 L105 35 Z" fill="#475569" />
                {/* Dome Spire */}
                <rect x="78" y="5" width="4" height="12" fill="#fbbf24" />
                <circle cx="80" cy="5" r="2.5" fill="#ef4444" />
                {/* Clock Face */}
                <circle cx="80" cy="28" r="5" fill="#f8fafc" stroke="#0f172a" strokeWidth="1" />
                <line x1="80" y1="28" x2="80" y2="25" stroke="#0f172a" strokeWidth="1.2" />
                <line x1="80" y1="28" x2="83" y2="28" stroke="#0f172a" strokeWidth="1.2" />

                {/* Chennai Metro / Urban Flyover Bridge Motif */}
                <path d="M110 50 Q135 45 160 55 V85 H110 Z" fill="#334155" opacity="0.7" />
                <line x1="110" y1="65" x2="160" y2="65" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 2" />

                {/* Water Body Reflection Wave */}
                <path d="M0 78 Q40 73 80 78 T160 78 V90 H0 Z" fill="#0284c7" opacity="0.6" />
                <path d="M0 83 Q40 80 80 83 T160 83 V90 H0 Z" fill="#38bdf8" opacity="0.4" />
              </svg>
            </div>

            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Building2 className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span className="font-semibold">CMA Jurisdiction:</span>
                <span className="text-amber-300 font-mono font-bold">5,904 sq.km</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Landmark className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span className="font-semibold">Study Region:</span>
                <span className="text-cyan-300">Velachery Lake & Marshland</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="font-semibold">Govt Regulations:</span>
                <span className="text-emerald-300">TNCDBR 2019 & TNT&CP Act</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
