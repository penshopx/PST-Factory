import { useEffect, useMemo, useState } from 'react';
import {
  useAnalyzePstFramework,
  useApprovePstProductBrief,
  useConvertPstActionPlan,
  useGetPstProductBrief,
  useUpsertPstProductBrief,
  type ActionPlanItem,
  type FrameworkAnalysis,
  type PstBlueprint,
  type PstProject,
} from '@workspace/api-client-react';
import {
  Bot, Check, CheckCircle2, Clipboard, Download, GitBranch, Sparkles, Target, TriangleAlert, MoveRight, Layers, LayoutGrid, FileText, ShieldCheck, PackageOpen, CircleDollarSign, Users, BookOpen, MessageCircle, GraduationCap, FileCog, AppWindow
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

const productFormatGuides = [
  {
    name: 'Ebook',
    icon: BookOpen,
    guidance: 'Jadikan cabang analisis sebagai bab, pertanyaan sebagai refleksi, dan rekomendasi sebagai latihan serta rencana tindakan pembaca.',
  },
  {
    name: 'Chatbot',
    icon: MessageCircle,
    guidance: 'Jadikan pertanyaan analisis sebagai alur percakapan, simpan jawaban sebagai konteks, lalu berikan diagnosis dan rekomendasi personal.',
  },
  {
    name: 'E-course',
    icon: GraduationCap,
    guidance: 'Jadikan cabang analisis sebagai modul, tambahkan tujuan belajar dan latihan, lalu gunakan rekomendasi sebagai proyek akhir atau action plan.',
  },
  {
    name: 'Document Generator',
    icon: FileCog,
    guidance: 'Ubah pertanyaan menjadi form intake dan petakan jawabannya ke template laporan, proposal, SOP, atau rencana tindakan yang dapat diunduh.',
  },
  {
    name: 'Mini App',
    icon: AppWindow,
    guidance: 'Bangun layar intake, analisis, hasil, dan riwayat. Gunakan framework sebagai logika inti dan deliverable sebagai keluaran utama aplikasi.',
  },
];

function executiveSummaryData(project: PstProject, analysis: FrameworkAnalysis, blueprint?: PstBlueprint) {
  return {
    title: `Executive Summary Produk Digital — ${project.name}`,
    product_context: {
      problem: analysis.problem_statement,
      target_user: project.targetUser,
      desired_outcome: project.desiredOutcome,
      selected_framework: analysis.selected_framework,
    },
    key_insights: analysis.framework_breakdown.map((item) => ({
      area: item.label,
      question: item.question,
      focus: item.focus,
      signals_to_explore: item.children,
    })),
    recommended_solutions: analysis.recommended_solutions,
    digital_product_opportunities: analysis.digital_product_recommendations,
    source_blueprint: blueprint ? {
      journey: blueprint.journey,
      expected_output: blueprint.expectedOutput,
      knowledge_requirements: blueprint.knowledgeRequirements,
    } : undefined,
    format_adaptation_guide: productFormatGuides.map(({ name, guidance }) => ({ format: name, guidance })),
    recommended_next_steps: [
      'Pilih satu produk berdasarkan urgensi masalah, kemampuan membayar target buyer, dan kemudahan menghasilkan deliverable.',
      'Validasi janji hasil kepada calon customer sebelum membangun produk lengkap.',
      'Buat versi minimum yang menghasilkan satu hasil utama dengan baik.',
      'Uji journey bersama pengguna nyata dan perbaiki pertanyaan, logika, serta hasil akhir.',
      'Tambahkan halaman penjualan, akses customer, pembayaran, dan mekanisme pengiriman hasil.',
    ],
  };
}

function executiveSummaryMarkdown(project: PstProject, analysis: FrameworkAnalysis, blueprint?: PstBlueprint) {
  const data = executiveSummaryData(project, analysis, blueprint);
  const lines = [
    `# ${data.title}`,
    '',
    '## Ringkasan Eksekutif',
    `**Masalah:** ${data.product_context.problem}`,
    '',
    `**Target pengguna:** ${data.product_context.target_user}`,
    '',
    `**Hasil yang diinginkan:** ${data.product_context.desired_outcome}`,
    '',
    `**Framework terpilih:** ${data.product_context.selected_framework.name}`,
    '',
    data.product_context.selected_framework.reason,
    '',
    '## Insight Utama',
    ...data.key_insights.flatMap((insight, index) => [
      `### ${index + 1}. ${insight.area}`,
      insight.question,
      '',
      `**Fokus:** ${insight.focus}`,
      '',
      ...insight.signals_to_explore.map((signal) => `- ${signal}`),
      '',
    ]),
    '## Rekomendasi Produk Digital',
    ...data.digital_product_opportunities.flatMap((product, index) => [
      `### ${index + 1}. ${product.title}`,
      `- **Jenis:** ${product.product_type}`,
      `- **Model pendapatan:** ${product.revenue_model}`,
      `- **Target pembeli:** ${product.target_buyer}`,
      `- **Janji hasil:** ${product.product_promise}`,
      `- **Mengapa cocok:** ${product.why_it_fits}`,
      `- **Validasi pertama:** ${product.validation_step}`,
      '- **Deliverable:**',
      ...product.deliverables.map((deliverable) => `  - ${deliverable}`),
      '',
    ]),
    '## Panduan Adaptasi Format',
    ...data.format_adaptation_guide.flatMap((format) => [
      `### ${format.format}`,
      format.guidance,
      '',
    ]),
    '## Langkah Berikutnya',
    ...data.recommended_next_steps.map((step, index) => `${index + 1}. ${step}`),
    '',
  ];
  return lines.join('\n');
}

export default function FrameworkAnalyzer({ project, blueprint }: { project: PstProject; blueprint?: PstBlueprint }) {
  const [problemStatement, setProblemStatement] = useState(project.problemStatement);
  const [additionalContext, setAdditionalContext] = useState('');
  const [analysis, setAnalysis] = useState<FrameworkAnalysis | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedSolutionIds, setSelectedSolutionIds] = useState<string[]>([]);
  const [actionPlan, setActionPlan] = useState<ActionPlanItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const analyzer = useAnalyzePstFramework();
  const converter = useConvertPstActionPlan();
  const briefQuery = useGetPstProductBrief(project.id);
  const saveBrief = useUpsertPstProductBrief({
    mutation: { onSuccess: () => void briefQuery.refetch() },
  });
  const approveBrief = useApprovePstProductBrief({
    mutation: { onSuccess: () => void briefQuery.refetch() },
  });

  useEffect(() => {
    setProblemStatement(project.problemStatement);
    setAnalysis(null);
    setSelectedProductId(null);
    setSelectedSolutionIds([]);
    setActionPlan([]);
  }, [project.id, project.problemStatement]);

  useEffect(() => {
    if (!briefQuery.data) return;
    setAnalysis(briefQuery.data.frameworkAnalysis);
    setSelectedProductId(briefQuery.data.selectedProductId ?? null);
    setSelectedSolutionIds(briefQuery.data.selectedSolutionIds);
    setActionPlan(briefQuery.data.actionPlan);
  }, [briefQuery.data]);

  const selectedSolutions = useMemo(
    () => analysis?.recommended_solutions.filter((solution) => selectedSolutionIds.includes(solution.id)) ?? [],
    [analysis, selectedSolutionIds],
  );
  const validProblem = problemStatement.trim().length >= 10;
  const markdown = actionPlanMarkdown(actionPlan);
  const summaryMarkdown = analysis ? executiveSummaryMarkdown(project, analysis, blueprint) : '';
  const briefIsStale = Boolean(
    briefQuery.data && blueprint
    && new Date(briefQuery.data.blueprintUpdatedAt).getTime() !== new Date(blueprint.updatedAt).getTime(),
  );

  const runAnalysis = () => {
    const normalizedTargetUser = project.targetUser?.trim().slice(0, 500);
    analyzer.mutate({
      data: {
        problemStatement: problemStatement.trim(),
        ...(normalizedTargetUser ? { targetUser: normalizedTargetUser } : {}),
        additionalContext: additionalContext.trim() || undefined,
      },
    }, {
      onSuccess: (result) => {
        const solutionIds = result.recommended_solutions.map((solution) => solution.id);
        setAnalysis(result);
        setSelectedProductId(null);
        setSelectedSolutionIds(solutionIds);
        setActionPlan([]);
        saveBrief.mutate({
          projectId: project.id,
          data: { frameworkAnalysis: result, selectedProductId: null, selectedSolutionIds: solutionIds, actionPlan: [] },
        });
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
      onSuccess: (result) => {
        setActionPlan(result.action_plan);
        saveBrief.mutate({
          projectId: project.id,
          data: {
            frameworkAnalysis: analysis,
            selectedProductId,
            selectedSolutionIds,
            actionPlan: result.action_plan,
          },
        });
      },
    });
  };

  const toggleSolution = (id: string) => {
    const nextIds = selectedSolutionIds.includes(id)
      ? selectedSolutionIds.filter((item) => item !== id)
      : [...selectedSolutionIds, id];
    setSelectedSolutionIds(nextIds);
    setActionPlan([]);
    if (analysis) {
      saveBrief.mutate({
        projectId: project.id,
        data: { frameworkAnalysis: analysis, selectedProductId, selectedSolutionIds: nextIds, actionPlan: [] },
      });
    }
  };

  const selectProduct = (id: string) => {
    if (!analysis) return;
    const nextId = selectedProductId === id ? null : id;
    setSelectedProductId(nextId);
    saveBrief.mutate({
      projectId: project.id,
      data: {
        frameworkAnalysis: analysis,
        selectedProductId: nextId,
        selectedSolutionIds,
        actionPlan,
      },
    });
  };

  const copyPlan = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const copySummary = async () => {
    if (!summaryMarkdown) return;
    await navigator.clipboard.writeText(summaryMarkdown);
    setSummaryCopied(true);
    window.setTimeout(() => setSummaryCopied(false), 1800);
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
                      {(analyzer.error as { data?: { error?: string } })?.data?.error?.includes('targetUser')
                        ? 'Deskripsi target pengguna pada proyek terlalu panjang. Sistem sudah menyingkatnya otomatis; silakan jalankan analisis kembali.'
                        : (analyzer.error as { data?: { error?: string } })?.data?.error
                          ?? 'Analisis AI belum tersedia. Periksa konteks lalu coba lagi.'}
                    </span>
                  </div>
                )}
                {saveBrief.isPending && <p className="mt-3 text-center text-[11px] text-muted-foreground">Menyimpan Product Brief...</p>}
                {saveBrief.isSuccess && <p className="mt-3 text-center text-[11px] text-emerald-600 dark:text-emerald-400">Product Brief tersimpan di proyek.</p>}
                {saveBrief.isError && <p className="mt-3 text-center text-[11px] text-destructive">Product Brief belum tersimpan. Coba jalankan analisis kembali.</p>}
                {briefIsStale && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                    <TriangleAlert className="mt-0.5 shrink-0" size={14} />
                    Blueprint berubah setelah Product Brief ini dibuat. Jalankan analisis kembali sebelum memakai hasilnya.
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

              <section className="space-y-4" data-testid="digital-product-recommendations">
                <div className="px-1">
                  <div className="mb-1 flex items-center gap-2">
                    <PackageOpen size={18} className="text-cyan-400" />
                    <h3 className="text-lg font-bold">Peluang Produk Digital</h3>
                  </div>
                  <p className="max-w-3xl text-sm text-muted-foreground">
                    Bentuk produk yang dapat dijual dari keahlian dan journey ini—lengkap dengan hasil yang dibeli customer.
                  </p>
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  {analysis.digital_product_recommendations.map((product, index) => {
                    const selected = selectedProductId === product.id;
                    return (
                    <article
                      className={`flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                        selected ? 'border-cyan-300 ring-2 ring-cyan-400/25' : 'border-cyan-400/20 hover:border-cyan-400/45'
                      }`}
                      key={product.id}
                      data-testid={`digital-product-${product.id}`}
                    >
                      <div className="border-b border-cyan-400/15 bg-cyan-400/[.04] p-5">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan-400">
                            Produk {String(index + 1).padStart(2, '0')}
                          </span>
                          <Badge variant="outline" className="border-cyan-400/30 bg-cyan-400/10 text-[9px] uppercase tracking-wider text-cyan-300">
                            {product.revenue_model}
                          </Badge>
                        </div>
                        <h4 className="text-base font-extrabold leading-tight">{product.title}</h4>
                        <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          {product.product_type}
                        </p>
                      </div>

                      <div className="flex flex-1 flex-col gap-5 p-5">
                        <div>
                          <p className="mb-1.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-cyan-400">Janji hasil</p>
                          <p className="text-sm font-medium leading-relaxed">{product.product_promise}</p>
                        </div>

                        <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/25 p-3">
                          <Users size={15} className="mt-0.5 shrink-0 text-cyan-400" />
                          <div>
                            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Pembeli utama</p>
                            <p className="mt-1 text-xs leading-relaxed">{product.target_buyer}</p>
                          </div>
                        </div>

                        <div>
                          <p className="mb-2 font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Yang diterima customer</p>
                          <div className="space-y-2">
                            {product.deliverables.map((deliverable) => (
                              <div className="flex items-start gap-2 text-xs text-foreground/85" key={deliverable}>
                                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-400" />
                                <span className="leading-relaxed">{deliverable}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="mt-auto space-y-3 border-t border-border/70 pt-4">
                          <div>
                            <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-cyan-400">Mengapa cocok</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{product.why_it_fits}</p>
                          </div>
                          <div className="rounded-lg bg-cyan-400/[.06] p-3">
                            <div className="mb-1 flex items-center gap-1.5">
                              <CircleDollarSign size={13} className="text-cyan-400" />
                              <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-cyan-400">Validasi sebelum membangun</p>
                            </div>
                            <p className="text-xs leading-relaxed">{product.validation_step}</p>
                          </div>
                          <Button
                            variant={selected ? 'default' : 'outline'}
                            onClick={() => selectProduct(product.id)}
                            className="w-full"
                            data-testid={`button-select-product-${product.id}`}
                          >
                            {selected ? <CheckCircle2 size={14} className="mr-2" /> : null}
                            {selected ? 'Produk utama dipilih' : 'Pilih sebagai produk utama'}
                          </Button>
                        </div>
                      </div>
                    </article>
                    );
                  })}
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border-2 border-cyan-400/25 bg-card shadow-lg" data-testid="executive-summary-export">
                <div className="flex flex-col gap-4 border-b border-cyan-400/15 bg-cyan-400/[.04] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-cyan-400/10 p-2 text-cyan-400">
                      <FileText size={19} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold">Executive Summary Siap Ekspor</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">Material awal untuk merancang produk digital dalam berbagai format.</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {briefQuery.data?.status && (
                      <Badge
                        variant="outline"
                        className={briefQuery.data.status === 'APPROVED'
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                          : 'border-amber-500/40 bg-amber-500/10 text-amber-500'}
                      >
                        {briefQuery.data.status === 'APPROVED' ? 'Brief disetujui' : 'Brief draft'}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      onClick={() => approveBrief.mutate({ projectId: project.id })}
                      disabled={!selectedProductId || actionPlan.length === 0 || briefIsStale || approveBrief.isPending || saveBrief.isPending}
                      data-testid="button-approve-product-brief"
                    >
                      <ShieldCheck size={14} className="mr-1.5" />
                      {approveBrief.isPending ? 'Menyetujui...' : 'Setujui Brief'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copySummary}
                      className={summaryCopied ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500' : ''}
                      data-testid="button-copy-executive-summary"
                    >
                      {summaryCopied ? <CheckCircle2 size={14} className="mr-1.5" /> : <Clipboard size={14} className="mr-1.5" />}
                      {summaryCopied ? 'Tersalin' : 'Salin'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadFile('pst-executive-summary.md', summaryMarkdown, 'text/markdown;charset=utf-8')}
                      data-testid="button-download-executive-summary-md"
                    >
                      <Download size={14} className="mr-1.5" /> Markdown
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadFile('pst-executive-summary.txt', summaryMarkdown, 'text/plain;charset=utf-8')}
                      data-testid="button-download-executive-summary-txt"
                    >
                      TXT
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadFile(
                        'pst-executive-summary.json',
                        JSON.stringify(executiveSummaryData(project, analysis, blueprint), null, 2),
                        'application/json;charset=utf-8',
                      )}
                      data-testid="button-download-executive-summary-json"
                    >
                      JSON
                    </Button>
                  </div>
                </div>
                {approveBrief.isError && (
                  <div className="border-b border-destructive/20 bg-destructive/10 px-6 py-3 text-xs text-destructive">
                    {(approveBrief.error as { data?: { error?: string } })?.data?.error ?? 'Product Brief belum dapat disetujui.'}
                  </div>
                )}

                <div className="grid gap-6 p-6 lg:grid-cols-[1.1fr_.9fr]">
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-cyan-400">Isi rangkuman</p>
                    <h4 className="mt-2 text-xl font-extrabold">Dari insight menjadi bahan produksi</h4>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      Dokumen mencakup ringkasan masalah, target pengguna, hasil yang dijanjikan, insight utama,
                      rekomendasi solusi, tiga peluang produk, deliverable, model pendapatan, dan langkah validasi.
                    </p>
                    <div className="mt-5 rounded-lg border border-border/60 bg-muted/25 p-4">
                      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Rekomendasi utama tersedia</p>
                      <div className="mt-3 space-y-2">
                        {analysis.digital_product_recommendations.map((product) => (
                          <div className="flex items-center gap-2 text-sm" key={product.id}>
                            <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
                            <span className="font-medium">{product.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-cyan-400">Panduan konversi format</p>
                    <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                      {productFormatGuides.map(({ name, icon: Icon, guidance }) => (
                        <div className="rounded-lg border border-border/70 bg-background/50 p-3" key={name}>
                          <div className="flex items-center gap-2">
                            <Icon size={14} className="text-cyan-400" />
                            <p className="text-xs font-bold">{name}</p>
                          </div>
                          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{guidance}</p>
                        </div>
                      ))}
                      <div className="rounded-lg border border-dashed border-cyan-400/25 bg-cyan-400/[.03] p-3">
                        <div className="flex items-center gap-2">
                          <Sparkles size={14} className="text-cyan-400" />
                          <p className="text-xs font-bold">Produk lainnya</p>
                        </div>
                        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                          Gunakan problem, buyer, janji hasil, dan deliverable sebagai brief untuk format digital lain.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
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
