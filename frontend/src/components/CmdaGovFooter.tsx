import React from 'react';
import { ExternalLink, ShieldCheck, FileText, PhoneCall, Globe, Building, Award } from 'lucide-react';
import { TamilNaduEmblem } from './TamilNaduEmblem';

export const CmdaGovFooter: React.FC = () => {
  return (
    <footer className="w-full bg-slate-950 border-t-2 border-amber-500/40 text-slate-300 text-xs mt-auto">
      {/* Upper Footer: Official Government Links Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {/* Col 1: Govt & CMDA Identity */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <TamilNaduEmblem size={36} className="w-9 h-9" />
            <div>
              <div className="text-amber-400 font-bold tracking-wide">
                சென்னை பெருநகர் வளர்ச்சி குழுமம்
              </div>
              <div className="text-slate-200 font-semibold text-xs">
                Chennai Metropolitan Development Authority
              </div>
            </div>
          </div>
          <p className="text-slate-400 leading-relaxed text-[11px] mb-3">
            Official GeoAI Water Encroachment Monitoring System for Velachery CMA Zone, developed under Tamil Nadu Town & Country Planning Regulations (TNCDBR 2019).
          </p>
          <div className="flex items-center gap-2 text-[11px] text-amber-400/90 font-medium">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span>Thalamuthu Natarajan Building, Egmore, Chennai - 600008</span>
          </div>
        </div>

        {/* Col 2: Citizen & Developer Quick Links */}
        <div>
          <h3 className="text-slate-100 font-bold tracking-wider uppercase text-xs mb-3 flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            CMDA Citizen Services
          </h3>
          <ul className="space-y-1.5 text-slate-400 text-[11px]">
            <li>
              <a
                href="https://www.cmdachennai.gov.in/onlineppa.html"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-amber-400 transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="w-3 h-3 text-cyan-400" />
                Online Planning Permission Application (PPA)
              </a>
            </li>
            <li>
              <a
                href="https://www.cmdachennai.gov.in/LUMaps/Index"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-amber-400 transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="w-3 h-3 text-cyan-400" />
                Masterplan Landuse Maps (CMA Zone)
              </a>
            </li>
            <li>
              <a
                href="https://www.cmdachennai.gov.in/approved_layout_reg.html"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-amber-400 transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="w-3 h-3 text-cyan-400" />
                Regularisation of Unapproved Plots/Layouts
              </a>
            </li>
            <li>
              <a
                href="https://www.cmdachennai.gov.in/RegiDevProfList.html"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-amber-400 transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="w-3 h-3 text-cyan-400" />
                Registered Architects & Developers Directory
              </a>
            </li>
          </ul>
        </div>

        {/* Col 3: Rules & Urban Regulations */}
        <div>
          <h3 className="text-slate-100 font-bold tracking-wider uppercase text-xs mb-3 flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            Rules & Building Norms
          </h3>
          <ul className="space-y-1.5 text-slate-400 text-[11px]">
            <li>
              <a
                href="https://www.cmdachennai.gov.in/TNCDBR2019.html"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-emerald-400 transition-colors flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Tamil Nadu Combined Development & Building Rules (TNCDBR 2019)
              </a>
            </li>
            <li>
              <a
                href="https://www.cmdachennai.gov.in/pdfs/tntcp_act.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-emerald-400 transition-colors flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Tamil Nadu Town and Country Planning Act (TNT&CP Act)
              </a>
            </li>
            <li>
              <a
                href="https://www.cmdachennai.gov.in/DRC.html"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-emerald-400 transition-colors flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Development Rights Certificate (DRC) Guidelines
              </a>
            </li>
            <li>
              <a
                href="https://www.cmdachennai.gov.in/pdfs/AlertMessage-FlatPlotBuyers-23-01-2024.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-amber-400 transition-colors flex items-center gap-1.5 font-medium text-amber-300"
              >
                <ShieldCheck className="w-3 h-3 text-amber-400" />
                Notice for Flat/Plot Buyers (Water Body Encroachments)
              </a>
            </li>
          </ul>
        </div>

        {/* Col 4: State Government Portals & Contact */}
        <div>
          <h3 className="text-slate-100 font-bold tracking-wider uppercase text-xs mb-3 flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
            <Building className="w-3.5 h-3.5 text-amber-400" />
            Tamil Nadu Government Portals
          </h3>
          <ul className="space-y-1.5 text-slate-400 text-[11px]">
            <li>
              <a
                href="https://www.tn.gov.in"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-amber-400 transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="w-3 h-3 text-amber-400" />
                Tamil Nadu State Government Portal (tn.gov.in)
              </a>
            </li>
            <li>
              <a
                href="http://eservices.tn.gov.in/eservicesnew/home.html"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-amber-400 transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="w-3 h-3 text-amber-400" />
                Tamil Nadu eServices Portal (Patta / Chitta)
              </a>
            </li>
            <li>
              <a
                href="https://tnreginet.gov.in/portal/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-amber-400 transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="w-3 h-3 text-amber-400" />
                Registration Department (TN Reginet)
              </a>
            </li>
            <li className="pt-1.5 text-[10px] text-slate-400 flex items-center gap-1">
              <PhoneCall className="w-3 h-3 text-emerald-400" />
              <span>CMDA Public Helpline: 044-28414855 / 28414853</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom Legal & Copyright Bar */}
      <div className="bg-slate-900 px-4 sm:px-6 py-3 border-t border-slate-800 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-3">
        <div>
          © {new Date().getFullYear()} Chennai Metropolitan Development Authority (CMDA). Designed for Public Access & GeoAI Urban Planning.
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://www.cmdachennai.gov.in/privacy.htm"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-amber-400 transition-colors"
          >
            Privacy Policy
          </a>
          <span>•</span>
          <a
            href="https://www.cmdachennai.gov.in/hyperlink-policy.htm"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-amber-400 transition-colors"
          >
            Hyperlink Policy
          </a>
          <span>•</span>
          <a
            href="https://www.cmdachennai.gov.in/terms-conditions.htm"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-amber-400 transition-colors"
          >
            Terms & Conditions
          </a>
        </div>
      </div>
    </footer>
  );
};
