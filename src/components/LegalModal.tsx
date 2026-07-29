import React, { useState } from 'react';
import { X, ShieldCheck, FileText, Lock, Scale } from 'lucide-react';
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from '../utils/legal';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'terms' | 'privacy';
  lang?: 'ar' | 'en';
}

export const LegalModal: React.FC<LegalModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'terms',
  lang = 'ar',
}) => {
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy'>(defaultTab);

  if (!isOpen) return null;

  const terms = TERMS_OF_SERVICE[lang] || TERMS_OF_SERVICE.ar;
  const privacy = PRIVACY_POLICY[lang] || PRIVACY_POLICY.ar;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fade-in dir-rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-right">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {lang === 'ar' ? 'الشروط والأحكام وسياسة الخصوصية' : 'Terms & Privacy Policy'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {lang === 'ar' ? 'تطبيق كابتن عز - النقل الذكي والآمن' : 'Captain Ezz - Safe & Smart Ride'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/80 px-4 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`flex items-center gap-2 px-4 py-2.5 font-bold text-xs rounded-t-xl transition-all border-b-2 ${
              activeTab === 'terms'
                ? 'border-amber-400 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>{lang === 'ar' ? 'الشروط والأحكام' : 'Terms & Conditions'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`flex items-center gap-2 px-4 py-2.5 font-bold text-xs rounded-t-xl transition-all border-b-2 ${
              activeTab === 'privacy'
                ? 'border-amber-400 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>{lang === 'ar' ? 'سياسة الخصوصية' : 'Privacy Policy'}</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-slate-300 text-xs leading-relaxed custom-scrollbar">
          {activeTab === 'terms' ? (
            <div className="space-y-4">
              <div className="bg-amber-500/5 border border-amber-500/20 p-3 rounded-xl flex items-center justify-between text-amber-300 text-[11px]">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 shrink-0 text-amber-400" />
                  <span className="font-semibold">{terms.title}</span>
                </div>
                <span className="text-[10px] text-slate-400">
                  {lang === 'ar' ? `آخر تحديث: ${terms.lastUpdated}` : `Updated: ${terms.lastUpdated}`}
                </span>
              </div>

              <div className="grid gap-3">
                {terms.sections.map((section, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <h3 className="font-bold text-amber-400 mb-1.5 text-xs flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                      {section.heading}
                    </h3>
                    <p className="text-slate-300 text-xs leading-relaxed whitespace-pre-line">{section.content}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-emerald-500/5 border border-emerald-500/20 p-3 rounded-xl flex items-center justify-between text-emerald-300 text-[11px]">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span className="font-semibold">{privacy.title}</span>
                </div>
                <span className="text-[10px] text-slate-400">
                  {lang === 'ar' ? `آخر تحديث: ${privacy.lastUpdated}` : `Updated: ${privacy.lastUpdated}`}
                </span>
              </div>

              <div className="grid gap-3">
                {privacy.sections.map((section, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <h3 className="font-bold text-emerald-400 mb-1.5 text-xs flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      {section.heading}
                    </h3>
                    <p className="text-slate-300 text-xs leading-relaxed whitespace-pre-line">{section.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <p className="text-[10px] text-slate-500">
            {lang === 'ar' ? 'جميع الحقوق محفوظة © تطبيق كابتن عز' : 'All Rights Reserved © Captain Ezz'}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            {lang === 'ar' ? 'فهمت وموافق' : 'I Understand & Agree'}
          </button>
        </div>
      </div>
    </div>
  );
};
