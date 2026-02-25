import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Activity, History, ShieldCheck, Terminal, AlertTriangle, RefreshCcw, 
  Cpu, Database, Zap, CheckCircle2, MessageSquare, X, Flame, Sliders,
  Send, Info, Bug, BrainCircuit, ChevronRight, LayoutDashboard, Settings,
  FileText, ShieldAlert, BarChart3, Clock, AlertCircle, ArrowLeft
} from 'lucide-react';
import { 
  Deployment, DeploymentStatus, LogEntry, MetricPoint, AnalysisResult, 
  ChatMessage, FaultState, IncidentReport 
} from './types';
import { analyzeDeploymentHealth, chatWithSRE } from './services/geminiService';
import HealthChart from './components/HealthChart';

const generateLogs = (count: number, fault?: FaultState): LogEntry[] => {
  const messages = [
    "Connection established to gateway", "Request processed successfully",
    "Handshake timeout", "Internal Server Error 500", "Database pool exhausted",
    "Cache hit for key 'user_auth'", "Memory threshold exceeded", "GC collection took 400ms",
    "Worker pool saturation at 85%", "Keep-alive connection closed by peer"
  ];
  return Array.from({ length: count }, (_, i) => {
    let level: LogEntry['level'] = 'INFO';
    let msg = messages[Math.floor(Math.random() * messages.length)];
    
    if (fault?.errorBurst && Math.random() > 0.4) {
      level = 'ERROR';
      msg = "Critical failure in upstream service 'auth-v2': SocketTimeout";
    } else if (fault?.latencySpike && Math.random() > 0.6) {
      level = 'WARN';
      msg = "Latency threshold exceeded on /api/v1/checkout - upstream slow";
    } else if (fault?.memoryLeak && Math.random() > 0.7) {
      level = 'CRITICAL';
      msg = "OOM Killer imminent: Node heap usage > 92%";
    }

    return {
      timestamp: new Date(Date.now() - i * 5000).toISOString(),
      level,
      message: msg,
      service: "core-api"
    };
  });
};

const INITIAL_DEPLOYMENTS: Deployment[] = [
  { id: '1', version: 'v1.2.0', timestamp: new Date().toISOString(), status: DeploymentStatus.ACTIVE, author: 'Jane S.', commitHash: '7e12a4b', environment: 'production', healthScore: 98 },
  { id: '2', version: 'v1.1.9', timestamp: new Date(Date.now() - 86400000).toISOString(), status: DeploymentStatus.PREVIOUS, author: 'Mark T.', commitHash: 'f4b2c1d', environment: 'production', healthScore: 96 },
  { id: '3', version: 'v1.1.8', timestamp: new Date(Date.now() - 172800000).toISOString(), status: DeploymentStatus.PREVIOUS, author: 'Jane S.', commitHash: 'a1b2c3d', environment: 'production', healthScore: 94 },
];

