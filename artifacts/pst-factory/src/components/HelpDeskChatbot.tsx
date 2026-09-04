import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bot, ChevronDown, Send, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

interface HelpDeskChatbotProps {
  onSendMessage: (message: string, history: Message[]) => Promise<string>;
}

const STARTER_QUESTIONS = [
  "Bagaimana alur pembuatan proyek?",
  "Bantu saya memeriksa hasil rancangan.",
  "Bagaimana publikasi bekerja?"
];

export function HelpDeskChatbot({ onSendMessage }: HelpDeskChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, isOpen, error]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const handleSend = async (text: string = input) => {
    if (!text.trim() || isTyping) return;
    
    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: text.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    setError(null);
    setIsTyping(true);

    try {
      const response = await onSendMessage(userMessage.content, messages);
      const botMessage: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: response };
      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pesan gagal terkirim.");
    } finally {
      setIsTyping(false);
    }
  };

  const executeRetry = async () => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;

    setError(null);
    setIsTyping(true);
    try {
      const history = messages.filter((message) => message.id !== lastUserMsg.id);
      const response = await onSendMessage(lastUserMsg.content, history);
      const botMessage: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: response };
      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pesan gagal terkirim.");
    } finally {
      setIsTyping(false);
    }
  };

  return createPortal(
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-6 left-[calc(100vw-5rem)] z-40 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover-elevate focus-ring md:bottom-8",
          isOpen ? "scale-0 opacity-0" : "scale-100 opacity-100"
        )}
        aria-label="Buka bantuan"
        data-testid="button-open-chatbot"
      >
        <Bot size={24} />
      </button>

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Help Desk PST Factory"
        aria-hidden={!isOpen}
        className={cn(
          "fixed z-50 flex flex-col bg-card shadow-2xl transition-all duration-300 ease-out border-border",
          isOpen ? "translate-y-0 opacity-100 pointer-events-auto" : "translate-y-8 opacity-0 pointer-events-none",
          "inset-0 w-full sm:inset-auto sm:bottom-8 sm:left-[calc(100vw-432px)] sm:h-[600px] sm:w-[400px] sm:rounded-2xl sm:border"
        )}
        data-testid="container-chatbot"
      >
        <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-border/70 px-5">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Bot size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold">Help Desk</h2>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Sistem siap
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
            aria-label="Tutup"
            data-testid="button-close-chatbot"
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronDown size={20} />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center space-y-4 animate-rise">
              <div className="rounded-full border border-primary/20 bg-primary/5 p-4 text-primary">
                <Bot size={32} />
              </div>
              <div>
                 <p className="font-semibold text-sm">Ada yang bisa dibantu?</p>
                 <p className="mt-1 text-xs text-muted-foreground max-w-[250px] mx-auto">
                   Tanyakan seputar panduan, alur, atau masalah produksi pabrik.
                 </p>
              </div>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {STARTER_QUESTIONS.map((q, idx) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    className="focus-ring rounded-full border border-border bg-muted/40 px-3.5 py-1.5 text-xs text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary transition-colors"
                    data-testid={`button-starter-${idx}`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex w-full animate-rise", m.role === 'user' ? "justify-end" : "justify-start")}
              data-testid={`message-${m.role}-${m.id}`}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  m.role === 'user'
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted/40 border border-border/60 text-foreground rounded-tl-sm"
                )}
              >
                {m.content}
              </div>
            </div>
          ))}
          
          {isTyping && (
            <div className="flex w-full justify-start animate-rise" data-testid="message-typing">
               <div className="rounded-2xl bg-muted/40 border border-border/60 px-4 py-3.5 rounded-tl-sm flex items-center gap-1.5">
                 <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                 <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                 <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
               </div>
            </div>
          )}

          {error && (
             <div className="flex w-full justify-center animate-rise" data-testid="message-error">
               <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                 <AlertTriangle size={14} />
                 <span>{error}</span>
                 <button
                   onClick={executeRetry}
                   className="ml-1 font-semibold underline hover:text-destructive/80 focus-ring rounded-sm"
                   data-testid="button-retry-message"
                 >
                   Coba lagi
                 </button>
               </div>
             </div>
          )}
          <div ref={messagesEndRef} className="h-1" />
        </div>

        <footer className="shrink-0 border-t border-border/70 bg-card p-4">
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="relative flex items-end gap-2"
          >
            <Textarea
               ref={inputRef}
               value={input}
               onChange={handleInput}
               onKeyDown={(e) => {
                 if (e.key === 'Enter' && !e.shiftKey) {
                   e.preventDefault();
                   handleSend();
                 }
               }}
               placeholder="Ketik pesan..."
               className="min-h-[44px] max-h-[120px] resize-none pr-12 text-sm bg-muted/30 border-border/60 focus-visible:ring-1 focus-visible:ring-primary py-3 rounded-xl"
               rows={1}
               data-testid="input-chat-message"
            />
            <Button 
              type="submit" 
              size="icon" 
              disabled={!input.trim() || isTyping}
              className="absolute right-1.5 bottom-1.5 h-8 w-8 shrink-0 rounded-lg"
              data-testid="button-send-message"
            >
              <Send size={15} />
            </Button>
          </form>
        </footer>
      </div>
    </>,
    document.body,
  );
}
