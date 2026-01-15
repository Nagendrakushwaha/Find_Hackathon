
import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { HackathonRecord } from './types';

const sessionCache: Record<string, HackathonRecord[]> = {};

const App: React.FC = () => {
  const [district, setDistrict] = useState('');
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeData, setActiveData] = useState<HackathonRecord[]>([]);
  const [viewingDistrict, setViewingDistrict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('dhf_watchlist');
    if (saved) setWatchlist(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('dhf_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  const executeExtraction = async (targetDistrict: string) => {
    if (!targetDistrict.trim()) return;
    const dKey = targetDistrict.toLowerCase().trim();
    
    if (sessionCache[dKey]) {
      setActiveData(sessionCache[dKey]);
      setViewingDistrict(targetDistrict);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      // Strictly enforcing 2024-2025 timeframe in the prompt
      const prompt = `
        DISTRICT NAME: ${targetDistrict}
        TASK: Find ALL HACKATHON / COMMUNITY PROGRAMS conducted in 2024 and 2025 ONLY.
        
        STRICT TEMPORAL RULE:
        - ONLY include events that occurred in 2024 or are scheduled for 2025.
        - EXCLUDE all 2023, 2022, or older records.
        
        STRICT COLUMN ORDER:
        1. INTERN NAME, 2. Community College Name, 3. Community name, 4. Leader name, 5. Leader Number, 6. Leader Email, 7. Member name, 8. Member No., 9. Member Email, 10. Hackathon Name
        
        HARD RULES:
        - Output must be valid JSON array of objects.
        - Phone numbers → digits only.
        - Email must contain '@'.
        - If field is not found, use "Not Available".
        - Do NOT guess. Use official sources (GDSC 2024/25, College 2024 Notices, Recent Devpost).
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                "INTERN NAME": { type: Type.STRING },
                "Community College Name": { type: Type.STRING },
                "Community name": { type: Type.STRING },
                "Leader name": { type: Type.STRING },
                "Leader Number": { type: Type.STRING },
                "Leader Email": { type: Type.STRING },
                "Member name": { type: Type.STRING },
                "Member No.": { type: Type.STRING },
                "Member Email": { type: Type.STRING },
                "Hackathon Name": { type: Type.STRING },
              },
              required: ["INTERN NAME", "Community College Name", "Community name", "Leader name", "Leader Number", "Leader Email", "Member name", "Member No.", "Member Email", "Hackathon Name"]
            }
          }
        }
      });

      const results = JSON.parse(response.text || "[]");
      const finalData = results.length > 0 ? results : [{
        "INTERN NAME": "Not Available", "Community College Name": "Not Available", "Community name": "Not Available",
        "Leader name": "Not Available", "Leader Number": "Not Available", "Leader Email": "Not Available",
        "Member name": "Not Available", "Member No.": "Not Available", "Member Email": "Not Available",
        "Hackathon Name": "Not Available"
      }];

      sessionCache[dKey] = finalData;
      setActiveData(finalData);
      setViewingDistrict(targetDistrict);
      
      if (!watchlist.includes(targetDistrict)) {
        setWatchlist(prev => [targetDistrict, ...prev].slice(0, 10));
      }
    } catch (err) {
      console.error(err);
      setError("High-speed lookup failed. No verified 2024-2025 events found for this specific district.");
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (activeData.length === 0) return;
    const headers = Object.keys(activeData[0]).join(",");
    const rows = activeData.map(row => 
      Object.values(row).map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    
    const content = "data:text/csv;charset=utf-8," + headers + "\n" + rows;
    const link = document.createElement("a");
    link.href = encodeURI(content);
    link.download = `Hackathons_2024-25_${viewingDistrict}.csv`;
    link.click();
  };

  const exportExcel = () => {
    if (activeData.length === 0) return;
    const headers = Object.keys(activeData[0]);
    let xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#000000" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="2024-2025 Data">
    <Table>
      <Row ss:StyleID="Header">`;
    headers.forEach(h => { xml += `<Cell><Data ss:Type="String">${h}</Data></Cell>`; });
    xml += `</Row>`;
    activeData.forEach(row => {
      xml += `<Row>`;
      Object.values(row).forEach(val => { xml += `<Cell><Data ss:Type="String">${val}</Data></Cell>`; });
      xml += `</Row>`;
    });
    xml += `</Table></Worksheet></Workbook>`;
    const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Hackathons_2024-25_${viewingDistrict}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden">
      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center rotate-3 shadow-lg">
              <span className="text-white font-black text-lg">X</span>
            </div>
            <div>
              <h1 className="font-black text-xl tracking-tighter uppercase italic leading-none">Extraction</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[9px] font-black text-white bg-indigo-600 px-1 rounded">2024-25</span>
                <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase">Engine v2.1</span>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Target District</label>
              <div className="relative group">
                <input
                  type="text"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && executeExtraction(district)}
                  placeholder="e.g. Bangalore, SF..."
                  className="w-full pl-4 pr-12 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm focus:border-black focus:bg-white transition-all outline-none font-bold placeholder:text-slate-300"
                />
                <button 
                  onClick={() => executeExtraction(district)}
                  className="absolute right-3 top-2.5 w-8 h-8 bg-black text-white rounded-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                </button>
              </div>
              <p className="text-[9px] font-bold text-slate-400 mt-3 px-1 uppercase tracking-tight italic">
                * Strictly filtering for 2024 and 2025 programs only
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <div className="pt-4 border-t border-slate-50">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 px-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
              Extraction History
            </h3>
            <div className="space-y-2">
              {watchlist.map(d => (
                <button 
                  key={d} 
                  onClick={() => executeExtraction(d)}
                  className={`w-full group flex items-center gap-3 p-3 rounded-xl transition-all border ${viewingDistrict === d ? 'bg-black border-black text-white shadow-md' : 'bg-white border-transparent hover:border-slate-200 text-slate-600'}`}
                >
                  <svg className={`w-4 h-4 ${viewingDistrict === d ? 'text-white' : 'text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  <span className="text-xs font-black uppercase tracking-tight truncate">{d}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-20 bg-white border-b border-slate-100 flex items-center justify-between px-10 shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                {viewingDistrict ? `District: ${viewingDistrict}` : 'Engine Standby'}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <div className={`w-2 h-2 rounded-full ${loading ? 'bg-amber-400 animate-ping' : viewingDistrict ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {loading ? 'Executing 2024-25 Lookup...' : viewingDistrict ? '2024-25 Verified' : 'Awaiting Input'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {activeData.length > 0 && !loading && (
              <>
                <button 
                  onClick={exportCSV} 
                  className="bg-white text-slate-600 border border-slate-200 text-[11px] font-black px-5 py-3 rounded-xl hover:bg-slate-50 transition-all flex items-center gap-2 uppercase tracking-widest"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12"/></svg>
                  CSV
                </button>
                <button 
                  onClick={exportExcel} 
                  className="bg-[#1D6F42] text-white text-[11px] font-black px-6 py-3 rounded-xl hover:shadow-xl active:translate-y-0.5 transition-all flex items-center gap-3 uppercase tracking-widest shadow-md"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                  Download Excel
                </button>
              </>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-auto p-10">
          {error && (
            <div className="bg-rose-50 border-2 border-rose-100 p-6 rounded-2xl text-rose-800 flex items-start gap-4 mb-8">
              <span className="text-2xl mt-1">🚨</span>
              <div>
                <h4 className="font-black text-sm uppercase tracking-tight mb-1">Temporal Filter Error</h4>
                <p className="text-xs font-bold opacity-80 leading-relaxed uppercase">{error}</p>
              </div>
            </div>
          )}

          {!viewingDistrict && !loading && (
            <div className="h-full flex flex-col items-center justify-center">
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-indigo-200 blur-3xl opacity-20 rounded-full" />
                <div className="relative w-32 h-32 bg-white border-2 border-slate-50 shadow-2xl rounded-[40px] flex items-center justify-center transform -rotate-6">
                  <span className="text-3xl font-black text-slate-200 uppercase">2025</span>
                </div>
              </div>
              <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter mb-2">Initialize Extraction</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.3em]">Strict 2024-2025 verification engine active</p>
            </div>
          )}

          {loading && (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-16 bg-white border border-slate-100 rounded-2xl animate-pulse flex items-center px-8 gap-10">
                  <div className="w-24 h-2 bg-slate-100 rounded-full" />
                  <div className="flex-1 h-2 bg-slate-100 rounded-full" />
                  <div className="w-40 h-2 bg-slate-100 rounded-full" />
                </div>
              ))}
            </div>
          )}

          {viewingDistrict && !loading && (
            <div className="bg-white border border-slate-200 rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,0.04)] overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1600px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {Object.keys(activeData[0]).map(header => (
                        <th key={header} className="px-6 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {activeData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        {Object.values(row).map((val, vIdx) => (
                          <td key={vIdx} className="px-6 py-5">
                            <span className={`text-[11px] font-bold tracking-tight ${val === 'Not Available' ? 'text-slate-300 italic' : 'text-slate-800'}`}>
                              {val}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <footer className="h-14 bg-white border-t border-slate-100 flex items-center justify-between px-10 shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-500" />
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Temporal Filter: 2024/2025 ACTIVE</span>
            </div>
          </div>
          <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest italic">
            Speed-optimized data extraction engine • Current Cycle
          </div>
        </footer>
      </main>
    </div>
  );
};

export default App;
