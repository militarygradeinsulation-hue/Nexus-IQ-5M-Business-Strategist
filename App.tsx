
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { runInitialAnalysis, createBusinessChat, getFastActionAdvice, getSolutionBreakdown } from './geminiService';
import { AnalysisResult, Message, GroundingChunk, Pattern, Gap, Solution } from './types';
import { BrainIcon, UploadIcon, SendIcon, AlertTriangleIcon, CheckCircleIcon, ZapIcon } from './components/Icons';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Treemap, Tooltip } from 'recharts';

const App: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [deepThink, setDeepThink] = useState(true);
  const [useSearch, setUseSearch] = useState(false);
  const [useMaps, setUseMaps] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [dynamicIQ, setDynamicIQ] = useState<number>(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSession, setChatSession] = useState<any>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [hasKey, setHasKey] = useState<boolean>(true); // Assume key is always active
  const [location, setLocation] = useState<{ latitude: number, longitude: number } | undefined>(undefined);
  const [fastAdvice, setFastAdvice] = useState<string | null>(null);
  const [isLightMode, setIsLightMode] = useState(true);
  
  // Pattern controls
  const [patternFilter, setPatternFilter] = useState<'All' | 'Good' | 'Bad'>('All');
  const [patternSort, setPatternSort] = useState<'Name' | 'Score'>('Score');

  // Solution controls
  const [expandedSolutionIdx, setExpandedSolutionIdx] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // No need to check key, it's assumed active.
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      }, () => console.warn("Location access denied"));
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    if (analysis) {
      // Clamp rating to 1-100 to prevent layout breakage
      const rawIQ = analysis.businessIQRating;
      const clamped = rawIQ > 100 ? 99.9 : rawIQ < 0 ? 0 : rawIQ;
      setDynamicIQ(clamped);
    }
  }, [analysis]);

  // Removed checkKey and handleSelectKey functions

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setInputText(text);
      };
      reader.readAsText(file);
    }
  };

  const startAnalysis = async () => {
    if (!inputText.trim()) return;
    
    setIsAnalyzing(true);
    setFastAdvice(null);
    try {
      const result = await runInitialAnalysis(inputText, deepThink);
      setAnalysis(result);
      const session = createBusinessChat(result, { search: useSearch, maps: useMaps, location });
      setChatSession(session);
      setMessages([{ role: 'model', content: "IQ protocols active. Neural architecture optimized. How shall we dismantle the complexity of your enterprise today?" }]);
      
      const fast = await getFastActionAdvice(result.executiveSummary);
      setFastAdvice(fast || null);
    } catch (error: any) {
      console.error(error);
      const errStr = error.toString();
      if (errStr.includes("429") || errStr.includes("quota")) {
        alert("Strategic buffers full. Please authenticate with a paid key or disable 'Deep' mode to use standard neural processing.");
      } else {
        alert("Nexus Link interrupted. Retry calibration.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !chatSession) return;
    const userMsg = chatInput;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatInput('');
    setIsTyping(true);

    setDynamicIQ(prev => Math.min(prev + 0.5, 99.9));

    try {
      let fullResponse = "";
      const stream = await chatSession.sendMessageStream({ message: userMsg });
      setMessages(prev => [...prev, { role: 'model', content: "" }]);

      for await (const chunk of stream) {
        const text = chunk.text || "";
        fullResponse += text;
        const grounding = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;

        setMessages(prev => {
          const newMsgs = [...prev];
          const lastMsg = newMsgs[newMsgs.length - 1];
          lastMsg.content = fullResponse;
          if (grounding) {
            lastMsg.grounding = Array.from(new Set([...(lastMsg.grounding || []), ...grounding]));
          }
          return newMsgs;
        });
      }
    } catch (error: any) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', content: "Neural handshake failed. Your strategic complexity may require a higher tier API key." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSolutionClick = async (idx: number) => {
    if (!analysis) return;
    if (expandedSolutionIdx === idx) {
      setExpandedSolutionIdx(null);
      return;
    }

    setExpandedSolutionIdx(idx);
    
    const solution = analysis.solutions[idx];
    if (solution.breakdown) return;

    const updatedSolutions = [...analysis.solutions];
    updatedSolutions[idx] = { ...solution, isLoadingBreakdown: true };
    setAnalysis({ ...analysis, solutions: updatedSolutions });

    setDynamicIQ(prev => Math.min(prev + 1.2, 100));

    try {
      const breakdown = await getSolutionBreakdown(solution.title, analysis.executiveSummary);
      updatedSolutions[idx] = { ...solution, breakdown, isLoadingBreakdown: false };
      setAnalysis({ ...analysis, solutions: updatedSolutions });
    } catch (e) {
      console.error(e);
      updatedSolutions[idx] = { ...solution, isLoadingBreakdown: false };
      setAnalysis({ ...analysis, solutions: updatedSolutions });
    }
  };

  const filteredPatterns = useMemo(() => {
    if (!analysis) return [];
    let list = [...analysis.patterns];
    if (patternFilter !== 'All') {
      list = list.filter(p => p.status === patternFilter);
    }
    list.sort((a, b) => {
      if (patternSort === 'Name') return a.name.localeCompare(b.name);
      return b.score - a.score;
    });
    return list;
  }, [analysis, patternFilter, patternSort]);

  const treemapData = useMemo(() => {
    if (!analysis) return [];
    const groups: Record<string, { name: string, children: any[] }> = {};
    analysis.gaps.forEach(gap => {
      if (!groups[gap.category]) {
        groups[gap.category] = { name: gap.category, children: [] };
      }
      groups[gap.category].children.push({
        name: gap.title,
        size: gap.severity === 'Critical' ? 40 : gap.severity === 'Moderate' ? 20 : 10,
        severity: gap.severity
      });
    });
    return Object.values(groups);
  }, [analysis]);

  const exportMarkdown = () => {
    if (!analysis) return;
    const content = `
# Nexus IQ Strategic Report
**Executive Summary**
${analysis.executiveSummary}

**Business IQ Rating:** ${dynamicIQ.toFixed(2)}/100

## Identified Gaps
${analysis.gaps.map(g => `- **[${g.severity}] ${g.title}**: ${g.description}`).join('\n')}

## Pattern DNA
${analysis.patterns.map(p => `- **${p.name} (${p.status})**: ${p.reasoning}`).join('\n')}

## Engineered Solutions
${analysis.solutions.map(s => `- **${s.title}**: ${s.action} (Impact: ${s.impact})`).join('\n')}

## Next Steps
${analysis.nextSteps.map(step => `- ${step}`).join('\n')}

---
*Generated by Nexus IQ 5,000,000 IQ Strategy Engine*
    `.trim();

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `NexusIQ_Strategy_${new Date().toISOString().slice(0,10)}.md`;
    link.click();
  };

  // Dynamic Theme variables
  const themeBg = isLightMode ? 'bg-white' : 'bg-black';
  const themeText = isLightMode ? 'text-black' : 'text-white';
  const themeBorder = isLightMode ? 'border-black/10' : 'border-white/10';
  const themePanel = isLightMode ? 'bg-black/[0.03]' : 'bg-white/[0.03]';
  const themeButtonPrimary = isLightMode ? 'bg-black text-white hover:bg-zinc-800' : 'bg-white text-black hover:bg-zinc-200';
  const themeIconBg = isLightMode ? 'bg-black' : 'bg-white';
  const themeIconStroke = isLightMode ? 'text-white' : 'text-black';
  const themeMutedText = isLightMode ? 'text-zinc-600' : 'text-zinc-500';
  const themeHeadingMuted = isLightMode ? 'text-zinc-400' : 'text-zinc-600';

  return (
    <div className={`min-h-screen flex flex-col max-w-[1500px] mx-auto px-6 py-8 md:px-12 md:py-12 space-y-12 transition-colors duration-500 selection:bg-${isLightMode ? 'black' : 'white'} selection:text-${isLightMode ? 'white' : 'black'} ${themeBg} ${themeText}`}>
      <div className={`fixed inset-0 pointer-events-none opacity-20 z-[-1] transition-opacity duration-1000 ${isLightMode ? 'bg-[radial-gradient(circle_at_center,_#ddd_0%,_#fff_100%)]' : 'bg-[radial-gradient(circle_at_center,_#111_0%,_#000_100%)]'}`}></div>

      {/* Header */}
      <header className={`flex flex-col md:flex-row items-center justify-between border-b ${isLightMode ? 'border-black/5' : 'border-white/5'} pb-12 gap-8 relative`}>
        <div className="flex items-center space-x-6">
          <div className={`${themeIconBg} p-3 rounded-full shadow-[0_0_40px_rgba(${isLightMode ? '0,0,0' : '255,255,255'},0.1)] group transition-all duration-500 hover:scale-110`}>
            <div className={`${themeIconStroke} scale-125 transition-transform duration-1000 group-hover:rotate-[360deg]`}>
              <BrainIcon />
            </div>
          </div>
          <div>
            <h1 className={`text-4xl font-black tracking-tighter ${themeText} uppercase mono leading-none group cursor-default`}>
              NEXUS <span className={`${isLightMode ? 'group-hover:text-zinc-400' : 'group-hover:text-zinc-500'} transition-colors`}>IQ</span>
            </h1>
            <div className="flex items-center space-x-3 mt-2">
              <span className="flex h-2 w-2 relative">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isLightMode ? 'bg-blue-400' : 'bg-green-400'} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isLightMode ? 'bg-blue-500' : 'bg-green-500'}`}></span>
              </span>
              <p className={`text-[11px] ${themeMutedText} font-black tracking-[0.4em] uppercase`}>Tactical Polymath Engine</p>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-4">
          <button 
            onClick={() => setIsLightMode(!isLightMode)}
            className={`px-6 py-3 border rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${isLightMode ? 'border-black/20 text-black bg-black/5 hover:bg-black/10' : 'border-white/20 text-white bg-white/5 hover:bg-white/10'}`}
          >
            {isLightMode ? 'Switch Dark' : 'Invert Theme'}
          </button>

          {analysis && (
            <button 
              onClick={exportMarkdown}
              className={`px-6 py-3 border rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${isLightMode ? 'bg-black/5 border-black/10 text-black hover:bg-black/10' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'} flex items-center gap-2`}
            >
              <UploadIcon /> Export Report
            </button>
          )}

          <div className={`flex p-1 rounded-2xl border backdrop-blur-xl ${isLightMode ? 'bg-black/5 border-black/5' : 'bg-white/5 border-white/5'}`}>
            {[
              { label: 'Deep', state: deepThink, toggle: () => setDeepThink(!deepThink) },
              { label: 'Search', state: useSearch, toggle: () => { setUseSearch(!useSearch); setUseMaps(false); } },
              { label: 'Maps', state: useMaps, toggle: () => { setUseMaps(!useMaps); setUseSearch(false); } }
            ].map((btn) => (
              <button 
                key={btn.label}
                onClick={btn.toggle}
                className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${btn.state ? (isLightMode ? 'bg-black text-white' : 'bg-white text-black') + ' shadow-lg scale-105' : themeMutedText + ' hover:text-current'}`}
              >
                {btn.label}
              </button>
            ))}
          </div>
          {/* Removed API Key Authorization Button */}
        </div>
      </header>

      {!analysis ? (
        <div className="flex-1 flex flex-col items-center justify-center space-y-20 animate-subtle-fade">
          <div className="text-center space-y-8 max-w-4xl floating">
            <h2 className={`text-8xl md:text-[11rem] font-black ${themeText} tracking-tighter leading-[0.8] transition-all`}>
              Solve <br/> Anything.
            </h2>
            <p className={`text-xl md:text-3xl ${themeMutedText} font-light max-w-2xl mx-auto leading-tight px-4`}>
              Upload your architecture. The 5M IQ engine will find the fractures you missed.
            </p>
          </div>

          <div className="w-full max-w-4xl space-y-10 group">
            <div className={`relative glass-panel rounded-[2.5rem] p-1 glow-pulse transition-all duration-1000 border ${themeBorder} hover:border-current/30`}>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Initialize strategic data stream here..."
                className={`w-full h-80 bg-transparent rounded-[2.5rem] p-12 text-2xl font-light focus:outline-none transition-all placeholder:${isLightMode ? 'text-zinc-300' : 'text-zinc-800'} resize-none leading-relaxed tracking-tight`}
              />
              <div className="absolute bottom-10 right-10 flex space-x-4">
                <label className={`flex items-center justify-center p-5 rounded-[1.5rem] cursor-pointer transition-all border ${themeBorder} ${isLightMode ? 'bg-black/5 hover:bg-black/10' : 'bg-white/5 hover:bg-white/10'} group active:scale-90`}>
                  <UploadIcon />
                  <input type="file" className="hidden" onChange={handleFileUpload} accept=".txt,.md" />
                </label>
              </div>
            </div>

            <button
              onClick={startAnalysis}
              disabled={isAnalyzing || !inputText.trim()}
              className={`w-full ${themeButtonPrimary} disabled:opacity-20 disabled:cursor-not-allowed font-black py-8 rounded-[2rem] text-3xl shadow-[0_30px_70px_rgba(${isLightMode ? '0,0,0' : '255,255,255'},0.15)] transition-all flex items-center justify-center space-x-6 uppercase tracking-tighter active:scale-[0.97]`}
            >
              {isAnalyzing ? (
                <>
                  <div className={`animate-spin rounded-full h-8 w-8 border-b-2 ${isLightMode ? 'border-white' : 'border-black'}`}></div>
                  <span className="mono">Dismantling Complexity...</span>
                </>
              ) : (
                <>
                  <ZapIcon />
                  <span>Execute Analysis</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-12 animate-subtle-fade">
          <div className="lg:col-span-8 space-y-12">
            {/* Top Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className={`md:col-span-2 glass-panel rounded-[2.5rem] p-12 relative overflow-hidden group border ${themeBorder} hover:border-current/20 transition-all cursor-default`}>
                <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-opacity">
                  <BrainIcon />
                </div>
                <h3 className={`text-[10px] font-black ${themeHeadingMuted} uppercase tracking-[0.5em] mb-6`}>Strategic Synthesis</h3>
                <p className={`text-3xl ${themeText} font-light leading-[1.2]`}>"{analysis.executiveSummary}"</p>
                {fastAdvice && (
                  <div className={`mt-8 p-4 rounded-2xl animate-subtle-fade border ${themeBorder} ${isLightMode ? 'bg-black/[0.02]' : 'bg-white/[0.02]'}`}>
                    <p className={`text-[10px] font-black ${themeMutedText} uppercase tracking-widest mb-1 flex items-center gap-2`}>
                      <ZapIcon /> Rapid Directive
                    </p>
                    <p className={`text-sm font-medium ${isLightMode ? 'text-zinc-700' : 'text-zinc-300'}`}>{fastAdvice}</p>
                  </div>
                )}
              </div>
              <div className={`glass-panel rounded-[2.5rem] p-12 flex flex-col items-center justify-center space-y-6 border ${themeBorder}`}>
                <h3 className={`text-[10px] font-black ${themeHeadingMuted} uppercase tracking-[0.5em]`}>Business IQ Rating</h3>
                <div className={`text-8xl font-black ${themeText} tracking-tighter transition-all duration-500`}>{dynamicIQ.toFixed(1)}</div>
                <div className={`${isLightMode ? 'bg-black/5' : 'bg-white/5'} w-full h-2 rounded-full mt-4 overflow-hidden shadow-inner`}>
                  <div 
                    className={`${isLightMode ? 'bg-black' : 'bg-white'} h-full transition-all duration-700 ease-out ${!isLightMode && 'shadow-[0_0_15px_white]'}`} 
                    style={{ width: `${dynamicIQ}%` }}
                  />
                </div>
                <p className={`text-[9px] ${themeMutedText} uppercase tracking-widest text-center mt-2`}>Score fluctuates based on tactical engagement</p>
              </div>
            </div>

            {/* Core Findings Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              {/* Pattern Visualization */}
              <div className={`glass-panel rounded-[2.5rem] p-12 border ${themeBorder}`}>
                <div className="flex justify-between items-start mb-10">
                  <h3 className={`text-sm font-black ${themeText} flex items-center gap-4 uppercase tracking-[0.2em]`}>
                    <div className={`${isLightMode ? 'bg-black/10' : 'bg-white/10'} p-2 rounded-lg scale-90`}><CheckCircleIcon /></div>
                    Engineered DNA
                  </h3>
                  <div className="flex flex-col gap-2">
                    <select 
                      value={patternFilter} 
                      onChange={(e) => setPatternFilter(e.target.value as any)}
                      className={`${isLightMode ? 'bg-white/80 border-black/10 text-zinc-600' : 'bg-black/40 border-white/5 text-zinc-400'} text-[9px] border rounded px-2 py-1 outline-none uppercase font-black`}
                    >
                      <option value="All">Filter: All</option>
                      <option value="Good">Filter: Good</option>
                      <option value="Bad">Filter: Bad</option>
                    </select>
                    <button 
                      onClick={() => setPatternSort(patternSort === 'Name' ? 'Score' : 'Name')}
                      className={`${isLightMode ? 'bg-white/80 border-black/10 text-zinc-600' : 'bg-black/40 border-white/5 text-zinc-400'} text-[9px] border rounded px-2 py-1 uppercase font-black`}
                    >
                      Sort: {patternSort}
                    </button>
                  </div>
                </div>
                <div className="h-72 mb-8">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={filteredPatterns}>
                      <PolarGrid stroke={isLightMode ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)"} />
                      <PolarAngleAxis dataKey="name" stroke={isLightMode ? "#666" : "#aaa"} fontSize={10} fontBold="900" />
                      <Radar name="Strategy" dataKey="score" stroke={isLightMode ? "#000" : "#fff"} fill={isLightMode ? "#000" : "#fff"} fillOpacity={0.1} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-5">
                  {filteredPatterns.map((p, idx) => (
                    <div key={idx} className={`flex flex-col border-b ${isLightMode ? 'border-black/5' : 'border-white/5'} pb-4 group cursor-default`}>
                      <div className="flex justify-between items-center mb-2">
                        <span className={`text-xs font-black uppercase tracking-widest ${p.status === 'Good' ? themeText : themeMutedText}`}>{p.name}</span>
                        <div className={`w-2 h-2 rounded-full ${p.status === 'Good' ? (isLightMode ? 'bg-black' : 'bg-white shadow-[0_0_8px_white]') : (isLightMode ? 'bg-zinc-200' : 'bg-zinc-800')}`}></div>
                      </div>
                      <p className={`text-xs ${themeMutedText} leading-relaxed font-light ${isLightMode ? 'group-hover:text-black' : 'group-hover:text-zinc-300'} transition-colors`}>{p.reasoning}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Identified Gaps Treemap */}
              <div className={`glass-panel rounded-[2.5rem] p-12 border ${themeBorder}`}>
                <h3 className={`text-sm font-black ${themeText} mb-10 flex items-center gap-4 uppercase tracking-[0.2em]`}>
                  <div className={`${isLightMode ? 'bg-black/10' : 'bg-white/10'} p-2 rounded-lg scale-90`}><AlertTriangleIcon /></div>
                  Structural Gaps
                </h3>
                <div className={`h-72 mb-8 ${isLightMode ? 'bg-zinc-50' : 'bg-black/40'} rounded-3xl overflow-hidden p-2 border ${themeBorder}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <Treemap
                      data={treemapData}
                      dataKey="size"
                      aspectRatio={1}
                      stroke={isLightMode ? "#ddd" : "#000"}
                      fill="#fff"
                      content={(props: any) => {
                        const { x, y, width, height, severity, name } = props;
                        let fill;
                        let textFill;
                        
                        if (isLightMode) {
                          fill = severity === 'Critical' ? '#000000' : severity === 'Moderate' ? '#d4d4d8' : '#f4f4f5';
                          textFill = severity === 'Critical' ? '#ffffff' : '#000000';
                        } else {
                          fill = severity === 'Critical' ? '#ffffff' : severity === 'Moderate' ? '#2727a' : '#18181b';
                          textFill = severity === 'Critical' ? '#000000' : '#ffffff';
                        }
                        
                        const padding = 6;
                        const fontSize = Math.min(11, Math.max(8, width / 10));

                        return (
                          <g>
                            <rect 
                              x={x} 
                              y={y} 
                              width={width} 
                              height={height} 
                              rx={12}
                              style={{ 
                                fill, 
                                stroke: isLightMode ? '#eee' : '#000', 
                                strokeWidth: 2, 
                                cursor: 'help'
                              }} 
                            />
                            {width > 40 && height > 20 && (
                              <foreignObject 
                                x={x + padding} 
                                y={y + padding} 
                                width={width - padding * 2} 
                                height={height - padding * 2}
                              >
                                <div className="flex items-center justify-center w-full h-full text-center leading-tight pointer-events-none select-none">
                                  <span style={{ 
                                    color: textFill, 
                                    fontSize: `${fontSize}px`, 
                                    fontWeight: 900, 
                                    textTransform: 'uppercase',
                                    wordBreak: 'break-word',
                                    display: '-webkit-box',
                                    WebkitLineClamp: height < 40 ? 1 : 3,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden'
                                  }}>
                                    {name}
                                  </span>
                                </div>
                              </foreignObject>
                            )}
                          </g>
                        );
                      }}
                    />
                  </ResponsiveContainer>
                </div>
                <div className="space-y-8 mt-12">
                  {analysis.gaps.map((gap, idx) => (
                    <div key={idx} className="group transition-all hover:translate-x-2 duration-500 cursor-default">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className={`font-black ${themeText} text-base tracking-tight uppercase`}>{gap.title}</h4>
                        <span className={`text-[9px] px-3 py-1 rounded-full font-black uppercase tracking-tighter ${
                          gap.severity === 'Critical' 
                            ? (isLightMode ? 'bg-black text-white' : 'bg-white text-black shadow-[0_0_15px_white]') 
                            : (isLightMode ? 'bg-zinc-100 text-zinc-500' : 'bg-zinc-900 text-zinc-400')
                        }`}>
                          {gap.severity}
                        </span>
                      </div>
                      <p className={`text-sm ${themeMutedText} leading-relaxed font-light ${isLightMode ? 'group-hover:text-black' : 'group-hover:text-zinc-400'} transition-colors`}>{gap.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Solution Architecture Interactive */}
            <div className={`glass-panel rounded-[2.5rem] p-12 border ${themeBorder}`}>
              <h3 className={`text-sm font-black ${themeText} mb-12 flex items-center gap-4 uppercase tracking-[0.2em]`}>
                <div className={`${isLightMode ? 'bg-black/10' : 'bg-white/10'} p-2 rounded-lg scale-90`}><ZapIcon /></div>
                Engineered Solutions
              </h3>
              <div className="grid grid-cols-1 gap-8">
                {analysis.solutions.map((sol, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => handleSolutionClick(idx)}
                    className={`group glass-panel p-10 rounded-[2.5rem] transition-all border cursor-pointer ${expandedSolutionIdx === idx ? (isLightMode ? 'border-black/30 bg-black/[0.03]' : 'border-white/40 bg-white/10 shadow-[0_0_30px_rgba(255,255,255,0.05)]') : (isLightMode ? 'border-black/5 hover:border-black/20' : 'border-white/5 hover:border-white/20')}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="max-w-2xl">
                        <h4 className={`font-black ${themeText} text-xl mb-4 group-hover:translate-x-2 transition-transform uppercase tracking-tight`}>{sol.title}</h4>
                        <p className={`text-base ${themeMutedText} font-light mb-8 leading-relaxed ${isLightMode ? 'group-hover:text-zinc-900' : 'group-hover:text-zinc-400'} transition-colors`}>{sol.action}</p>
                      </div>
                      <div className={`text-[10px] font-black ${themeHeadingMuted} uppercase tracking-[0.3em] text-right`}>
                        <span>Calibration</span>
                        <div className={`${themeText} text-lg`}>{sol.impact}</div>
                      </div>
                    </div>

                    {expandedSolutionIdx === idx && (
                      <div className={`mt-8 pt-8 border-t ${isLightMode ? 'border-black/5' : 'border-white/10'} animate-subtle-fade`}>
                        <h5 className={`text-[10px] font-black ${themeMutedText} uppercase tracking-[0.4em] mb-6`}>Surgical Implementation Steps:</h5>
                        {sol.isLoadingBreakdown ? (
                          <div className="flex space-x-2 py-4">
                            <div className={`w-1.5 h-1.5 ${isLightMode ? 'bg-black' : 'bg-white'} rounded-full animate-bounce`}></div>
                            <div className={`w-1.5 h-1.5 ${isLightMode ? 'bg-black' : 'bg-white'} rounded-full animate-bounce delay-100`}></div>
                            <div className={`w-1.5 h-1.5 ${isLightMode ? 'bg-black' : 'bg-white'} rounded-full animate-bounce delay-200`}></div>
                          </div>
                        ) : sol.breakdown ? (
                          <div className="space-y-4">
                            {sol.breakdown.map((step, sIdx) => (
                              <div key={sIdx} className="flex items-start gap-4">
                                <span className={`text-[10px] font-black ${isLightMode ? 'bg-black text-white' : 'bg-white/10 text-white'} w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0`}>{sIdx + 1}</span>
                                <p className={`text-sm ${isLightMode ? 'text-black' : 'text-white'} font-medium`}>{step}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={`text-xs ${themeMutedText} italic`}>Click to generate tactical blueprint</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Next Steps */}
            <div className={`glass-panel rounded-[2.5rem] p-12 border ${themeBorder}`}>
              <h3 className={`text-sm font-black ${themeText} mb-8 uppercase tracking-[0.2em]`}>Next Steps Directive</h3>
              <div className="space-y-4">
                {analysis.nextSteps.map((step, idx) => (
                  <div key={idx} className={`p-4 rounded-2xl text-sm ${themeMutedText} font-light border ${themeBorder} ${isLightMode ? 'bg-black/[0.02] hover:text-black' : 'bg-white/5 hover:text-white'} transition-colors`}>
                    {step}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Chat Sidebar */}
          <div className={`lg:col-span-4 flex flex-col glass-panel rounded-[3rem] h-[900px] overflow-hidden sticky top-12 border ${themeBorder} ${!isLightMode && 'shadow-[0_40px_100px_rgba(0,0,0,0.5)]'}`}>
            <div className={`p-10 border-b flex justify-between items-center backdrop-blur-3xl ${isLightMode ? 'bg-black/5 border-black/5' : 'bg-white/5 border-white/5'}`}>
              <div>
                <h3 className={`font-black text-[11px] tracking-[0.5em] uppercase ${themeMutedText}`}>Live IQ Directives</h3>
                <p className={`text-[9px] ${isLightMode ? 'text-zinc-400' : 'text-zinc-700'} font-bold uppercase mt-1`}>Status: Operational</p>
              </div>
              <div className="flex -space-x-1">
                {[1, 2, 3].map(i => (
                  <div key={i} className={`w-2 h-2 rounded-full border border-black ${isTyping ? (isLightMode ? 'bg-black animate-pulse' : 'bg-white animate-pulse') : (isLightMode ? 'bg-zinc-100' : 'bg-zinc-800')}`}></div>
                ))}
              </div>
            </div>
            
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-10 space-y-12 scroll-smooth transition-colors duration-500">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-subtle-fade`}>
                  <div className={`max-w-[95%] p-8 rounded-[2rem] text-sm leading-relaxed transition-all ${
                    msg.role === 'user' 
                      ? (isLightMode ? 'bg-black text-white font-bold rounded-tr-none shadow-xl scale-105' : 'bg-white text-black font-bold rounded-tr-none shadow-2xl scale-105')
                      : (isLightMode ? 'bg-zinc-100 text-zinc-900 font-light rounded-tl-none border border-black/5' : 'bg-white/5 text-zinc-300 font-light rounded-tl-none border border-white/5 hover:bg-white/10')
                  }`}>
                    {msg.content}
                    
                    {msg.grounding && msg.grounding.length > 0 && (
                      <div className={`mt-8 pt-8 border-t ${isLightMode ? 'border-black/5' : 'border-white/5'} space-y-4`}>
                        <p className={`text-[9px] font-black ${isLightMode ? 'text-zinc-400' : 'text-zinc-600'} uppercase tracking-[0.3em]`}>Neural Verification Link:</p>
                        <div className="flex flex-wrap gap-2">
                          {msg.grounding.map((chunk, cIdx) => (
                            <div key={cIdx} className="w-full">
                              {chunk.web && (
                                <a href={chunk.web.uri} target="_blank" className={`${isLightMode ? 'text-zinc-700 hover:text-black' : 'text-zinc-500 hover:text-white'} underline decoration-current/10 transition-all flex items-center gap-2 py-1`}>
                                  <span className={`text-[8px] px-2 py-0.5 rounded uppercase font-black ${isLightMode ? 'bg-black/5' : 'bg-white/10'}`}>WEB</span>
                                  <span className="truncate">{chunk.web.title}</span>
                                </a>
                              )}
                              {chunk.maps && (
                                <a href={chunk.maps.uri} target="_blank" className={`${isLightMode ? 'text-zinc-700 hover:text-black' : 'text-zinc-500 hover:text-white'} underline decoration-current/10 transition-all flex items-center gap-2 py-1`}>
                                  <span className={`text-[8px] px-2 py-0.5 rounded uppercase font-black ${isLightMode ? 'bg-black/5' : 'bg-white/10'}`}>GEO</span>
                                  <span className="truncate">{chunk.maps.title}</span>
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isTyping && (
                 <div className="flex justify-start animate-subtle-fade">
                    <div className={`${isLightMode ? 'bg-zinc-100' : 'bg-white/5'} p-8 rounded-[2rem] rounded-tl-none border ${themeBorder}`}>
                       <div className="flex space-x-2 py-1">
                          <div className={`w-1.5 h-1.5 ${isLightMode ? 'bg-black' : 'bg-white'} rounded-full animate-bounce`} style={{ animationDelay: '0ms' }}></div>
                          <div className={`w-1.5 h-1.5 ${isLightMode ? 'bg-black' : 'bg-white'} rounded-full animate-bounce`} style={{ animationDelay: '200ms' }}></div>
                          <div className={`w-1.5 h-1.5 ${isLightMode ? 'bg-black' : 'bg-white'} rounded-full animate-bounce`} style={{ animationDelay: '400ms' }}></div>
                       </div>
                    </div>
                 </div>
              )}
            </div>

            <div className={`p-10 border-t backdrop-blur-2xl ${isLightMode ? 'bg-zinc-50 border-black/5' : 'bg-black/90 border-white/5'}`}>
              <div className="relative group">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder={useSearch ? "Verifying market context..." : useMaps ? "Locating tactical points..." : "Query the polymath..."}
                  className={`w-full rounded-2xl py-6 pl-8 pr-20 text-sm font-light outline-none transition-all ${isLightMode ? 'bg-white border border-black/10 focus:border-black/30 placeholder:text-zinc-300' : 'bg-white/5 border border-white/10 focus:bg-white/10 focus:border-white/30 placeholder:text-zinc-800'}`}
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim() || isTyping}
                  className={`absolute right-5 top-1/2 -translate-y-1/2 p-3 hover:scale-110 active:scale-90 transition-all disabled:opacity-20 ${isLightMode ? 'text-black' : 'text-white'}`}
                >
                  <SendIcon />
                </button>
              </div>
              <div className="flex justify-center items-center space-x-6 mt-6">
                <p className={`text-[8px] ${isLightMode ? 'text-zinc-400' : 'text-zinc-700'} font-black uppercase tracking-[0.4em]`}>
                  {useSearch ? 'Grounding: WEB_ACTIVE' : useMaps ? 'Grounding: GEO_ACTIVE' : 'Core Intelligence: PRO'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;