const DeploymentRollback: React.FC = () => {
  const [deployments, setDeployments] = useState<Deployment[]>(INITIAL_DEPLOYMENTS);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [activeView, setActiveView] = useState<'dashboard' | 'history' | 'report'>('dashboard');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [faults, setFaults] = useState<FaultState>({ latencySpike: false, errorBurst: false, memoryLeak: false });
  const [isRollbackLoading, setIsRollbackLoading] = useState(false);
  const [lastIncident, setLastIncident] = useState<IncidentReport | null>(null);
  const [confirmRollbackTarget, setConfirmRollbackTarget] = useState<Deployment | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Simulation Loop
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => {
        const baseLatency = 80;
        const spike = faults.latencySpike ? Math.random() * 200 + 150 : 0;
        const errs = faults.errorBurst ? Math.floor(Math.random() * 15) + 5 : (Math.random() > 0.9 ? 1 : 0);
        
        const newPoint = {
          time: new Date().toLocaleTimeString(),
          cpu: Math.floor(Math.random() * 10) + (faults.memoryLeak ? 60 : 20),
          memory: Math.floor(Math.random() * 10) + (faults.memoryLeak ? 80 : 45),
          latency: Math.max(10, baseLatency + spike + (Math.random() * 20 - 10)),
          errors: errs,
          baselineLatency: baseLatency
        };
        return [...prev, newPoint].slice(-30);
      });

      setLogs(prev => {
        const newLogs = generateLogs(1, faults);
        return [...newLogs, ...prev.map(l => ({ ...l, isSuspect: false }))].slice(0, 50);
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [faults]);

  // Auto-Analysis logic
  useEffect(() => {
    const lastMetrics = metrics.slice(-3);
    if (lastMetrics.length === 3 && lastMetrics.every(m => m.errors > 8 || m.latency > 220) && !isAnalyzing && !analysis) {
      handleSmartAnalyze();
    }
  }, [metrics, isAnalyzing, analysis]);

  // Scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleSmartAnalyze = async () => {
    setIsAnalyzing(true);
    const active = deployments.find(d => d.status === DeploymentStatus.ACTIVE);
    const previous = deployments.find(d => d.status === DeploymentStatus.PREVIOUS);
    if (!active || !previous) return;

    const result = await analyzeDeploymentHealth(logs.slice(0, 15), metrics, active.version, previous.version);
    
    if (result.suspectLogIndices) {
      setLogs(prev => prev.map((l, i) => ({
        ...l,
        isSuspect: result.suspectLogIndices?.includes(i)
      })));
    }

    setAnalysis(result);
    setIsAnalyzing(false);
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || isChatLoading) return;
    const msg: ChatMessage = { role: 'user', content: userInput, timestamp: new Date().toLocaleTimeString() };
    setChatHistory(prev => [...prev, msg]);
    setUserInput('');
    setIsChatLoading(true);

    const response = await chatWithSRE([...chatHistory, msg], { logs: logs.slice(0, 5), metrics });
    setChatHistory(prev => [...prev, { role: 'assistant', content: response, timestamp: new Date().toLocaleTimeString() }]);
    setIsChatLoading(false);
  };

  const triggerRollback = async (version: string) => {
    setIsRollbackLoading(true);
    setConfirmRollbackTarget(null);
    const active = deployments.find(d => d.status === DeploymentStatus.ACTIVE);
    
    // Generate Report Data before state changes
    const report: IncidentReport = {
      incidentId: `INC-${Math.floor(Math.random() * 10000)}`,
      timestamp: new Date().toISOString(),
      failedVersion: active?.version || 'unknown',
      restoredVersion: version,
      rootCause: analysis?.reasoning || 'Manual operator intervention - health baseline deviation suspected.',
      summary: analysis?.impactAssessment || 'Operator triggered manual rollback to restore known stable environment state.',
      metricsAtFailure: metrics[metrics.length - 1] || { time: '', cpu: 0, memory: 0, latency: 0, errors: 0 },
      resolutionTime: '12s (Manual)'
    };

    await new Promise(r => setTimeout(r, 2000));
    
    setDeployments(prev => prev.map(d => {
      if (d.version === version) return { ...d, status: DeploymentStatus.ACTIVE };
      if (d.status === DeploymentStatus.ACTIVE) return { ...d, status: DeploymentStatus.ROLLED_BACK };
      return d;
    }));

    setLastIncident(report);
    setIsRollbackLoading(false);
    setAnalysis(null);
    setFaults({ latencySpike: false, errorBurst: false, memoryLeak: false });
    setActiveView('report');
  };

  const activeDeployment = deployments.find(d => d.status === DeploymentStatus.ACTIVE);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-200 selection:bg-indigo-500/30 overflow-x-hidden">
      {/* Header */}
      <header className="border-b border-white/5 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-40 px-6 py-4 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
            <div className="relative w-10 h-10 bg-slate-900 border border-white/10 rounded-lg flex items-center justify-center">
              <ShieldCheck className="text-indigo-400 w-6 h-6" />
            </div>
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-white flex items-center gap-2">
              Sentinel <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/20">V3.0 DEEP-SIGHT</span>
            </h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Autonomous Rollback Engine</p>
          </div>
        </div>

        <nav className="flex items-center gap-6">
          <button 
            onClick={() => setActiveView('dashboard')} 
            className={`text-sm font-medium transition-colors flex items-center gap-2 ${activeView === 'dashboard' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Live Dashboard
          </button>
          <button 
            onClick={() => setActiveView('history')} 
            className={`text-sm font-medium transition-colors flex items-center gap-2 ${activeView === 'history' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <History className="w-4 h-4" />
            Deployments
          </button>
          {lastIncident && (
            <button 
              onClick={() => setActiveView('report')} 
              className={`text-sm font-medium transition-colors flex items-center gap-2 ${activeView === 'report' ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <FileText className="w-4 h-4" />
              Latest Incident
            </button>
          )}
          <div className="h-4 w-[1px] bg-white/10 mx-2" />
          <button 
            onClick={() => setIsChatOpen(true)} 
            className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full relative transition-all group"
          >
            <MessageSquare className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full border-2 border-slate-950 animate-pulse" />
          </button>
        </nav>
      </header>

      {/* Manual Rollback Confirmation Modal */}
      {confirmRollbackTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex items-center gap-4 text-amber-500">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white">Manual Rollback</h3>
                <p className="text-xs font-bold text-amber-500 uppercase tracking-widest">Critical Operation</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-slate-400 leading-relaxed">
                You are about to revert the production environment to version <span className="text-white font-bold">{confirmRollbackTarget.version}</span>. This will terminate existing sessions on <span className="text-white font-bold">{activeDeployment?.version}</span>.
              </p>
              
              <div className="bg-slate-950/50 rounded-xl p-4 border border-white/5 space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <span>Target Version</span>
                  <span className="text-white">{confirmRollbackTarget.version}</span>
                </div>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <span>Target Author</span>
                  <span className="text-white">{confirmRollbackTarget.author}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-2">
              <button 
                onClick={() => setConfirmRollbackTarget(null)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-black border border-white/5 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => triggerRollback(confirmRollbackTarget.version)}
                className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black shadow-xl shadow-amber-600/20 transition-all"
              >
                Confirm Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <main className="flex-1 p-6 max-w-[1600px] mx-auto w-full grid grid-cols-1 xl:grid-cols-12 gap-6 relative">
        
        {/* Left Content Area */}
        <div className="xl:col-span-8 space-y-6">
          {activeView === 'dashboard' && (
            <>
              {/* Fault Injector Panel */}
              <section className="bg-slate-900/40 border border-white/5 rounded-2xl p-6 backdrop-blur-sm relative overflow-hidden shadow-lg group">
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
                  <Flame className="w-40 h-40 text-red-500" />
                </div>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-slate-500" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Chaos Simulation Deck</h3>
                  </div>
                  <div className="text-[10px] text-indigo-400 font-mono flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                    SENTINEL MONITORING LIVE
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { id: 'latencySpike', icon: Activity, label: 'Inject Latency', color: 'amber' },
                    { id: 'errorBurst', icon: Flame, label: 'Burst Errors', color: 'red' },
                    { id: 'memoryLeak', icon: Database, label: 'Memory Leak', color: 'indigo' }
                  ].map((fault) => (
                    <button 
                      key={fault.id}
                      onClick={() => setFaults(f => ({...f, [fault.id]: !f[fault.id as keyof FaultState]}))}
                      className={`flex items-center justify-between px-5 py-4 rounded-xl border transition-all duration-300 ${
                        faults[fault.id as keyof FaultState] 
                        ? `bg-${fault.color}-500/10 border-${fault.color}-500/50 text-${fault.color}-500 ring-4 ring-${fault.color}-500/5` 
                        : 'bg-slate-800/30 border-white/5 text-slate-400 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <fault.icon className="w-4 h-4" />
                        <span className="text-sm font-bold tracking-tight">{fault.label}</span>
                      </div>
                      <div className={`w-2.5 h-2.5 rounded-full ${faults[fault.id as keyof FaultState] ? `bg-${fault.color}-500 animate-pulse shadow-[0_0_8px_currentColor]` : 'bg-slate-700'}`} />
                    </button>
                  ))}
                </div>
              </section>

              {/* Metrics & Graphs */}
              <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-500 to-transparent opacity-20" />
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-sm font-bold flex items-center gap-2 text-white">
                      <BarChart3 className="w-4 h-4 text-indigo-400" />
                      Real-time System Telemetry
                    </h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Version: {activeDeployment?.version} • Node: PROD-GW-01</p>
                  </div>
                  <div className="flex gap-6 text-[10px] font-black tracking-widest">
                    <div className="flex items-center gap-1.5 text-indigo-400">
                      <div className="w-2 h-2 bg-indigo-500 rounded-full" /> LATENCY (MS)
                    </div>
                    <div className="flex items-center gap-1.5 text-red-500">
                      <div className="w-2 h-2 bg-red-500 rounded-full" /> ERRORS / SEC
                    </div>
                  </div>
                </div>
                <HealthChart data={metrics} />
              </div>

              {/* Log Stream with RCA highlighting */}
              <div className="bg-slate-950 border border-white/5 rounded-2xl overflow-hidden h-[450px] flex flex-col shadow-inner group">
                <div className="px-5 py-4 bg-slate-900/80 border-b border-white/5 flex items-center justify-between backdrop-blur-md">
                  <div className="flex items-center gap-3">
                    <Terminal className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Kernel Log Output</span>
                  </div>
                  {analysis?.suspectLogIndices && (
                    <div className="flex items-center gap-2 bg-red-500/10 text-red-500 px-3 py-1 rounded-full border border-red-500/20 text-[10px] font-black uppercase tracking-widest animate-pulse">
                      <Bug className="w-3 h-3" />
                      AI Detected Root Cause Candidates
                    </div>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-5 font-mono text-[11px] bg-black/40 space-y-1.5">
                  {logs.map((log, i) => (
                    <div key={i} className={`flex gap-4 p-2 rounded-lg transition-all duration-300 ${log.isSuspect ? 'bg-red-500/10 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'hover:bg-white/5'}`}>
                      <span className="text-slate-600 shrink-0 font-bold">{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}</span>
                      <span className={`font-black w-14 text-center shrink-0 text-[9px] px-1 py-0.5 rounded ${
                        log.level === 'ERROR' || log.level === 'CRITICAL' ? 'bg-red-500/20 text-red-500' : 
                        log.level === 'WARN' ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-500'
                      }`}>
                        {log.level}
                      </span>
                      <span className={`flex-1 ${log.isSuspect ? 'text-red-100 font-bold' : 'text-slate-400'}`}>
                        {log.message}
                      </span>
                      {log.isSuspect && <Info className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeView === 'history' && (
            <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-6">
                <div className="space-y-1">
                  <h2 className="text-2xl font-black text-white flex items-center gap-3">
                    <History className="text-indigo-400 w-8 h-8" />
                    Deployment Registry
                  </h2>
                  <p className="text-slate-500 text-sm font-medium">Select a stable version to initiate manual restoration</p>
                </div>
                <div className="flex items-center gap-3 bg-indigo-500/10 px-4 py-2 rounded-xl border border-indigo-500/20">
                  <Info className="w-4 h-4 text-indigo-400" />
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Operator Console v3</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {deployments.map((dep) => (
                  <div key={dep.id} className={`p-6 rounded-2xl border transition-all duration-300 ${dep.status === DeploymentStatus.ACTIVE ? 'bg-indigo-600/10 border-indigo-500/30 shadow-2xl scale-[1.01]' : 'bg-slate-900/40 border-white/5 hover:border-white/10 group'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${dep.status === DeploymentStatus.ACTIVE ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-800 text-slate-500 group-hover:bg-slate-700 group-hover:text-slate-300'}`}>
                          <Cpu className="w-7 h-7" />
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="text-xl font-black text-white font-mono">{dep.version}</span>
                            <span className={`text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-widest ${
                              dep.status === DeploymentStatus.ACTIVE ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]' : 
                              dep.status === DeploymentStatus.ROLLED_BACK ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 
                              'bg-slate-700/50 text-slate-400 border border-white/5'
                            }`}>
                              {dep.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-2 font-bold uppercase tracking-tight opacity-70">
                            By {dep.author} • {new Date(dep.timestamp).toLocaleString()} • {dep.commitHash}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-10">
                        <div className="text-right">
                          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Health Metric</p>
                          <p className={`text-2xl font-black ${dep.healthScore > 90 ? 'text-emerald-500' : 'text-amber-500'}`}>{dep.healthScore}%</p>
                        </div>
                        {dep.status !== DeploymentStatus.ACTIVE && (
                          <button 
                            disabled={isRollbackLoading}
                            onClick={() => setConfirmRollbackTarget(dep)}
                            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-black transition-all border border-white/10 flex items-center gap-2 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-400 shadow-lg"
                          >
                            <RefreshCcw className={`w-4 h-4 transition-transform group-hover:rotate-180 duration-500 ${isRollbackLoading ? 'animate-spin' : ''}`} />
                            Restore Version
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeView === 'report' && lastIncident && (
            <div className="bg-slate-900 border border-white/5 rounded-3xl p-10 space-y-10 animate-in zoom-in-95 duration-700 shadow-[0_0_100px_rgba(99,102,241,0.05)]">
              <div className="flex justify-between items-start">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 bg-red-500/10 text-red-500 px-4 py-1.5 rounded-full border border-red-500/20 w-fit">
                    <ShieldAlert className="w-4 h-4" />
                    <span className="text-xs font-black tracking-widest uppercase">Post-Incident Report: {lastIncident.incidentId}</span>
                  </div>
                  <h2 className="text-4xl font-black text-white tracking-tight">System Resolution Summary</h2>
                  <p className="text-slate-400 font-medium max-w-2xl leading-relaxed">
                    The rollback engine executed a stabilization event for version <span className="text-red-400 font-bold">{lastIncident.failedVersion}</span> and successfully restored stability by reverting to <span className="text-emerald-400 font-bold">{lastIncident.restoredVersion}</span>.
                  </p>
                </div>
                <div className="bg-slate-800/50 p-6 rounded-2xl border border-white/5 text-center min-w-[160px]">
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">Stability Time</p>
                  <p className="text-3xl font-black text-emerald-400">{lastIncident.resolutionTime}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-950/50 p-6 rounded-2xl border border-white/5 space-y-4">
                  <div className="flex items-center gap-3 text-indigo-400">
                    <Bug className="w-5 h-5" />
                    <h4 className="text-sm font-black uppercase tracking-widest">Root Cause</h4>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">{lastIncident.rootCause}</p>
                </div>
                <div className="bg-slate-950/50 p-6 rounded-2xl border border-white/5 space-y-4">
                  <div className="flex items-center gap-3 text-red-400">
                    <AlertTriangle className="w-5 h-5" />
                    <h4 className="text-sm font-black uppercase tracking-widest">Detection Trigger</h4>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-500 font-bold">Latency at Failure</span>
                      <span className="text-white font-mono">{lastIncident.metricsAtFailure.latency}ms</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-500 font-bold">Error Rate</span>
                      <span className="text-red-400 font-mono">{lastIncident.metricsAtFailure.errors} req/s</span>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-950/50 p-6 rounded-2xl border border-white/5 space-y-4">
                  <div className="flex items-center gap-3 text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                    <h4 className="text-sm font-black uppercase tracking-widest">Remediation Status</h4>
                  </div>
                  <p className="text-xs text-emerald-100/70 font-medium">All nodes verified on stable build {lastIncident.restoredVersion}. Anomaly patterns have cleared. System health score rising.</p>
                </div>
              </div>

              <div className="pt-6 border-t border-white/5 flex justify-end gap-4">
                <button 
                  onClick={() => setActiveView('dashboard')}
                  className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-black border border-white/10 transition-all flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Return to Dashboard
                </button>
                <button 
                  onClick={() => setIsChatOpen(true)}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black shadow-xl shadow-indigo-600/20 transition-all flex items-center gap-2"
                >
                  Discuss with AI Assistant
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar: Deep Sight Panel */}
        <div className="xl:col-span-4 space-y-6">
          <div className={`bg-slate-900 border transition-all duration-700 rounded-3xl overflow-hidden flex flex-col shadow-2xl ${analysis?.recommendation === 'ROLLBACK' ? 'border-red-500/50 ring-4 ring-red-500/5' : 'border-white/5'}`}>
            <div className={`p-8 ${analysis?.recommendation === 'ROLLBACK' ? 'bg-gradient-to-br from-red-600 to-red-800' : 'bg-gradient-to-br from-indigo-600 to-indigo-800'}`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-black text-lg flex items-center gap-2">
                  <BrainCircuit className="w-6 h-6" />
                  Deep-Sight Analysis
                </h3>
                <div className="px-2 py-0.5 bg-black/20 rounded text-[9px] text-white/70 font-black">AI KERNEL v3</div>
              </div>
              <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em]">Neural SRE Guard Monitoring</p>
            </div>

            <div className="p-8 space-y-8">
              {!analysis ? (
                <div className="text-center py-12 space-y-8">
                  <div className="w-24 h-24 bg-slate-800/30 rounded-3xl flex items-center justify-center mx-auto ring-1 ring-white/10 relative transform rotate-12">
                    <Zap className="w-10 h-10 text-slate-500" />
                    <div className="absolute -inset-2 rounded-3xl border border-indigo-500/10 animate-pulse" />
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-black text-white">System Heartbeat: Normal</p>
                    <p className="text-xs text-slate-500 px-6 leading-relaxed font-medium opacity-80 italic">
                      "I'm monitoring the deployment for anomalies. Trigger a manual check or wait for auto-detection."
                    </p>
                  </div>
                  <button 
                    disabled={isAnalyzing}
                    onClick={handleSmartAnalyze}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-3 shadow-2xl shadow-indigo-600/30 active:scale-95"
                  >
                    {isAnalyzing ? (
                      <>
                        <RefreshCcw className="w-4 h-4 animate-spin" />
                        Scanning Neural Fabric...
                      </>
                    ) : (
                      <>
                        <BrainCircuit className="w-4 h-4" />
                        Run Manual Deep Scan
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-8 animate-in fade-in zoom-in-95 duration-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black mb-1">Risk Assessment</p>
                      <h4 className={`text-base font-black tracking-tight ${
                        analysis.recommendation === 'ROLLBACK' ? 'text-red-500' : 
                        analysis.recommendation === 'INVESTIGATE' ? 'text-amber-500' : 
                        'text-emerald-500'
                      }`}>
                        {analysis.recommendation === 'ROLLBACK' ? 'ROLLBACK MANDATORY' : 
                         analysis.recommendation === 'INVESTIGATE' ? 'ANOMALY DETECTED' : 
                         'BASELINE VERIFIED'}
                      </h4>
                    </div>
                    <div className="w-16 h-16 rounded-2xl bg-slate-800 flex flex-col items-center justify-center relative shadow-inner ring-1 ring-white/5">
                      <span className="text-xs text-slate-500 font-black uppercase text-[8px] mb-0.5">Risk</span>
                      <span className="text-lg font-black text-white">{analysis.riskScore}%</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Bug className="w-3 h-3" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Detected Anomalies</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {analysis.detectedAnomalies?.map((a, i) => (
                        <span key={i} className="text-[9px] font-black px-2 py-1 rounded-md bg-white/5 border border-white/5 text-slate-300 uppercase tracking-tighter">
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-800/40 p-5 rounded-2xl border border-white/5 space-y-4 shadow-sm">
                    <div className="flex items-center gap-2 text-indigo-400">
                      <Info className="w-4 h-4" />
                      <span className="text-[10px] font-black uppercase tracking-[0.1em]">AI Internal Reasoning</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-bold opacity-90">
                      {analysis.reasoning}
                    </p>
                    <div className="space-y-2 pt-2">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                        <span>Analysis Confidence</span>
                        <span>{(analysis.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-1000 ${analysis.confidence > 0.8 ? 'bg-indigo-500' : 'bg-amber-500'}`} 
                          style={{ width: `${analysis.confidence * 100}%` }} 
                        />
                      </div>
                    </div>
                  </div>

                  {analysis.recommendation === 'ROLLBACK' && (
                    <div className="p-6 bg-red-950/40 border border-red-500/40 rounded-2xl space-y-6 shadow-2xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-2 opacity-5">
                        <AlertTriangle className="w-12 h-12" />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-red-500">
                          <AlertTriangle className="w-4 h-4" />
                          <span className="text-xs font-black uppercase tracking-widest">Immediate Mitigation</span>
                        </div>
                        <p className="text-xs text-red-100 leading-relaxed font-bold">
                          Critical threshold breached. Recommended rollback target: <span className="bg-red-500/20 px-1.5 py-0.5 rounded text-white">{analysis.suggestedVersion || 'v1.1.9'}</span>
                        </p>
                      </div>
                      <button 
                        disabled={isRollbackLoading}
                        onClick={() => triggerRollback(analysis.suggestedVersion || 'v1.1.9')}
                        className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black shadow-2xl shadow-red-600/40 flex items-center justify-center gap-3 transition-all active:scale-95"
                      >
                        {isRollbackLoading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                        EXECUTE ROLLBACK PROCEDURE
                      </button>
                    </div>
                  )}

                  <button 
                    onClick={() => setAnalysis(null)}
                    className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-500 text-xs font-black rounded-xl transition-colors border border-white/5"
                  >
                    Clear Active Scan
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900 border border-white/5 rounded-3xl p-6 space-y-6 shadow-xl">
            <h3 className="text-xs font-black flex items-center gap-3 uppercase tracking-[0.2em] text-slate-500">
              <Database className="w-4 h-4 text-indigo-400" />
              Runtime Cluster Stats
            </h3>
            <div className="space-y-4">
              {[
                { label: 'Infrastructure', value: 'AWS us-east-1', icon: Clock },
                { label: 'Cluster Healthy', value: '12 / 12 Nodes', icon: CheckCircle2 },
                { label: 'Last Scan', value: '2m 14s ago', icon: History },
                { label: 'Env Type', value: 'Production', icon: Settings }
              ].map((stat, i) => (
                <div key={i} className="flex justify-between items-center group">
                  <div className="flex items-center gap-2">
                    <stat.icon className="w-3.5 h-3.5 text-slate-600" />
                    <span className="text-[11px] text-slate-500 font-bold">{stat.label}</span>
                  </div>
                  <span className={`text-[11px] font-black font-mono ${stat.value.includes('Healthy') ? 'text-emerald-500' : 'text-slate-200'}`}>
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* SRE Assistant Sidebar */}
      <div className={`fixed inset-y-0 right-0 w-[420px] bg-slate-900/98 backdrop-blur-3xl border-l border-white/10 z-50 transform transition-transform duration-700 ease-in-out shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col ${isChatOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-8 border-b border-white/10 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-600/20">
              <BrainCircuit className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-base font-black text-white tracking-tight">SRE Assistant</h3>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <p className="text-[9px] text-emerald-500 font-black uppercase tracking-widest">Neural Link Established</p>
              </div>
            </div>
          </div>
          <button onClick={() => setIsChatOpen(false)} className="p-2.5 hover:bg-white/5 rounded-xl text-slate-500 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth scrollbar-hide">
          {chatHistory.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-40 grayscale group hover:grayscale-0 transition-all duration-700">
              <MessageSquare className="w-16 h-16 text-slate-700 group-hover:text-indigo-500 transition-colors" />
              <div className="space-y-2">
                <p className="text-base font-black text-white">Ask anything about deployment health</p>
                <p className="text-xs px-12 leading-relaxed font-bold">Try: "Summarize the blast radius of the current errors" or "Explain the latency spike logic."</p>
              </div>
            </div>
          )}
          {chatHistory.map((chat, i) => (
            <div key={i} className={`flex flex-col ${chat.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 duration-300`}>
              <div className={`max-w-[85%] rounded-3xl p-5 text-xs leading-relaxed font-bold shadow-xl ${
                chat.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-tr-none' 
                : 'bg-slate-800 text-slate-200 border border-white/5 rounded-tl-none ring-1 ring-white/5'
              }`}>
                {chat.content}
              </div>
              <span className="text-[9px] text-slate-600 mt-2.5 font-black uppercase tracking-widest opacity-60 px-2">
                {chat.role === 'user' ? 'Operator' : 'Sentinel-AI'} • {chat.timestamp}
              </span>
            </div>
          ))}
          {isChatLoading && (
            <div className="flex flex-col items-start animate-pulse">
              <div className="bg-slate-800 p-5 rounded-3xl text-xs flex gap-2 ring-1 ring-white/5">
                <div className="w-2 h-2 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="p-8 bg-slate-900 border-t border-white/10">
          <div className="relative group">
            <input 
              type="text" 
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Inquire system kernel..."
              className="w-full bg-slate-950 border border-white/10 rounded-2xl px-6 py-4 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all pr-14 text-white placeholder:text-slate-600"
            />
            <button 
              onClick={handleSendMessage}
              disabled={!userInput.trim() || isChatLoading}
              className="absolute right-3 top-3 p-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-xl transition-all shadow-lg"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* VS Code Style Footer Bar */}
      <footer className="bg-indigo-700 text-white px-5 py-2 flex items-center justify-between text-[10px] font-black tracking-tighter shadow-2xl z-40">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2.5 hover:bg-white/10 px-3 py-1 cursor-pointer rounded-md transition-colors">
            <ShieldCheck className="w-4 h-4" />
            <span>SENTINEL-MASTER-v3.0.4</span>
          </div>
          <div className="flex items-center gap-2.5 hover:bg-white/10 px-3 py-1 cursor-pointer rounded-md transition-colors text-emerald-300">
            <Activity className="w-4 h-4" />
            <span>LATENCY: {metrics.length > 0 ? metrics[metrics.length-1].latency : 0}ms</span>
          </div>
          <div className="flex items-center gap-2.5 hover:bg-white/10 px-3 py-1 cursor-pointer rounded-md transition-colors text-indigo-100">
            <Cpu className="w-4 h-4" />
            <span>LOAD: {metrics.length > 0 ? metrics[metrics.length-1].cpu : 0}%</span>
          </div>
        </div>
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2.5 hover:bg-white/10 px-3 py-1 cursor-pointer rounded-md transition-colors">
            <Terminal className="w-4 h-4" />
            <span>UTF-8 / React v19</span>
          </div>
          <div className="flex items-center gap-3 hover:bg-white/10 px-3 py-1 cursor-pointer rounded-md transition-colors group">
            <span className="text-white/60 group-hover:text-white uppercase font-black">Autonomous Mode</span>
            <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,1)]" />
          </div>
        </div>
      </footer>
    </div>
  );
};

export default DeploymentRollback;