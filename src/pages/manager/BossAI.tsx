import { useEffect, useState } from "react";
import { Bot, CheckCircle2, Clock3, RefreshCw, Send, ShieldCheck, TriangleAlert } from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { showToast } from "../../components/shared/Toast";
import { supabase } from "../../services/supabaseClient";
import { listBossIncidents, runBossHealthCheck, setBossAutoFix, type BossIncident } from "../../services/bossAIService";

export default function BossAI() {
  const [incidents, setIncidents] = useState<BossIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [autoFix, setAutoFix] = useState(false);
  const [checking, setChecking] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [lastQuestion, setLastQuestion] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data, error }, { data: settings }] = await Promise.all([
      listBossIncidents(),
      supabase.from("boss_ai_settings").select("auto_fix_enabled").eq("id", true).maybeSingle(),
    ]);
    if (error) showToast("error", error);
    setIncidents(data);
    setAutoFix(Boolean(settings?.auto_fix_enabled));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const healthCheck = async () => {
    setChecking(true);
    const result = await runBossHealthCheck();
    if (result.error) showToast("error", result.error);
    else {
      setHealth(result.data);
      showToast("success", "BOSS AI health check completed");
    }
    setChecking(false);
  };

  const toggleAutoFix = async () => {
    const next = !autoFix;
    const error = await setBossAutoFix(next);
    if (error) showToast("error", error);
    else {
      setAutoFix(next);
      showToast("success", next ? "Auto-fix enabled for approved workflows" : "Auto-fix disabled");
    }
  };

  const askBossAI = async (requestedQuestion = question) => {
    if (!requestedQuestion.trim()) return;
    const nextMessages = [...messages, { role: "user" as const, content: requestedQuestion.trim() }];
    setAsking(true);
    setLastQuestion(requestedQuestion.trim());
    const { data, error } = await supabase.functions.invoke("boss-ai-chat", {
      body: {
        message: requestedQuestion.trim(),
        messages: nextMessages,
        context: { page: window.location.pathname, requested_at: new Date().toISOString() },
      },
    });
    if (error || data?.success === false || data?.error) {
      console.error("Boss AI request failed", { error, data });
      showToast("error", data?.error || error?.message || "Boss AI could not process your request.");
    }
    else {
      const response = data?.reply ?? data?.answer ?? "No answer returned";
      setAnswer(response);
      setMessages([...nextMessages, { role: "assistant", content: response }]);
      setQuestion("");
    }
    setAsking(false);
  };

  const retryQuestion = () => {
    void askBossAI(lastQuestion);
  };

  const active = incidents.filter((incident) => !["Fixed", "Rolled Back"].includes(incident.status)).length;
  const fixed = incidents.filter((incident) => incident.status === "Fixed").length;
  const failed = incidents.filter((incident) => ["Verification Failed", "Needs Developer"].includes(incident.status)).length;

  return (
    <div>
      <PageHeader
        title="BOSS AI"
        subtitle="Safe incident detection, diagnosis, and verification"
        icon={<Bot className="w-5 h-5" />}
        actions={
          <>
            <button onClick={healthCheck} disabled={checking} className="btn-secondary text-sm flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} /> Run Health Check
            </button>
            <button onClick={load} className="btn-ghost p-2" aria-label="Refresh incidents"><RefreshCw className="w-4 h-4" /></button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Metric title="System Health" value={health?.database === "ok" ? "Healthy" : "Check needed"} icon={<ShieldCheck className="w-5 h-5" />} />
        <Metric title="Active Problems" value={active} icon={<TriangleAlert className="w-5 h-5" />} />
        <Metric title="Automatically Fixed" value={fixed} icon={<CheckCircle2 className="w-5 h-5" />} />
        <Metric title="Needs Developer" value={failed} icon={<Clock3 className="w-5 h-5" />} />
      </div>

      <div className="card p-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white">Repair Controls</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Approval gate only. Unverified production changes are never applied.</p>
        </div>
        <button onClick={toggleAutoFix} className={`px-4 py-2 rounded-lg text-sm font-medium ${autoFix ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"}`}>
          Repair gate: {autoFix ? "Enabled" : "Disabled"}
        </button>
      </div>

      {health && <div className="card p-5 mb-6"><h2 className="font-semibold text-slate-900 dark:text-white mb-2">Latest Health Evidence</h2><pre className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{JSON.stringify(health, null, 2)}</pre></div>}

      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-slate-900 dark:text-white">Ask BOSS AI</h2>
        {messages.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Good Morning! I&apos;m Boss AI, your Kalyani Motors MIS Team assistant. What would you like to check?</p>}
        <div className="flex gap-2 mt-4">
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void askBossAI(); } }} className="input-field flex-1 min-h-[44px]" placeholder="Ask about today's MIS work..." />
          <button onClick={() => void askBossAI()} disabled={asking || !question.trim()} className="btn-primary flex items-center gap-2"><Send className="w-4 h-4" /> Ask</button>
        </div>
        {asking && <p className="mt-4 text-sm text-slate-500">Boss AI is checking verified application data...</p>}
        {answer && <div className="mt-4 p-4 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{answer}</div>}
        {lastQuestion && !answer && !asking && <button onClick={retryQuestion} className="mt-3 btn-secondary text-sm">Retry</button>}
        {answer && <button onClick={() => { setMessages([]); setAnswer(""); setLastQuestion(""); }} className="mt-3 btn-secondary text-sm">Clear Chat</button>}
      </div>

      <div className="card overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-700/50"><h2 className="font-semibold text-slate-900 dark:text-white">Incident History</h2></div>
        {loading ? <div className="p-8 text-center text-slate-500">Loading incidents...</div> : incidents.length === 0 ? <div className="p-8 text-center text-slate-500">No incidents recorded.</div> : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {incidents.map((incident) => <div key={incident.id} className="p-5 flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6">
              <div className="min-w-0 flex-1"><p className="font-medium text-slate-900 dark:text-white truncate">{incident.error_message}</p><p className="text-xs text-slate-500 mt-1">{incident.route || "Unknown route"} · {incident.occurrence_count} occurrence(s)</p></div>
              <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200 w-fit">{incident.status}</span>
              <span className="text-xs text-slate-500">{new Date(incident.last_seen).toLocaleString()}</span>
            </div>)}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ title, value, icon }: { title: string; value: string | number; icon: React.ReactNode }) {
  return <div className="card p-4"><div className="flex items-center justify-between text-primary-600 dark:text-primary-400">{icon}<span className="text-lg font-bold text-slate-900 dark:text-white">{value}</span></div><p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{title}</p></div>;
}
