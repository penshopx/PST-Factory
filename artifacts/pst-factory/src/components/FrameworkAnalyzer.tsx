import { useEffect, useMemo, useState } from 'react';
import {
  useAnalyzePstFramework,
  useConvertPstActionPlan,
  type ActionPlanItem,
  type FrameworkAnalysis,
  type PstBlueprint,
  type PstProject,
} from '@workspace/api-client-react';
import {
  Bot, Check, CheckCircle2, Clipboard, Download, GitBranch, Sparkles, Target, TriangleAlert, MoveRight, Layers, LayoutGrid, FileText, ShieldCheck
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function actionPlanMarkdown(items: ActionPlanItem[]) {
  const rows = items.map((item) =>
    `| ${item.task_title.replaceAll('|', '\\|')} | ${item.description.replaceAll('|', '\\|')} | ${item.priority} | ${item.suggested_timeline.replaceAll('|', '\\|')} | ${item.success_metric.replaceAll('|', '\\|')} |`,
  );
  return [
    '# PST Action Plan',
    '',
    '| Task | Description | Priority | Suggested timeline | Success metric |',
    '|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

function actionPlanCsv(items: ActionPlanItem[]) {
  return [
    ['task_title', 'description', 'priority', 'suggested_timeline', 'success_metric'].join(','),
    ...items.map((item) => [
      item.task_title,
      item.description,
      item.priority,
      item.suggested_timeline,
      item.success_metric,
    ].map(escapeCsv).join(',')),
  ].join('\n');
}

function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function priorityTone(priority: ActionPlanItem['priority']) {
  if (priority === 'High') return 'border-rose-500/35 bg-rose-500/10 text-rose-600 dark:text-rose-300';
  if (priority === 'Med') return 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300';
}

export default function FrameworkAnalyzer({ project, blueprint }: { project: PstProject; blueprint?: PstBlueprint }) {
  const [problemStatement, setProblemStatement] = useState(project.problemStatement);
  const [additionalContext, setAdditionalContext] = useState('');
  const [analysis, setAnalysis] = useState<FrameworkAnalysis | null>(null);
  const [selectedSolutionIds, setSelectedSolutionIds] = useState<string[]>([]);
  const [actionPlan, setActionPlan] = useState<ActionPlanItem[]>([]);
  const [copied, setCopied] = useState(false);
  const analyzer = useAnalyzePstFramework();
  const converter = useConvertPstActionPlan();

  useEffect(() => {
    setProblemStatement(project.problemStatement);
    setAnalysis(null);
    setSelectedSolutionIds([]);
    setActionPlan([]);
  }, [project.id, project.problemStatement]);

  const selectedSolutions = useMemo(
    () => analysis?.recommended_solutions.filter((solution) => selectedSolutionIds.includes(solution.id)) ?? [],
    [analysis, selectedSolutionIds],
  );
  const validProblem = problemStatement.trim().length >= 10;
  const markdown = actionPlanMarkdown(actionPlan);

  const runAnalysis = () => {
    const normalizedTargetUser = project.targetUser?.trim();
    analyzer.mutate({
      data: {
        problemStatement: problemStatement.trim(),
        ...(normalizedTargetUser ? { targetUser: normalizedTargetUser } : {}),
        additionalContext: additionalContext.trim() || undefined,
      },
    }, {
      onSuccess: (result) => {
        setAnalysis(result);
        setSelectedSolutionIds(result.recommended_solutions.map((solution) => solution.id));
        setActionPlan([]);
      },
    });
  };

  const convert = () => {
    if (!analysis || selectedSolutions.length === 0) return;
    converter.mutate({
      data: {
        frameworkName: analysis.selected_framework.name,
        solutions: selectedSolutions,
      },
    }, {
      onSuccess: (result) => setActionPlan(result.action_plan),
    });
  };

  const toggleSolution = (id: string) => {
    setSelectedSolutionIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
    setActionPlan([]);
  };

  const copyPlan = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-8" data-testid="framework-analyzer">
      <div className="grid gap-8 xl:grid-cols-[400px_1fr]">
        {/* Left Column: Input */}
        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-primary/20 bg-card shadow-sm overflow-hidden flex flex-col">
            <div className="border-b border-primary/10 bg-primary/[.03] px-5 py-4 flex items-center gap-3">
              <div className="rounded-md bg-primary/10 p-1.5 text-primary"><Bot size={18} /></div>
              <div>
                <h3 className="font-bold text-sm">AI Framework Selector</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Pertajam rumusan dan pilih kerangka.</p>
              </div>
            </div>
            <div className="p-5 flex flex-col gap-5">
              <label className="block group">
                <span className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground group-focus-within:text-primary transition-colors">Problem mentah</span>
                <Textarea
                  value={problemStatement}
                  onChange={(event) => setProblemStatement(event.target.value)}
                  className="min-h-32 resize-none bg-background/50 focus:bg-background transition-colors rounded-lg text-sm leading-relaxed"
                  placeholder="Jelaskan situasi yang berulang, siapa yang terdampak, dan akibatnya."
                  data-testid="input-framework-problem"
                />
              </label>
              <label className="block group">
                <span className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground group-focus-within:text-primary transition-colors">Konteks tambahan</span>
                <Textarea
                  value={additionalContext}
                  onChange={(event) => setAdditionalContext(event.target.value)}
                  className="min-h-24 resize-none bg-background/50 focus:bg-background transition-colors rounded-lg text-sm leading-relaxed"
                  placeholder="Batasan, asumsi, atau prioritas (opsional)."
                  data-testid="input-framework-context"
                />
              </label>
              
              <div className="pt-2">
                <Button 
                  className="w-full relative overflow-hidden group" 
                  onClick={runAnalysis} 
                  disabled={!validProblem || analyzer.isPending} 
                  data-testid="button-analyze-framework"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-white/20 to-primary/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                  <Sparkles size={16} className="mr-2" /> 
                  {analyzer.isPending ? 'Menganalisis problem...' : 'Pilih framework & analisis'}
                </Button>
                {!validProblem && <p className="mt-3 text-center text-[11px] text-muted-foreground">Tuliskan sedikitnya satu kalimat problem yang jelas.</p>}
                {analyzer.isError && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive" role="alert" data-testid="status-framework-error">
                    <TriangleAlert className="mt-0.5 shrink-0" size={14} /> 
                    <span>
                      {(analyzer.error as { data?: { error?: string } })?.data?.error
                        ?? 'Analisis AI belum tersedia. Periksa konteks lalu coba lagi.'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {blueprint?.aiRequirements?.length ? (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-bold text-sm flex items-center gap-2 mb-1">
                <ShieldCheck size={16} className="text-muted-foreground" />
                Batas bantuan AI
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Saran tetap dapat ditinjau atau diabaikan.</p>
              <div className="space-y-2">
                {blueprint.aiRequirements.map((item) => (
                  <div className="flex gap-2.5 rounded-lg bg-muted/40 p-2.5 text-xs text-foreground/80 leading-relaxed" key={item}>
                    <span className="text-primary font-mono select-none">+</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Right Column: Analysis Output */}
        <div className="flex flex-col gap-8 min-w-0">
          {/* Selected Framework */}
          <div className="rounded-xl border border-primary/20 bg-card overflow-hidden flex flex-col relative factory-grid shadow-sm">
            <div className="border-b border-primary/10 bg-primary/[.02] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-primary/10 p-1.5 text-primary"><GitBranch size={18} /></div>
                <div>
                  <h3 className="font-bold text-sm">Ruang Analisis</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Hasil tetap transparan dan dapat ditinjau.</p>
                </div>
              </div>
              {analysis && (
                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary font-mono text-[10px] tracking-widest uppercase">
                  AI Analyzed
                </Badge>
              )}
            </div>
            
            <div className="p-6">
              {analysis ? (
                <div className="animate-rise">
                  <div className="mb-4">
                    <span className="inline-block mb-3 rounded border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
                      Framework Terpilih
                    </span>
                    <h2 className="text-3xl font-extrabold tracking-tight text-foreground">{analysis.selected_framework.name}</h2>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground max-w-3xl">
                      {analysis.selected_framework.reason}
                    </p>
                  </div>

                  <div className="mt-6 rounded-lg border border-border/60 bg-muted/20 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText size={14} className="text-primary" />
                      <span className="font-mono text-[10px] uppercase tracking-widest text-primary font-semibold">Problem Statement AI</span>
                    </div>
                    <p className="text-sm leading-relaxed font-medium">
                      {analysis.problem_statement}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[240px] flex-col items-center justify-center text-center">
                  <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-dashed border-primary/30 bg-primary/5 text-primary/50">
                    <LayoutGrid size={28} strokeWidth={1.5} />
                  </div>
                  <p className="font-bold text-base">Belum ada framework terpilih</p>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    Jalankan analisis untuk melihat struktur masalah sebagai cabang yang mudah ditinjau.
                  </p>
                </div>
              )}
            </div>
          </div>

          {analysis && (
            <div className="animate-rise-2 flex flex-col gap-8">
              {/* Breakdown MECE */}
              <div className="space-y-4" data-testid="framework-breakdown">
                <div className="flex items-center gap-2 px-1">
                  <Layers size={18} className="text-primary" />
                  <h3 className="font-bold text-lg">Breakdown MECE</h3>
                </div>
                
                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {analysis.framework_breakdown.map((node, index) => (
                    <div 
                      className="group relative rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 flex flex-col" 
                      key={node.id} 
                      data-testid={`framework-node-${node.id}`}
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 font-mono text-[11px] font-bold text-primary ring-4 ring-background">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                      </div>
                      <h4 className="font-bold text-base leading-tight mb-2 group-hover:text-primary transition-colors">{node.label}</h4>
                      <p className="text-sm leading-relaxed text-muted-foreground mb-5 flex-1">{node.question}</p>
                      
                      <div className="mb-5 rounded-lg border border-primary/10 bg-primary/[.03] p-3">
                        <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-primary font-semibold">Fokus Area</p>
                        <p className="text-xs leading-relaxed font-medium">{node.focus}</p>
                      </div>
                      
                      <div className="space-y-2.5">
                        {node.children.map((child) => (
                          <div className="flex items-start gap-2.5 text-xs text-muted-foreground" key={child}>
                            <div className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/50" />
                            <span className="leading-snug">{child}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommended Solutions */}
              <div className="space-y-4" data-testid="recommended-solutions">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 px-1">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Target size={18} className="text-accent" />
                      <h3 className="font-bold text-lg">Rekomendasi Solusi</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">Pilih solusi yang ingin diubah menjadi action items.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="font-mono text-xs font-semibold px-2.5 py-1 rounded-md bg-muted/60">
                      {selectedSolutionIds.length} / {analysis.recommended_solutions.length} dipilih
                    </Badge>
                    <Button 
                      onClick={convert} 
                      disabled={selectedSolutions.length === 0 || converter.isPending} 
                      data-testid="button-convert-action-plan"
                      className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm"
                    >
                      {converter.isPending ? 'Menyusun...' : 'Ubah ke Action Plan'} 
                      <MoveRight size={16} className="ml-2" />
                    </Button>
                  </div>
                </div>
                
                {converter.isError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive font-medium flex items-center gap-2" role="alert">
                    <TriangleAlert size={16} />
                    Action plan tidak dapat dibuat. Pilih solusi lalu coba lagi.
                  </div>
                )}

                <div className="grid gap-3">
                  {analysis.recommended_solutions.map((solution) => {
                    const selected = selectedSolutionIds.includes(solution.id);
                    return (
                      <label 
                        className={`group flex cursor-pointer gap-5 rounded-xl border p-5 transition-all duration-200 ${
                          selected 
                            ? 'border-accent/50 bg-accent/[.04] shadow-sm ring-1 ring-accent/20' 
                            : 'border-border bg-card hover:border-accent/40 hover:bg-accent/[.02]'
                        }`} 
                        key={solution.id} 
                        data-testid={`solution-${solution.id}`}
                      >
                        <div className="pt-1">
                          <div className={`grid h-5 w-5 place-items-center rounded-md border ${
                            selected 
                              ? 'border-accent bg-accent text-accent-foreground' 
                              : 'border-muted-foreground/30 bg-background group-hover:border-accent/50'
                            } transition-colors`}
                          >
                            {selected && <Check size={14} strokeWidth={3} />}
                          </div>
                          <input 
                            type="checkbox" 
                            checked={selected} 
                            onChange={() => toggleSolution(solution.id)} 
                            className="sr-only" 
                          />
                        </div>
                        
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-3 mb-1.5">
                            <h4 className={`font-bold text-base transition-colors ${selected ? 'text-foreground' : 'text-foreground/90'}`}>
                              {solution.title}
                            </h4>
                            <Badge 
                              variant="outline" 
                              className={`font-mono text-[9px] uppercase tracking-widest ${
                                solution.effort === 'High' ? 'border-rose-500/30 text-rose-500' :
                                solution.effort === 'Med' ? 'border-amber-500/30 text-amber-500' :
                                'border-emerald-500/30 text-emerald-500'
                              }`}
                            >
                              Effort {solution.effort}
                            </Badge>
                          </div>
                          <p className="text-sm leading-relaxed text-muted-foreground max-w-4xl">
                            {solution.description}
                          </p>
                          
                          <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-background/50 px-3 py-1.5 text-xs border border-border/50">
                            <span className="font-mono uppercase tracking-widest text-accent font-semibold text-[9px]">Dampak</span>
                            <span className="w-px h-3 bg-border/80" />
                            <span className="font-medium text-foreground/80">{solution.expectedImpact}</span>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Action Plan */}
          {actionPlan.length > 0 && (
            <div className="animate-rise-3 rounded-xl border-2 border-emerald-500/30 bg-card overflow-hidden shadow-lg" data-testid="action-plan-output">
              <div className="border-b border-border bg-emerald-500/[.03] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-emerald-500/10 p-1.5 text-emerald-500"><Clipboard size={18} /></div>
                  <div>
                    <h3 className="font-bold text-sm">Action Plan Siap</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Rencana disalin atau diunduh dalam format kerja.</p>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={copyPlan} 
                    data-testid="button-copy-action-plan"
                    className={`transition-colors ${copied ? 'border-emerald-500 text-emerald-500 bg-emerald-500/10' : ''}`}
                  >
                    {copied ? <CheckCircle2 size={14} className="mr-1.5" /> : <Clipboard size={14} className="mr-1.5" />} 
                    {copied ? 'Tersalin' : 'Salin Markdown'}
                  </Button>
                  <div className="h-4 w-px bg-border mx-1" />
                  <Button variant="ghost" size="sm" className="text-xs hover:bg-muted/50" onClick={() => downloadFile('pst-action-plan.md', markdown, 'text/markdown;charset=utf-8')} data-testid="button-download-markdown">
                    .md
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs hover:bg-muted/50" onClick={() => downloadFile('pst-action-plan.csv', actionPlanCsv(actionPlan), 'text/csv;charset=utf-8')} data-testid="button-download-csv">
                    .csv
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs hover:bg-muted/50" onClick={() => downloadFile('pst-action-plan.json', JSON.stringify({ action_plan: actionPlan }, null, 2), 'application/json;charset=utf-8')} data-testid="button-download-json">
                    .json
                  </Button>
                </div>
              </div>
              
              <div className="p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  {actionPlan.map((item, index) => (
                    <article 
                      className="group relative rounded-xl border border-border bg-background p-5 hover:border-emerald-500/30 hover:shadow-sm transition-all flex flex-col" 
                      key={`${item.task_title}-${index}`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <span className="font-mono text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">
                          STEP {String(index + 1).padStart(2, '0')}
                        </span>
                        <Badge variant="outline" className={`${priorityTone(item.priority)} font-mono text-[9px] uppercase tracking-widest px-2 py-0.5`}>
                          {item.priority} Prio
                        </Badge>
                      </div>
                      
                      <h4 className="font-bold text-sm leading-tight mb-2 group-hover:text-emerald-400 transition-colors">{item.task_title}</h4>
                      <p className="text-xs leading-relaxed text-muted-foreground mb-5 flex-1">{item.description}</p>
                      
                      <div className="grid gap-px bg-border/50 rounded-lg overflow-hidden mt-auto">
                        <div className="bg-muted/30 px-3 py-2 flex items-center gap-3">
                          <span className="w-20 shrink-0 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Timeline</span>
                          <span className="text-xs font-semibold">{item.suggested_timeline}</span>
                        </div>
                        <div className="bg-muted/30 px-3 py-2 flex items-start gap-3">
                          <span className="w-20 shrink-0 font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">Success</span>
                          <span className="text-xs leading-tight font-medium text-foreground/80">{item.success_metric}</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
