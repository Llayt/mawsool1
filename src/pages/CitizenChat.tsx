import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, FileText, Building2, ExternalLink, AlertCircle, User, Settings, ShieldCheck, Link2, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/useAppData';
import { LoadingSpinner, ErrorState } from '@/components/ui';

interface ServiceStep {
  serviceId: string;
  serviceName: string;
  agencyName: string;
  reason: string;
  requirements: string[];
  link: string | null;
  policyTitle: string;
  policyVersion: string;
  relationType?: string;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  steps?: ServiceStep[];
  sources?: Array<{ label: string; url: string }>;
  isApproved?: boolean;
  isFallback?: boolean;
  isSetupError?: boolean;
  retrievedRules?: string[];
}

interface EdgeFunctionResponse {
  type: 'services' | 'clarify' | 'no_match' | 'approved';
  reply: string;
  steps?: ServiceStep[];
  sources?: Array<{ label: string; url: string }>;
  caseTitle?: string;
  retrievedRules?: string[];
  fallback?: boolean;
  error?: string;
  message?: string;
}

interface CitizenChatProps {
  onBack: () => void;
}

export function CitizenChat({ onBack }: CitizenChatProps) {
  const { loading, error, refresh } = useAppData();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      const { data: session } = await supabase.from('chat_sessions').insert({}).select().single();
      if (cancelled || !session) return;
      setSessionId(session.id);
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: 'أهلًا بك، أخبرني ما الذي ترغب في إنجازه، وسأرشدك إلى الخطوات المناسبة بناءً على السياسات السارية.',
      }]);
    })();
    return () => { cancelled = true; };
  }, [loading]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const callAssistant = async (message: string, history: Array<{ role: string; content: string }>): Promise<EdgeFunctionResponse> => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const url = `${supabaseUrl}/functions/v1/citizen-assistant`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({ message, history }),
    });

    const data: EdgeFunctionResponse = await res.json();

    if (!res.ok) {
      throw new Error(data.message || data.error || `خطأ في الاتصال (${res.status})`);
    }

    return data;
  };

  const handleSend = async () => {
    if (!input.trim() || thinking) return;
    const userMsg = input.trim();
    setInput('');

    const userChatMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', content: userMsg };
    setMessages((prev) => [...prev, userChatMsg]);

    if (sessionId) {
      await supabase.from('chat_messages').insert({
        session_id: sessionId,
        role: 'user',
        content: userMsg,
      });
    }

    setThinking(true);

    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    let assistantContent = '';
    let assistantSteps: ServiceStep[] | undefined;
    let assistantSources: Array<{ label: string; url: string }> | undefined;
    let isApproved = false;
    let isFallback = false;
    let isSetupError = false;
    let retrievedRules: string[] | undefined;

    try {
      const result = await callAssistant(userMsg, history);

      if (!result.reply || typeof result.reply !== 'string') {
        assistantContent = 'تعذر تحليل رد المساعد الذكي. حاول إعادة صياغة طلبك أو المحاولة مرة أخرى.';
      } else {
        assistantContent = result.reply;
      }

      if (result.type === 'approved') {
        isApproved = true;
        if (Array.isArray(result.steps)) {
          assistantSteps = result.steps.filter(
            (s) => s && typeof s.serviceName === 'string' && typeof s.reason === 'string'
          );
        }
        if (Array.isArray(result.sources)) {
          assistantSources = result.sources;
        }
      } else if (result.type === 'services' && Array.isArray(result.steps)) {
        assistantSteps = result.steps.filter(
          (s) => s && typeof s.serviceName === 'string' && typeof s.reason === 'string'
        );
      }

      if (result.fallback) {
        isFallback = true;
        retrievedRules = result.retrievedRules;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ غير متوقع';
      if (msg.includes('GROQ_API_KEY') || msg.includes('غير مُعد')) {
        assistantContent = msg;
        isSetupError = true;
      } else if (msg.includes('الحصة المجانية') || msg.includes('QUOTA')) {
        assistantContent = 'وصلنا إلى حد الاستخدام في Groq API مؤقتًا. يمكن إعادة المحاولة بعد قليل.';
      } else {
        assistantContent = `تعذر الاتصال بالمساعد الذكي: ${msg}`;
      }
    }

    setThinking(false);

    const assistantMsg: ChatMsg = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: assistantContent,
      steps: assistantSteps,
      sources: assistantSources,
      isApproved,
      isFallback,
      isSetupError,
      retrievedRules,
    };
    setMessages((prev) => [...prev, assistantMsg]);

    if (sessionId) {
      await supabase.from('chat_messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content: assistantContent,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) return <LoadingSpinner text="جاري تحميل البيانات..." />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-emerald-50 to-white">
      {/* Chat header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-emerald-700" />
        </div>
        <div className="flex-1">
          <h2 className="font-bold text-gray-800">المساعد الذكي</h2>
          <p className="text-xs text-emerald-600 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            مدعوم بقاعدة المعرفة والبحث الدلالي — يستخدم آخر نسخة سارية من السياسات
          </p>
        </div>
        <button onClick={onBack} className="btn-ghost text-sm">خروج</button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto chat-scroll px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-slide-up`}>
              {/* Avatar */}
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                msg.role === 'user' ? 'bg-teal-100' : msg.isSetupError ? 'bg-orange-100' : msg.isApproved ? 'bg-emerald-700' : 'bg-emerald-800'
              }`}>
                {msg.role === 'user'
                  ? <User className="w-5 h-5 text-teal-700" />
                  : msg.isSetupError
                    ? <Settings className="w-5 h-5 text-orange-600" />
                    : msg.isApproved
                      ? <ShieldCheck className="w-5 h-5 text-white" />
                      : <Sparkles className="w-5 h-5 text-teal-300" />
                }
              </div>

              {/* Bubble */}
              <div className={`max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-3`}>
                {msg.isApproved && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    إجابة معتمدة من قاعدة المعرفة
                  </div>
                )}
                {msg.isFallback && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-orange-600">
                    <AlertCircle className="w-3.5 h-3.5" />
                    رد احتياطي — تعذر الاتصال بالمساعد الذكي
                  </div>
                )}
                <div className={`px-5 py-3 rounded-2xl ${
                  msg.role === 'user'
                    ? 'bg-teal-600 text-white rounded-tr-sm'
                    : msg.isSetupError
                      ? 'bg-orange-50 border border-orange-300 text-orange-800 rounded-tl-sm shadow-sm'
                      : msg.isApproved
                        ? 'bg-emerald-50 border border-emerald-300 text-gray-800 rounded-tl-sm shadow-sm'
                        : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
                }`}>
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>

                {/* Retrieved rules (fallback display) */}
                {msg.retrievedRules && msg.retrievedRules.length > 0 && (
                  <div className="w-full space-y-2">
                    {msg.retrievedRules.map((rule, idx) => (
                      <div key={idx} className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-gray-700">
                        <Info className="w-3.5 h-3.5 text-emerald-600 inline ml-1.5" />
                        {rule}
                      </div>
                    ))}
                  </div>
                )}

                {/* Service steps */}
                {msg.steps && msg.steps.length > 0 && (
                  <div className="space-y-3 w-full">
                    {msg.steps.map((step, idx) => (
                      <ServiceStepCard key={idx} step={step} index={idx + 1} />
                    ))}
                  </div>
                )}

                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="w-full">
                    <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                      <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5" />
                        المصادر
                      </p>
                      <div className="space-y-1">
                        {msg.sources.map((src, idx) => (
                          <a key={idx} href={src.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-sm text-emerald-700 hover:underline">
                            <ExternalLink className="w-3.5 h-3.5" />
                            {src.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {thinking && (
            <div className="flex gap-3 animate-fade-in">
              <div className="w-9 h-9 rounded-xl bg-emerald-800 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-teal-300" />
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="اكتب طلبك هنا... مثلاً: عندي سجلات فرعية لمؤسستي، وش أسوي بعد النظام الجديد؟"
              rows={1}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-300 bg-gray-50 text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all max-h-32"
              style={{ minHeight: '52px' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || thinking}
              className="w-12 h-12 rounded-xl bg-emerald-800 text-white flex items-center justify-center hover:bg-emerald-900 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg active:scale-95 shrink-0"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            المساعد يستخدم البحث الدلالي وقاعدة المعرفة الموثقة، ولا يختلق معلومات غير موجودة.
          </p>
        </div>
      </div>
    </div>
  );
}

function ServiceStepCard({ step, index }: { step: ServiceStep; index: number }) {
  const isDirect = step.relationType === 'direct';
  return (
    <div className={`card p-4 animate-slide-up border-r-4 ${isDirect ? 'border-r-emerald-600' : 'border-r-teal-400'}`}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-800 text-white font-bold flex items-center justify-center shrink-0 text-sm">
          {index}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-emerald-600" />
            <h4 className="font-bold text-gray-800">{step.serviceName}</h4>
            {step.relationType && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                isDirect
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-teal-100 text-teal-700'
              }`}>
                {isDirect ? 'علاقة مباشرة' : 'ارتباط محتمل'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-600 mb-2">
            <Building2 className="w-3.5 h-3.5" />
            <span>{step.agencyName}</span>
          </div>

          <div className="bg-emerald-50 rounded-lg px-3 py-2 mb-3">
            <p className="text-xs text-emerald-700 flex items-start gap-1.5">
              <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {step.reason}
            </p>
          </div>

          {step.requirements.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-gray-500 mb-1.5">المتطلبات:</p>
              <div className="flex flex-wrap gap-1.5">
                {step.requirements.map((req, idx) => (
                  <span key={idx} className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium">
                    {req}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
            <div className="text-xs text-gray-400">
              {step.policyTitle && <span>السياسة: {step.policyTitle} — </span>}
              {step.policyVersion}
            </div>
            {step.link ? (
              <a
                href={step.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-emerald-700 font-medium hover:underline"
              >
                الرابط الرسمي
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : (
              <span className="flex items-center gap-1 text-xs text-teal-600">
                <AlertCircle className="w-3.5 h-3.5" />
                الرابط يحتاج تحقق
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
