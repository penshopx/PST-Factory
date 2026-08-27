import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity, Archive, ArrowLeft, ArrowRight, Bot, Box, Check, CheckCircle2,
  ChevronRight, CircleDot, ClipboardCheck, Copy, Database, ExternalLink,
  FileCode2, FlaskConical, Gauge, Hammer, LayoutDashboard, Library, Menu,
  MoreHorizontal, Package, Pencil, Plus, Rocket, Search, Settings2, Sparkles,
  Target, TriangleAlert, UserRound, Workflow, X,
} from 'lucide-react';
import {
  getGetDashboardActivityQueryKey, getGetDashboardSummaryQueryKey,
  getGetPstBlueprintQueryKey, getGetPstProjectQueryKey, getGetPublicPstWorkspaceQueryKey,
  getListPstAssetsQueryKey, getListPstPatternsQueryKey, getListPstProjectsQueryKey,
  getListPstRecipesQueryKey, useApprovePstProject, useArchivePstProject,
  useBuildPstProject, useCreatePstProject, useDuplicatePstProject,
  useGetDashboardActivity, useGetDashboardSummary, useGetPstBlueprint,
  useGetPstProject, useGetPublicPstWorkspace, useListPstAssets, useListPstPatterns,
  useListPstProjects, useListPstRecipes, usePublishPstProject, useRunPstArchitect,
  useRunPstQa, useSimulatePstProject, useUpdatePstBlueprint, useUpdatePstProject,
} from '@workspace/api-client-react';
import type {
  BuildResult, FactoryEvent, PstAsset, PstBlueprint, PstPattern, PstProject,
  PstRecipe, QaRun, SimulationReport, WorkflowStep,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string) {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in environment.');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: 'top' as const,
    socialButtonsVariant: 'blockButton' as const,
  },
  variables: {
    colorPrimary: '#16d9f5',
    colorForeground: '#edf7ff',
    colorMutedForeground: '#91a9bd',
    colorDanger: '#ff7184',
    colorBackground: '#101a2a',
    colorInput: '#0b1421',
    colorInputForeground: '#edf7ff',
    colorNeutral: '#2a4054',
    fontFamily: 'Manrope, sans-serif',
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#101a2a] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#2a4054]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#edf7ff] font-extrabold',
    headerSubtitle: 'text-[#91a9bd]',
    socialButtonsBlockButtonText: 'text-[#edf7ff]',
    formFieldLabel: 'text-[#edf7ff]',
    footerActionLink: 'text-[#16d9f5]',
    footerActionText: 'text-[#91a9bd]',
    dividerText: 'text-[#91a9bd]',
    identityPreviewEditButton: 'text-[#16d9f5]',
    formFieldSuccessText: 'text-emerald-300',
    alertText: 'text-[#ffb4be]',
    logoBox: 'h-10',
    logoImage: 'h-10',
    socialButtonsBlockButton: 'border-[#2a4054] bg-[#162538] hover:bg-[#1d334b]',
    formButtonPrimary: 'bg-[#16d9f5] text-[#07111d] hover:bg-[#72edff]',
    formFieldInput: 'border-[#2a4054] bg-[#0b1421] text-[#edf7ff]',
    footerAction: 'border-[#2a4054]',
    dividerLine: 'bg-[#2a4054]',
    alert: 'border-[#ff7184]/40 bg-[#ff7184]/10',
    otpCodeFieldInput: 'border-[#2a4054] bg-[#0b1421] text-[#edf7ff]',
    formFieldRow: 'text-[#edf7ff]',
    main: 'bg-transparent',
  },
};

const nav = [
  { href: '/', label: 'Factory', icon: LayoutDashboard },
  { href: '/projects', label: 'PST projects', icon: Box },
  { href: '/libraries/assets', label: 'Asset library', icon: Package },
  { href: '/libraries/patterns', label: 'Pattern library', icon: Workflow },
  { href: '/libraries/recipes', label: 'Recipe library', icon: FlaskConical },
];

const stages = [
  { key: 'problem', label: 'Problem', icon: Target },
  { key: 'architect', label: 'Architect', icon: Sparkles },
  { key: 'blueprint', label: 'Blueprint', icon: FileCode2 },
  { key: 'build', label: 'Assembly', icon: Hammer },
  { key: 'qa', label: 'QA + publish', icon: ClipboardCheck },
];

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function Loading({ label = 'Loading factory data' }: { label?: string }) {
  return <div className="space-y-3" data-testid="loading-state">
    <div className="h-5 w-40 animate-pulse rounded bg-muted" />
    <div className="h-24 w-full animate-pulse rounded-xl bg-muted" />
    <p className="font-mono text-[11px] uppercase tracking-[.18em] text-muted-foreground">{label}</p>
  </div>;
}

function ErrorState({ onRetry, label = 'Could not load this workspace' }: { onRetry?: () => void; label?: string }) {
  return <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center" data-testid="error-state">
    <TriangleAlert className="mb-3 text-destructive" size={22} />
    <p className="font-semibold" data-testid="status-error">{label}</p>
    <p className="mt-1 text-sm text-muted-foreground">The factory could not reach its latest server state.</p>
    {onRetry && <Button variant="outline" size="sm" onClick={onRetry} className="mt-4" data-testid="button-retry">Retry</Button>}
  </div>;
}

function EmptyState({ icon: Icon = Box, title, detail, action }: { icon?: typeof Box; title: string; detail: string; action?: ReactNode }) {
  return <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 p-8 text-center" data-testid="empty-state">
    <div className="mb-4 rounded-full border border-accent/30 bg-accent/10 p-3 text-accent"><Icon size={20} /></div>
    <p className="font-semibold">{title}</p><p className="mt-1 max-w-sm text-sm text-muted-foreground">{detail}</p>{action}
  </div>;
}

function StatusBadge({ value }: { value?: string }) {
  const status = value ?? 'UNKNOWN';
  const tone = status.includes('PUBLISHED') || status.includes('APPROVED') || status === 'PASS' || status === 'READY'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
    : status.includes('WARNING') || status === 'QA' || status === 'PREVIEW'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
      : status === 'ERROR' || status === 'ARCHIVED'
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : 'border-primary/25 bg-primary/10 text-primary';
  return <Badge variant="outline" className={cn('font-mono text-[10px] tracking-[.12em]', tone)} data-testid={`status-${status.toLowerCase()}`}>{status.replaceAll('_', ' ')}</Badge>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobile, setMobile] = useState(false);
  const { user } = useUser();
  const { signOut } = useClerk();
  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Factory member';
  const initials = displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return <div className="min-h-[100dvh] bg-background text-foreground">
    <aside className={cn('fixed inset-y-0 left-0 z-30 flex w-[248px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform md:translate-x-0', mobile ? 'translate-x-0' : '-translate-x-full')} data-testid="sidebar">
      <div className="flex h-[72px] items-center gap-3 border-b border-sidebar-border px-6">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><span className="font-mono text-sm font-bold">P</span></div>
        <div><p className="text-sm font-extrabold tracking-tight text-sidebar-foreground">PST factory</p><p className="font-mono text-[9px] uppercase tracking-[.2em] text-sidebar-foreground/50">product studio</p></div>
      </div>
      <div className="px-4 pb-3 pt-7"><p className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[.2em] text-sidebar-foreground/40">Build surface</p>
        <nav className="space-y-1">{nav.map(({ href, label, icon: Icon }) => <Link href={href} key={href} onClick={() => setMobile(false)} className={cn('focus-ring flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors', location === href ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground')} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={16} strokeWidth={1.8} /><span>{label}</span>{location === href && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />}</Link>)}</nav>
      </div>
      <div className="mt-auto space-y-4 border-t border-sidebar-border p-4">
        <Link href="/create" onClick={() => setMobile(false)} className="focus-ring flex items-center justify-center gap-2 rounded-lg bg-sidebar-primary px-3 py-2.5 text-sm font-bold text-sidebar-primary-foreground transition-transform hover:translate-y-[-1px]" data-testid="link-create-pst"><Plus size={16} /> New PST</Link>
        <Link href="/settings" onClick={() => setMobile(false)} className="focus-ring flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/55 hover:text-sidebar-foreground" data-testid="link-settings"><Settings2 size={16} /> Factory settings</Link>
        <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/60 p-3"><div className="grid h-8 w-8 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">{initials}</div><div className="min-w-0"><p className="truncate text-xs font-semibold">{displayName}</p><p className="truncate font-mono text-[10px] text-sidebar-foreground/45">factory member</p></div><button type="button" className="ml-auto text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground" onClick={() => void signOut({ redirectUrl: basePath || '/' })} aria-label="Sign out" data-testid="button-sign-out"><MoreHorizontal size={15} /></button></div>
      </div>
    </aside>
    <div className="md:pl-[248px]">
      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-xl md:px-9">
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobile(!mobile)} data-testid="button-toggle-menu"><Menu size={19} /></Button><span className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Factory / <span className="text-foreground">{location === '/' ? 'overview' : location.split('/').filter(Boolean).join(' / ')}</span></span></div>
        <div className="flex items-center gap-2"><span className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[.14em] text-emerald-600 dark:text-emerald-300 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> All systems nominal</span><Button variant="outline" size="icon" data-testid="button-user-menu"><UserRound size={16} /></Button></div>
      </header>
      <main className="factory-grid min-h-[calc(100dvh-72px)] px-5 py-8 md:px-9 lg:px-12">{children}</main>
    </div>
  </div>;
}

function PageIntro({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: React.ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end animate-rise"><div><p className="mb-2 font-mono text-[10px] uppercase tracking-[.22em] text-primary">{eyebrow}</p><h1 className="text-3xl font-extrabold tracking-[-.04em] md:text-4xl" data-testid={`heading-${title.toLowerCase().replaceAll(' ', '-')}`}>{title}</h1>{detail && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{detail}</p>}</div>{action}</div>;
}

function Dashboard() {
  const summary = useGetDashboardSummary();
  const activity = useGetDashboardActivity({ query: { queryKey: getGetDashboardActivityQueryKey() } });
  if (summary.isLoading || activity.isLoading) return <Loading />;
  if (summary.isError || activity.isError) return <ErrorState onRetry={() => { void summary.refetch(); void activity.refetch(); }} />;
  const s = summary.data;
  const events = activity.data ?? [];
  return <div className="mx-auto max-w-[1440px]"><PageIntro eyebrow="PST factory / operating view" title="Make the problem shippable." detail="A focused production line for turning one sharp user problem into a reusable toolkit." action={<Link href="/create" className="focus-ring inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform hover:translate-y-[-1px]" data-testid="link-start-build"><Plus size={17} /> Start a PST</Link>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 animate-rise-2">
      <Metric label="Total projects" value={s?.totalProjects ?? 0} icon={Box} tone="blue" />
      <Metric label="Active builds" value={s?.activeProjects ?? 0} icon={Hammer} tone="cyan" />
      <Metric label="Published" value={s?.publishedProjects ?? 0} icon={Rocket} tone="amber" />
      <Metric label="Reusable assets" value={s?.assets ?? 0} icon={Database} tone="green" />
      <Metric label="Reuse rate" value={`${s?.reuseRate ?? 0}%`} icon={Gauge} tone="purple" />
    </div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr] animate-rise-3">
      <Card className="overflow-hidden"><CardHeader className="flex-row items-start justify-between border-b border-border/70 pb-4"><div><CardTitle className="text-base">Production pulse</CardTitle><CardDescription className="mt-1">Every project moves through the same observable line.</CardDescription></div><div className="rounded-lg bg-primary/10 p-2 text-primary"><Activity size={18} /></div></CardHeader><CardContent className="p-6"><div className="relative grid gap-6 md:grid-cols-5">{stages.map((stage, i) => <div key={stage.key} className="relative"><div className="flex items-center gap-3 md:block"><div className="relative z-10 grid h-10 w-10 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary"><stage.icon size={17} /></div><div className="mt-0 md:mt-3"><p className="text-sm font-semibold">{stage.label}</p><p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{i === 0 ? 'start here' : i === 4 ? 'ship with proof' : 'in progress'}</p></div></div>{i < 4 && <div className="absolute left-5 top-10 h-6 w-px bg-border md:left-10 md:top-5 md:h-px md:w-[calc(100%-20px)] md:translate-x-5" />}</div>)}</div></CardContent></Card>
      <Card><CardHeader className="border-b border-border/70 pb-4"><CardTitle className="text-base">Quality signal</CardTitle><CardDescription className="mt-1">Latest pass rate across shipped builds.</CardDescription></CardHeader><CardContent className="p-6"><div className="flex items-end gap-3"><span className="text-5xl font-extrabold tracking-[-.06em] text-accent">{s?.qaPassRate ?? 0}%</span><span className="mb-2 font-mono text-[10px] uppercase text-muted-foreground">QA pass rate</span></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(100, s?.qaPassRate ?? 0)}%` }} /></div><div className="mt-5 flex items-start gap-3 rounded-lg border border-border bg-muted/45 p-3"><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-500" size={16} /><p className="text-xs leading-relaxed text-muted-foreground">A good PST makes the next action obvious and its outcome measurable.</p></div></CardContent></Card>
    </div>
    <Card className="mt-6 animate-rise-3"><CardHeader className="flex-row items-center justify-between border-b border-border/70 pb-4"><div><CardTitle className="text-base">Recent activity</CardTitle><CardDescription className="mt-1">The factory log, newest first.</CardDescription></div><Link href="/projects" className="text-xs font-semibold text-primary hover:underline" data-testid="link-view-projects">View all projects <ArrowRight className="ml-1 inline" size={13} /></Link></CardHeader><CardContent className="p-0">{events.length === 0 ? <EmptyState icon={Activity} title="No factory events yet" detail="Your first architect run will show up here." /> : events.slice(0, 7).map((event) => <ActivityRow event={event} key={event.id} />)}</CardContent></Card>
  </div>;
}

function Metric({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: typeof Box; tone: string }) {
  return <div className="rounded-xl border border-border bg-card p-4 shadow-sm"><div className="flex items-start justify-between"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">{label}</p><Icon size={16} className={cn(tone === 'blue' && 'text-primary', tone === 'cyan' && 'text-accent', tone === 'amber' && 'text-amber-500', tone === 'green' && 'text-emerald-500', tone === 'purple' && 'text-violet-500')} /></div><p className="mt-3 text-2xl font-extrabold tracking-[-.04em]" data-testid={`text-metric-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</p></div>;
}

function ActivityRow({ event }: { event: FactoryEvent }) {
  return <div className="flex items-center gap-4 border-b border-border/60 px-6 py-4 last:border-0" data-testid={`row-activity-${event.id}`}><div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><CircleDot size={15} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm">{event.message}</p><p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{event.type} · {new Date(event.createdAt).toLocaleDateString()}</p></div>{event.projectId && <Link href={`/projects/${event.projectId}`} className="text-muted-foreground hover:text-primary" data-testid={`link-activity-project-${event.id}`}><ChevronRight size={16} /></Link>}</div>;
}

function Projects() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const params = useMemo(() => ({ ...(search ? { search } : {}), ...(status ? { status: status as never } : {}) }), [search, status]);
  const projects = useListPstProjects(params, { query: { queryKey: getListPstProjectsQueryKey(params) } });
  const duplicate = useDuplicatePstProject();
  const archive = useArchivePstProject();
  const qc = useQueryClient();
  const list = projects.data ?? [];
  const refresh = () => { void projects.refetch(); void qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); };
  return <div className="mx-auto max-w-[1440px]"><PageIntro eyebrow="Portfolio / all PSTs" title="Project line-up" detail="Search the work, see what is reusable, and pick up the next build." action={<Link href="/create" className="focus-ring inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground" data-testid="link-create-project"><Plus size={17} /> New project</Link>} />
    <div className="mb-5 flex flex-col gap-3 md:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 text-muted-foreground" size={17} /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects by name or problem..." className="pl-9 bg-card" data-testid="input-project-search" /></div><select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" data-testid="select-project-status"><option value="">All statuses</option>{['DRAFT', 'ARCHITECTED', 'BLUEPRINT_READY', 'BUILDING', 'QA', 'APPROVED', 'PUBLISHED', 'ARCHIVED'].map((item) => <option value={item} key={item}>{item.replaceAll('_', ' ')}</option>)}</select></div>
    {projects.isLoading ? <Loading label="Loading project line-up" /> : projects.isError ? <ErrorState onRetry={() => void projects.refetch()} /> : list.length === 0 ? <EmptyState icon={Box} title={search ? 'No matching projects' : 'The line is empty'} detail={search ? 'Try a wider search term.' : 'Start with one specific problem and the factory will shape the rest.'} action={!search && <Link href="/create" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary" data-testid="link-empty-create">Create your first PST <ArrowRight size={15} /></Link>} /> : <div className="grid gap-3">{list.map((project) => <ProjectRow project={project} key={project.id} onDuplicate={() => duplicate.mutate({ projectId: project.id }, { onSuccess: refresh })} onArchive={() => archive.mutate({ projectId: project.id }, { onSuccess: refresh })} />)}</div>}
  </div>;
}

function ProjectRow({ project, onDuplicate, onArchive }: { project: PstProject; onDuplicate: () => void; onArchive: () => void }) {
  return <div className="group flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md md:flex-row md:items-center" data-testid={`card-project-${project.id}`}><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 font-mono text-sm font-bold text-primary">{project.name.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Link href={`/projects/${project.id}`} className="truncate text-base font-bold hover:text-primary" data-testid={`link-project-${project.id}`}>{project.name}</Link><StatusBadge value={project.status} /></div><p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{project.description || project.problemStatement}</p><div className="mt-3 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"><span>{project.domain || 'general'}</span><span>·</span><span>v{project.version}</span><span>·</span><span>{project.components?.length ?? 0} components</span></div></div><div className="flex items-center gap-2 md:opacity-0 md:transition-opacity md:group-hover:opacity-100"><Button size="sm" variant="outline" onClick={onDuplicate} data-testid={`button-duplicate-${project.id}`}><Copy size={14} /> Reuse</Button>{project.status !== 'ARCHIVED' && <Button size="icon" variant="ghost" onClick={onArchive} aria-label="Archive project" data-testid={`button-archive-${project.id}`}><Archive size={15} /></Button>}<Link href={`/projects/${project.id}`} className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground hover:text-primary" data-testid={`link-open-project-${project.id}`}><ArrowRight size={15} /></Link></div></div>;
}

function Create() {
  const [, setLocation] = useLocation();
  const create = useCreatePstProject();
  const [form, setForm] = useState({ name: '', description: '', domain: '', family: '', series: '', problemStatement: '', targetUser: '', desiredOutcome: '' });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const valid = form.name.trim() && form.problemStatement.trim() && form.targetUser.trim() && form.desiredOutcome.trim();
  return <div className="mx-auto max-w-5xl"><PageIntro eyebrow="New production run" title="Define the problem first." detail="A PST starts with a precise tension, not a feature list. Give the Architect enough signal to shape a useful system." />
    <div className="mb-7 flex items-center overflow-x-auto border-b border-border">{['01 Problem', '02 User', '03 Outcome', '04 Architect + build'].map((step, i) => <div className={cn('flex items-center gap-2 border-b-2 px-4 py-3 font-mono text-[10px] uppercase tracking-wider', i === 0 ? 'border-accent text-accent' : 'border-transparent text-muted-foreground')} key={step}><span className="grid h-5 w-5 place-items-center rounded-full border border-current">{i + 1}</span>{step}</div>)}</div>
    <Card><CardHeader><CardTitle className="text-xl">The brief</CardTitle><CardDescription>These anchors become the source of truth for the blueprint.</CardDescription></CardHeader><CardContent className="grid gap-5 md:grid-cols-2"><Field label="PST name" value={form.name} onChange={(v) => update('name', v)} placeholder="e.g. The First Week Field Guide" test="input-create-name" /><Field label="Domain" value={form.domain} onChange={(v) => update('domain', v)} placeholder="e.g. onboarding, operations" test="input-create-domain" /><Field label="Family" value={form.family} onChange={(v) => update('family', v)} placeholder="Optional product family" test="input-create-family" /><Field label="Series" value={form.series} onChange={(v) => update('series', v)} placeholder="Optional series" test="input-create-series" /><Field label="Problem statement" value={form.problemStatement} onChange={(v) => update('problemStatement', v)} placeholder="What specific situation keeps happening?" multiline test="input-create-problem" /><Field label="Target user" value={form.targetUser} onChange={(v) => update('targetUser', v)} placeholder="Who is in that situation, specifically?" multiline test="input-create-user" /><Field label="Desired outcome" value={form.desiredOutcome} onChange={(v) => update('desiredOutcome', v)} placeholder="What will be measurably different after they use this?" multiline test="input-create-outcome" /><Field label="Short description" value={form.description} onChange={(v) => update('description', v)} placeholder="One line for the project index" multiline test="input-create-description" /><div className="flex items-center justify-between md:col-span-2"><p className="text-xs text-muted-foreground">{valid ? 'Ready to hand to the Architect.' : 'Complete the four required anchors to continue.'}</p><Button disabled={!valid || create.isPending} onClick={() => create.mutate({ data: form }, { onSuccess: (project) => setLocation(`/projects/${project.id}`) })} data-testid="button-create-pst">{create.isPending ? 'Creating...' : 'Create and open workspace'} <ArrowRight size={16} /></Button></div></CardContent></Card>
  </div>;
}

function Field({ label, value, onChange, placeholder, multiline, test }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; multiline?: boolean; test: string }) {
  return <label className="block"><span className="mb-2 block font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">{label}</span>{multiline ? <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-h-[88px] bg-background" data-testid={test} /> : <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-background" data-testid={test} />}</label>;
}

function ProjectWorkspace() {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const projectQuery = useGetPstProject(projectId, { query: { queryKey: getGetPstProjectQueryKey(projectId) } });
  const blueprintQuery = useGetPstBlueprint(projectId, { query: { queryKey: getGetPstBlueprintQueryKey(projectId) } });
  const patternsQuery = useListPstPatterns({ query: { queryKey: getListPstPatternsQueryKey() } });
  const recipesQuery = useListPstRecipes({ query: { queryKey: getListPstRecipesQueryKey() } });
  const project = projectQuery.data;
  const [tab, setTab] = useState('overview');
  const [architectContext, setArchitectContext] = useState('');
  const [selectedPatternId, setSelectedPatternId] = useState('');
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [build, setBuild] = useState<BuildResult | null>(null);
  const [simulation, setSimulation] = useState<SimulationReport | null>(null);
  const [qa, setQa] = useState<QaRun | null>(null);
  const architect = useRunPstArchitect();
  const updateProject = useUpdatePstProject();
  const updateBlueprint = useUpdatePstBlueprint();
  const buildMutation = useBuildPstProject();
  const simulate = useSimulatePstProject();
  const runQa = useRunPstQa();
  const approve = useApprovePstProject();
  const publish = usePublishPstProject();
  const qc = useQueryClient();
  const projectPatternId = project?.selectedPatterns?.[0]?.id ?? '';
  const projectRecipeId = project?.selectedRecipes?.[0]?.id ?? '';
  useEffect(() => {
    if (project) {
      setSelectedPatternId(projectPatternId);
      setSelectedRecipeId(projectRecipeId);
    }
  }, [project?.id, projectPatternId, projectRecipeId]);
  if (projectQuery.isLoading) return <Loading label="Loading PST workspace" />;
  if (projectQuery.isError || !project) return <ErrorState onRetry={() => void projectQuery.refetch()} label="Project workspace not found" />;
  const blueprint = blueprintQuery.data ?? project.blueprint;
  const invalidate = () => { void qc.invalidateQueries({ queryKey: getGetPstProjectQueryKey(projectId) }); void qc.invalidateQueries({ queryKey: getGetPstBlueprintQueryKey(projectId) }); };
  const run = (action: 'architect' | 'build' | 'simulate' | 'qa' | 'approve' | 'publish') => {
    const references = {
      patternId: selectedPatternId || null,
      recipeId: selectedRecipeId || null,
    };
    if (action === 'architect') architect.mutate({ projectId, data: { additionalContext: architectContext, ...references } }, { onSuccess: () => { invalidate(); setTab('architect'); } });
    if (action === 'build') buildMutation.mutate({ projectId, data: references }, { onSuccess: (result) => { setBuild(result); invalidate(); setTab('build'); } });
    if (action === 'simulate') simulate.mutate({ projectId, data: { mode: 'SYNTHETIC' } }, { onSuccess: (result) => setSimulation(result) });
    if (action === 'qa') runQa.mutate({ projectId }, { onSuccess: (result) => { setQa(result); invalidate(); setTab('qa'); } });
    if (action === 'approve') approve.mutate({ projectId }, { onSuccess: invalidate });
    if (action === 'publish') publish.mutate({ projectId }, { onSuccess: invalidate });
  };
  const tabs = [{ key: 'overview', label: 'Overview' }, { key: 'problem', label: 'Problem' }, { key: 'architect', label: 'Architect' }, { key: 'blueprint', label: 'Blueprint' }, { key: 'assets', label: 'Assets' }, { key: 'workflow', label: 'Workflow' }, { key: 'ai', label: 'AI' }, { key: 'build', label: 'Assembly' }, { key: 'preview', label: 'Preview' }, { key: 'qa', label: 'QA' }, { key: 'publish', label: 'Publish' }, { key: 'versions', label: 'Versions' }];
  return <div className="mx-auto max-w-[1440px]"><Link href="/projects" className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-primary" data-testid="link-back-projects"><ArrowLeft size={14} /> All projects</Link><div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="mb-2 flex items-center gap-2"><StatusBadge value={project.status} /><span className="font-mono text-[10px] text-muted-foreground">v{project.version} · {project.domain || 'general'}</span></div><h1 className="text-3xl font-extrabold tracking-[-.05em]" data-testid="heading-project-name">{project.name}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{project.description || project.problemStatement}</p></div><div className="flex flex-wrap gap-2"><Link href={`/workspace/${project.slug}`} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold hover:border-primary hover:text-primary" data-testid="link-customer-workspace"><ExternalLink size={14} /> Customer view</Link><Button variant="outline" size="sm" onClick={() => updateProject.mutate({ projectId, data: { description: project.description } }, { onSuccess: invalidate })} data-testid="button-save-project"><Check size={14} /> Sync brief</Button></div></div>
    <div className="mb-6 overflow-x-auto border-b border-border"><div className="flex min-w-max gap-1">{tabs.map((item) => <button onClick={() => setTab(item.key)} className={cn('border-b-2 px-3 py-3 text-xs font-semibold transition-colors', tab === item.key ? 'border-accent text-accent' : 'border-transparent text-muted-foreground hover:text-foreground')} key={item.key} data-testid={`tab-${item.key}`}>{item.label}</button>)}</div></div>
    {tab === 'overview' && <OverviewTab project={project} blueprint={blueprint} onArchitect={() => run('architect')} onBuild={() => run('build')} />}
    {tab === 'problem' && <ProblemTab project={project} onSave={(data) => updateProject.mutate({ projectId, data }, { onSuccess: invalidate })} />}
     {tab === 'architect' && <ArchitectTab project={project} context={architectContext} setContext={setArchitectContext} patterns={patternsQuery.data ?? []} recipes={recipesQuery.data ?? []} selectedPatternId={selectedPatternId} selectedRecipeId={selectedRecipeId} setSelectedPatternId={setSelectedPatternId} setSelectedRecipeId={setSelectedRecipeId} onRun={() => run('architect')} pending={architect.isPending} />}
    {tab === 'blueprint' && <BlueprintTab projectId={projectId} blueprint={blueprint} onSave={(data) => updateBlueprint.mutate({ projectId, data }, { onSuccess: invalidate })} />}
    {tab === 'assets' && <ProjectAssets project={project} />}
    {tab === 'workflow' && <WorkflowTab workflow={blueprint?.workflow ?? []} />}
    {tab === 'ai' && <AiTab blueprint={blueprint} />}
    {tab === 'preview' && <PreviewTab project={project} simulation={simulation} onSimulate={() => run('simulate')} pending={simulate.isPending} />}
    {tab === 'qa' && <QaTab project={project} qa={qa} onRun={() => run('qa')} pending={runQa.isPending} />}
    {tab === 'publish' && <PublishTab project={project} onApprove={() => run('approve')} onPublish={() => run('publish')} approvePending={approve.isPending} publishPending={publish.isPending} />}
    {tab === 'versions' && <VersionsTab project={project} />}
    {tab === 'build' && (build ? <BuildTab build={build} /> : <EmptyState icon={Hammer} title="Assembly has not run" detail="Use Assemble from Overview to resolve the blueprint into selected components." />)}
    {tab !== 'build' && buildMutation.isPending && <div className="fixed bottom-5 right-5 flex items-center gap-3 rounded-lg border border-accent/30 bg-card px-4 py-3 text-sm shadow-lg"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Assembling components...</div>}
  </div>;
}

function OverviewTab({ project, blueprint, onArchitect, onBuild }: { project: PstProject; blueprint?: PstBlueprint; onArchitect: () => void; onBuild: () => void }) {
  return <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]"><Card><CardHeader><CardTitle className="text-base">Outcome brief</CardTitle><CardDescription>What this PST is responsible for changing.</CardDescription></CardHeader><CardContent className="space-y-5"><InfoBlock label="The problem" text={project.problemStatement} accent="primary" /><InfoBlock label="Target user" text={project.targetUser} accent="accent" /><InfoBlock label="Desired outcome" text={project.desiredOutcome} accent="amber" /></CardContent></Card><div className="space-y-6"><Card><CardHeader><CardTitle className="text-base">Next move</CardTitle><CardDescription>The factory keeps momentum visible.</CardDescription></CardHeader><CardContent><div className="flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/5 p-4"><Sparkles className="mt-0.5 shrink-0 text-accent" size={18} /><div><p className="text-sm font-bold">{blueprint?.nextStep || 'Ask the Architect to propose a blueprint'}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Generate a structured product plan from this problem definition.</p></div></div><div className="mt-4 flex gap-2"><Button onClick={onArchitect} data-testid="button-overview-architect"><Sparkles size={15} /> Run Architect</Button><Button variant="outline" onClick={onBuild} data-testid="button-overview-build"><Hammer size={15} /> Assemble</Button></div></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Product DNA</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3">{[['Journey', project.productDna?.journey?.length ?? 0], ['Components', project.components?.length ?? 0], ['QA status', project.qaStatus], ['Publication', project.publicationStatus]].map(([label, value]) => <div className="rounded-lg bg-muted/50 p-3" key={String(label)}><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>)}</CardContent></Card></div></div>;
}

function InfoBlock({ label, text, accent }: { label: string; text: string; accent: string }) { return <div className="border-l-2 border-current pl-4" style={{ color: `hsl(var(--${accent}))` }}><p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">{label}</p><p className="mt-2 text-sm leading-relaxed text-foreground">{text || 'Not defined yet.'}</p></div>; }

function ProblemTab({ project, onSave }: { project: PstProject; onSave: (data: { problemStatement: string; targetUser: string; desiredOutcome: string }) => void }) {
  const [values, setValues] = useState({ problemStatement: project.problemStatement, targetUser: project.targetUser, desiredOutcome: project.desiredOutcome });
  return <Card className="max-w-3xl"><CardHeader><CardTitle>Problem definition</CardTitle><CardDescription>Keep the brief narrow enough to solve and specific enough to measure.</CardDescription></CardHeader><CardContent className="space-y-5"><Field label="Problem statement" value={values.problemStatement} onChange={(v) => setValues({ ...values, problemStatement: v })} placeholder="The recurring situation..." multiline test="input-project-problem" /><Field label="Target user" value={values.targetUser} onChange={(v) => setValues({ ...values, targetUser: v })} placeholder="The person in the situation..." multiline test="input-project-user" /><Field label="Desired outcome" value={values.desiredOutcome} onChange={(v) => setValues({ ...values, desiredOutcome: v })} placeholder="The measurable shift..." multiline test="input-project-outcome" /><Button onClick={() => onSave(values)} data-testid="button-save-problem"><Check size={15} /> Save problem definition</Button></CardContent></Card>;
}

function ArchitectTab({ project, context, setContext, patterns, recipes, selectedPatternId, selectedRecipeId, setSelectedPatternId, setSelectedRecipeId, onRun, pending }: { project: PstProject; context: string; setContext: (v: string) => void; patterns: PstPattern[]; recipes: PstRecipe[]; selectedPatternId: string; selectedRecipeId: string; setSelectedPatternId: (v: string) => void; setSelectedRecipeId: (v: string) => void; onRun: () => void; pending: boolean }) {
  return <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]"><Card><CardHeader><CardTitle className="text-base">Architect brief</CardTitle><CardDescription>Choose proven manufacturing intelligence before generating.</CardDescription></CardHeader><CardContent><div className="space-y-4"><InfoBlock label="Problem" text={project.problemStatement} accent="primary" /><InfoBlock label="User" text={project.targetUser} accent="accent" /><div className="grid gap-3 sm:grid-cols-2"><ReferenceSelect label="Pattern" value={selectedPatternId} onChange={setSelectedPatternId} options={patterns.map((pattern) => ({ id: pattern.id, name: pattern.name }))} emptyLabel="No pattern" test="select-architect-pattern" /><ReferenceSelect label="Recipe" value={selectedRecipeId} onChange={setSelectedRecipeId} options={recipes.map((recipe) => ({ id: recipe.id, name: recipe.name }))} emptyLabel="No recipe" test="select-architect-recipe" /></div><p className="text-xs leading-relaxed text-muted-foreground">Selections are saved as library references when you generate or assemble. Architect will use pattern steps for the workflow and recipe components for assembly requirements.</p><Field label="Additional context" value={context} onChange={setContext} placeholder="What should the Architect protect, avoid, or prioritize?" multiline test="input-architect-context" /><Button className="w-full" onClick={onRun} disabled={pending} data-testid="button-run-architect"><Sparkles size={16} /> {pending ? 'Architecting...' : 'Generate proposal'}</Button></div></CardContent></Card><Card className="factory-grid"><CardHeader><CardTitle className="text-base">What happens next</CardTitle><CardDescription>The Architect returns a blueprint, not a chat transcript.</CardDescription></CardHeader><CardContent className="space-y-3">{['Maps the selected pattern to distinct workflow steps', 'Uses the selected recipe as component requirements', 'Names knowledge and AI requirements around the brief', 'Leaves a clear next action for assembly'].map((line, i) => <div className="flex items-center gap-3 rounded-lg border border-border bg-card/75 p-3" key={line}><span className="font-mono text-xs text-accent">0{i + 1}</span><span className="text-sm">{line}</span><CheckCircle2 className="ml-auto text-emerald-500" size={15} /></div>)}</CardContent></Card></div>;
}

function ReferenceSelect({ label, value, onChange, options, emptyLabel, test }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ id: string; name: string }>; emptyLabel: string; test: string }) {
  return <label className="block"><span className="mb-2 block font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" data-testid={test}><option value="">{emptyLabel}</option>{options.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select></label>;
}

function BlueprintTab({ projectId, blueprint, onSave }: { projectId: string; blueprint?: PstBlueprint; onSave: (data: Partial<PstBlueprint>) => void }) {
  const [nextStep, setNextStep] = useState(blueprint?.nextStep ?? '');
  if (!blueprint) return <EmptyState icon={FileCode2} title="Blueprint not generated" detail="Run the Architect to create the first structured proposal." />;
  return <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Blueprint spine</CardTitle><CardDescription>v{blueprint.version} · updated {new Date(blueprint.updatedAt).toLocaleDateString()}</CardDescription></CardHeader><CardContent className="space-y-4"><InfoBlock label="Problem type" text={blueprint.problemType} accent="primary" /><InfoBlock label="Expected output" text={blueprint.expectedOutput?.join(' · ')} accent="accent" /><Field label="Next step" value={nextStep} onChange={setNextStep} placeholder="What should the user do next?" test="input-blueprint-next-step" /><Button onClick={() => onSave({ nextStep })} data-testid={`button-save-blueprint-${projectId}`}><Check size={15} /> Save blueprint</Button></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Requirements</CardTitle></CardHeader><CardContent className="space-y-5"><ListBlock label="Knowledge" items={blueprint.knowledgeRequirements} /><ListBlock label="Components" items={blueprint.componentRequirements} /><ListBlock label="Intelligence" items={blueprint.aiRequirements} /></CardContent></Card></div>;
}

function ListBlock({ label, items = [] }: { label: string; items?: string[] }) { return <div><p className="mb-2 font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">{label}</p>{items.length ? <div className="space-y-1.5">{items.map((item) => <div className="flex gap-2 rounded-md bg-muted/50 p-2 text-xs" key={item}><span className="text-accent">+</span>{item}</div>)}</div> : <p className="text-xs text-muted-foreground">No requirements defined.</p>}</div>; }

function ProjectAssets({ project }: { project: PstProject }) { return <Card><CardHeader><CardTitle className="text-base">Selected components</CardTitle><CardDescription>What the build will assemble for this PST.</CardDescription></CardHeader><CardContent>{project.components?.length ? <div className="grid gap-2 md:grid-cols-2">{project.components.map((component) => <div className="flex items-center gap-3 rounded-lg border border-border p-3" key={component.id}><div className="rounded-md bg-primary/10 p-2 text-primary"><Package size={15} /></div><div className="flex-1"><p className="text-sm font-semibold">{component.name}</p><p className="font-mono text-[10px] uppercase text-muted-foreground">{component.type} · {component.source}</p></div><StatusBadge value={component.status} /></div>)}</div> : <EmptyState icon={Package} title="No components selected" detail="The Architect or a recipe can populate this assembly." />}</CardContent></Card>; }
function WorkflowTab({ workflow }: { workflow: WorkflowStep[] }) { return <Card><CardHeader><CardTitle className="text-base">Guided workflow</CardTitle><CardDescription>Each step has explicit inputs, outputs, and a next move.</CardDescription></CardHeader><CardContent>{workflow.length ? <div className="space-y-3">{workflow.map((step, i) => <div className="flex gap-4 rounded-xl border border-border p-4" key={step.id}><div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-xs text-primary">{String(i + 1).padStart(2, '0')}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{step.title}</p><Badge variant="outline" className="font-mono text-[9px]">{step.type}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{step.description}</p><div className="mt-3 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"><span>in: {step.inputs?.join(', ') || 'none'}</span><span>out: {step.outputs?.join(', ') || 'none'}</span></div></div><ChevronRight size={16} className="mt-1 text-muted-foreground" /></div>)}</div> : <EmptyState icon={Workflow} title="Workflow is waiting" detail="Generate a blueprint to map the guided steps." />}</CardContent></Card>; }
function AiTab({ blueprint }: { blueprint?: PstBlueprint }) { return <Card className="max-w-3xl"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bot className="text-accent" size={18} /> Intelligence layer</CardTitle><CardDescription>AI belongs inside a workflow with a job to do.</CardDescription></CardHeader><CardContent><ListBlock label="AI requirements" items={blueprint?.aiRequirements} /><div className="mt-6 rounded-lg border border-accent/25 bg-accent/5 p-4"><p className="text-sm font-semibold">Guardrail</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Every suggestion should move the user toward the defined outcome. Keep the system legible, bounded, and easy to override.</p></div></CardContent></Card>; }

function BuildTab({ build }: { build: BuildResult }) { return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Hammer className="text-accent" size={19} /> Assembly report <StatusBadge value={build.status} /></CardTitle><CardDescription>Component selection after the latest build run.</CardDescription></CardHeader><CardContent className="grid gap-6 md:grid-cols-2"><ListBlock label="Ready" items={build.ready} /><ListBlock label="Missing" items={build.missing} /><ListBlock label="Warnings" items={build.warnings} /><ListBlock label="Errors" items={build.errors} /></CardContent></Card>; }
function PreviewTab({ project, simulation, onSimulate, pending }: { project: PstProject; simulation: SimulationReport | null; onSimulate: () => void; pending: boolean }) { return <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]"><Card className="min-h-[360px] overflow-hidden"><div className="flex items-center justify-between border-b border-border bg-muted/35 px-5 py-3"><div className="flex gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive/60" /><span className="h-2 w-2 rounded-full bg-amber-400/70" /><span className="h-2 w-2 rounded-full bg-emerald-500/70" /></div><span className="font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground">customer preview / {project.slug}</span><ExternalLink size={14} className="text-muted-foreground" /></div><div className="factory-grid flex min-h-[300px] items-center justify-center p-8 text-center"><div className="max-w-md"><div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><Target size={22} /></div><h2 className="text-2xl font-extrabold">{project.name}</h2><p className="mt-3 text-sm text-muted-foreground">{project.desiredOutcome}</p><Button className="mt-5" onClick={onSimulate} disabled={pending} data-testid="button-simulate-preview"><FlaskConical size={15} /> {pending ? 'Simulating...' : 'Run simulation'}</Button></div></div></Card><Card><CardHeader><CardTitle className="text-base">Simulation report</CardTitle><CardDescription>Test the path before a human sees it.</CardDescription></CardHeader><CardContent>{simulation ? <div><div className="flex items-center gap-3"><StatusBadge value={simulation.status} /><span className="font-mono text-[10px] text-muted-foreground">{new Date(simulation.createdAt).toLocaleString()}</span></div><div className="mt-4 space-y-2">{simulation.checks?.map((check) => <div className="flex gap-2 text-sm" key={check}><CheckCircle2 className="shrink-0 text-emerald-500" size={16} />{check}</div>)}</div></div> : <EmptyState icon={FlaskConical} title="No simulation yet" detail="Run a synthetic user path to surface rough edges." />}</CardContent></Card></div>; }
function QaTab({ project, qa, onRun, pending }: { project: PstProject; qa: QaRun | null; onRun: () => void; pending: boolean }) { return <Card><CardHeader className="flex-row items-start justify-between"><div><CardTitle className="text-base">Quality assurance</CardTitle><CardDescription>Check clarity, completeness, and outcome alignment.</CardDescription></div><Button onClick={onRun} disabled={pending} data-testid="button-run-qa"><ClipboardCheck size={15} /> {pending ? 'Running checks...' : 'Run QA'}</Button></CardHeader><CardContent>{qa ? <div className="space-y-2">{qa.results?.map((result) => <div className="flex items-start gap-3 rounded-lg border border-border p-3" key={`${result.category}-${result.label}`}><StatusBadge value={result.status} /><div><p className="text-sm font-semibold">{result.label}</p><p className="mt-1 text-xs text-muted-foreground">{result.detail}</p></div></div>)}</div> : <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-5"><div className="rounded-lg bg-muted p-2"><ClipboardCheck size={17} /></div><div><p className="text-sm font-semibold">QA has not run on v{project.version}</p><p className="mt-1 text-xs text-muted-foreground">The report becomes the handoff signal for approval.</p></div></div>}</CardContent></Card>; }
function PublishTab({ project, onApprove, onPublish, approvePending, publishPending }: { project: PstProject; onApprove: () => void; onPublish: () => void; approvePending: boolean; publishPending: boolean }) { const approved = project.status === 'APPROVED' || project.status === 'PUBLISHED'; return <div className="max-w-3xl"><Card><CardHeader><CardTitle className="text-base">Release gate</CardTitle><CardDescription>Publishing makes the guided workspace available to customers.</CardDescription></CardHeader><CardContent><div className="space-y-3">{[['QA result', project.qaStatus, project.qaStatus === 'PASS'], ['Approval', approved ? project.status : 'Awaiting approval', approved], ['Publication', project.publicationStatus, project.publicationStatus === 'PUBLISHED']].map(([label, value, good]) => <div className="flex items-center gap-3 rounded-lg border border-border p-4" key={String(label)}><div className={cn('grid h-8 w-8 place-items-center rounded-full', good ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground')}>{good ? <Check size={15} /> : <CircleDot size={15} />}</div><div className="flex-1"><p className="text-sm font-semibold">{label}</p><p className="font-mono text-[10px] uppercase text-muted-foreground">{String(value).replaceAll('_', ' ')}</p></div></div>)}</div><div className="mt-5 flex gap-2">{!approved && <Button variant="outline" onClick={onApprove} disabled={approvePending || project.qaStatus !== 'PASS'} data-testid="button-approve-pst"><CheckCircle2 size={15} /> {approvePending ? 'Approving...' : 'Approve build'}</Button>}<Button onClick={onPublish} disabled={publishPending || !approved || project.publicationStatus === 'PUBLISHED'} data-testid="button-publish-pst"><Rocket size={15} /> {publishPending ? 'Publishing...' : project.publicationStatus === 'PUBLISHED' ? 'Published' : 'Publish workspace'}</Button></div></CardContent></Card></div>; }
function VersionsTab({ project }: { project: PstProject }) { return <Card className="max-w-3xl"><CardHeader><CardTitle className="text-base">Version history</CardTitle><CardDescription>Stable handoff points for your product line.</CardDescription></CardHeader><CardContent><div className="flex items-center gap-4 rounded-lg border border-border p-4"><div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{project.version}</div><div className="flex-1"><p className="text-sm font-semibold">Current factory version</p><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">updated {new Date(project.updatedAt).toLocaleString()}</p></div><StatusBadge value={project.status} /></div></CardContent></Card>; }

function LibraryPage({ kind }: { kind: 'assets' | 'patterns' | 'recipes' }) {
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const assetParams = { ...(search ? { search } : {}) };
  const assets = useListPstAssets(assetParams, { query: { queryKey: getListPstAssetsQueryKey(assetParams) } });
  const patterns = useListPstPatterns({ query: { queryKey: getListPstPatternsQueryKey() } });
  const recipes = useListPstRecipes({ query: { queryKey: getListPstRecipesQueryKey() } });
  const title = kind === 'assets' ? 'Asset library' : kind === 'patterns' ? 'Pattern library' : 'Recipe library';
  const detail = kind === 'assets' ? 'Reusable building blocks that give a PST its working parts.' : kind === 'patterns' ? 'Proven sequences for recurring user problems.' : 'Curated component combinations for faster assembly.';
  const items = kind === 'assets' ? (assets.data ?? []) : kind === 'patterns' ? (patterns.data ?? []) : (recipes.data ?? []);
  const loading = kind === 'assets' ? assets.isLoading : kind === 'patterns' ? patterns.isLoading : recipes.isLoading;
  const error = kind === 'assets' ? assets.isError : kind === 'patterns' ? patterns.isError : recipes.isError;
  return <div className="mx-auto max-w-[1440px]"><PageIntro eyebrow="Reusable intelligence" title={title} detail={detail} /><div className="mb-5 flex gap-3"><div className="relative max-w-xl flex-1"><Search className="absolute left-3 top-2.5 text-muted-foreground" size={17} /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${kind}...`} className="bg-card pl-9" data-testid={`input-search-${kind}`} /></div><Button variant="outline" onClick={() => setNotice(`Add ${kind.slice(0, -1)} is available from the project assembly flow.`)} data-testid={`button-add-${kind}`}><Plus size={15} /> Add {kind.slice(0, -1)}</Button></div>{notice && <div className="mb-5 flex items-center gap-2 rounded-lg border border-accent/25 bg-accent/5 px-4 py-3 text-xs text-muted-foreground" data-testid={`status-library-${kind}`}><CircleDot size={14} className="text-accent" /> {notice}<button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setNotice('')} aria-label="Dismiss notice" data-testid={`button-dismiss-${kind}-notice`}><X size={14} /></button></div>}{loading ? <Loading label={`Loading ${kind}`} /> : error ? <ErrorState onRetry={() => { if (kind === 'assets') void assets.refetch(); if (kind === 'patterns') void patterns.refetch(); if (kind === 'recipes') void recipes.refetch(); }} /> : items.length === 0 ? <EmptyState icon={Library} title={`No ${kind} yet`} detail="Reusable intelligence will appear here as your factory compounds." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => kind === 'assets' ? <AssetCard item={item as PstAsset} key={item.id} /> : kind === 'patterns' ? <PatternCard item={item as PstPattern} key={item.id} /> : <RecipeCard item={item as PstRecipe} key={item.id} />)}</div>}</div>;
}
function AssetCard({ item }: { item: PstAsset }) { return <Card className="group transition-all hover:border-primary/40 hover:shadow-md" data-testid={`card-asset-${item.id}`}><CardHeader className="pb-3"><div className="flex justify-between gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><Package size={17} /></div><StatusBadge value={item.status} /></div><CardTitle className="pt-2 text-base">{item.name}</CardTitle><CardDescription>{item.description}</CardDescription></CardHeader><CardContent><div className="flex flex-wrap gap-1.5">{item.tags?.map((tag) => <Badge variant="outline" className="text-[10px]" key={tag}>{tag}</Badge>)}</div><div className="mt-4 flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground"><span>{item.type}</span><span>v{item.version}</span></div></CardContent></Card>; }
function PatternCard({ item }: { item: PstPattern }) { return <Card className="transition-all hover:border-accent/50 hover:shadow-md" data-testid={`card-pattern-${item.id}`}><CardHeader><div className="flex justify-between"><div className="rounded-lg bg-accent/10 p-2 text-accent"><Workflow size={17} /></div><span className="font-mono text-[10px] uppercase text-muted-foreground">{item.usageCount} uses</span></div><CardTitle className="pt-2 text-base">{item.name}</CardTitle><CardDescription>{item.description}</CardDescription></CardHeader><CardContent><div className="space-y-1.5">{item.steps?.slice(0, 4).map((step, i) => <div className="flex gap-2 text-xs text-muted-foreground" key={step}><span className="font-mono text-accent">{i + 1}</span>{step}</div>)}</div>{item.projects?.length ? <p className="mt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Used by {item.projects.map((project) => project.name).join(', ')}</p> : <p className="mt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Not used by a project yet</p>}</CardContent></Card>; }
function RecipeCard({ item }: { item: PstRecipe }) { return <Card className="transition-all hover:border-amber-500/50 hover:shadow-md" data-testid={`card-recipe-${item.id}`}><CardHeader><div className="flex justify-between"><div className="rounded-lg bg-amber-500/10 p-2 text-amber-500"><FlaskConical size={17} /></div><span className="font-mono text-[10px] uppercase text-muted-foreground">{item.usageCount} uses</span></div><CardTitle className="pt-2 text-base">{item.name}</CardTitle><CardDescription>{item.description}</CardDescription></CardHeader><CardContent><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{item.components?.length ?? 0} components</p><div className="mt-2 flex flex-wrap gap-1.5">{item.components?.slice(0, 4).map((component) => <Badge variant="outline" className="text-[10px]" key={component}>{component}</Badge>)}</div>{item.projects?.length ? <p className="mt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Used by {item.projects.map((project) => project.name).join(', ')}</p> : <p className="mt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Not used by a project yet</p>}</CardContent></Card>; }

function CustomerWorkspace() {
  const { slug = '' } = useParams<{ slug: string }>();
  const workspace = useGetPublicPstWorkspace(slug, { query: { queryKey: getGetPublicPstWorkspaceQueryKey(slug) } });
  const [active, setActive] = useState(0);
  if (workspace.isLoading) return <Loading label="Preparing guided workspace" />;
  if (workspace.isError || !workspace.data) return <ErrorState onRetry={() => void workspace.refetch()} label="This customer workspace is not available" />;
  const { project, steps } = workspace.data;
  const step = steps?.[active];
  return <div className="mx-auto min-h-[calc(100dvh-72px)] max-w-5xl py-3 md:py-8"><div className="mb-10 flex items-center justify-between"><Link href="/" className="flex items-center gap-3" data-testid="link-workspace-brand"><div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-foreground font-mono font-bold">P</div><span className="text-sm font-extrabold">PST factory</span></Link><span className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">guided workspace</span></div><div className="mb-8 flex items-center gap-2 overflow-x-auto pb-2">{(steps ?? []).map((item, i) => <button onClick={() => setActive(i)} className={cn('flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold', i === active ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground')} key={item.id} data-testid={`button-workspace-step-${i}`}><span className="font-mono">{String(i + 1).padStart(2, '0')}</span>{item.title}</button>)}</div><div className="grid gap-8 lg:grid-cols-[1fr_280px]"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-accent">Your outcome</p><h1 className="mt-3 max-w-2xl text-4xl font-extrabold tracking-[-.06em] md:text-5xl">{project.desiredOutcome}</h1><p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">{project.description || project.problemStatement}</p>{step ? <Card className="mt-10 border-accent/25 shadow-lg"><CardHeader><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-accent">Step {active + 1} of {steps.length}</div><CardTitle className="mt-2 text-2xl">{step.title}</CardTitle><CardDescription className="text-sm leading-relaxed">{step.description}</CardDescription></CardHeader><CardContent><div className="rounded-lg border border-dashed border-border bg-muted/30 p-6"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Workspace input</p><p className="mt-2 text-sm text-muted-foreground">Use the guidance above to complete this step. Your progress stays attached to this PST.</p></div><div className="mt-5 flex justify-between gap-3"><Button variant="outline" onClick={() => setActive(Math.max(0, active - 1))} disabled={active === 0} data-testid="button-workspace-back"><ArrowLeft size={15} /> Back</Button><Button onClick={() => setActive(Math.min(steps.length - 1, active + 1))} disabled={active === steps.length - 1} data-testid="button-workspace-next">{active === steps.length - 1 ? 'Complete' : 'Next step'} <ArrowRight size={15} /></Button></div></CardContent></Card> : <EmptyState title="No guided steps yet" detail="This PST is still being assembled." />}</div><aside className="space-y-4"><Card><CardHeader><CardTitle className="text-sm">Built for</CardTitle></CardHeader><CardContent><p className="text-sm font-semibold">{project.targetUser}</p><div className="mt-4 border-t border-border pt-4"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Product</p><p className="mt-1 text-sm">{project.name}</p></div></CardContent></Card><div className="rounded-xl border border-accent/25 bg-accent/5 p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-accent">Progress</p><p className="mt-2 text-2xl font-extrabold">{steps.length ? Math.round(((active + 1) / steps.length) * 100) : 0}%</p><div className="mt-3 h-1.5 rounded-full bg-accent/15"><div className="h-full rounded-full bg-accent" style={{ width: `${steps.length ? ((active + 1) / steps.length) * 100 : 0}%` }} /></div></div></aside></div></div>;
}

function Settings() {
  const [name, setName] = useState('PST factory');
  const [description, setDescription] = useState('A focused product studio for measurable problem-solving toolkits.');
  const [saved, setSaved] = useState(false);
  return <div className="mx-auto max-w-4xl"><PageIntro eyebrow="Factory / configuration" title="Settings" detail="Define how your product studio works and who can move a PST through the line." /><div className="grid gap-6 md:grid-cols-[180px_1fr]"><div className="space-y-1">{['Workspace', 'Roles', 'Defaults'].map((item, i) => <button className={cn('w-full rounded-lg px-3 py-2 text-left text-sm font-semibold', i === 0 ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')} onClick={() => setSaved(false)} key={item} data-testid={`button-settings-${item.toLowerCase()}`}>{item}</button>)}</div><div className="space-y-5"><Card><CardHeader><CardTitle className="text-base">Workspace identity</CardTitle><CardDescription>How the factory appears to your team.</CardDescription></CardHeader><CardContent className="space-y-5"><Field label="Factory name" value={name} onChange={setName} placeholder="" test="input-settings-name" /><Field label="Workspace description" value={description} onChange={setDescription} placeholder="" multiline test="input-settings-description" /><div className="flex items-center gap-3"><Button onClick={() => setSaved(true)} data-testid="button-save-settings"><Check size={15} /> Save settings</Button>{saved && <span className="text-xs text-emerald-600 dark:text-emerald-300" data-testid="status-settings-saved">Settings saved locally</span>}</div></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Role context</CardTitle><CardDescription>Current access posture for this workspace.</CardDescription></CardHeader><CardContent><div className="flex items-center gap-3 rounded-lg border border-border p-4"><div className="grid h-9 w-9 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">MC</div><div><p className="text-sm font-semibold">Mara Chen</p><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Product architect · can build, approve, publish</p></div></div></CardContent></Card></div></div></div>;
}

function AppRouter() {
  return <Shell><Switch><Route path="/" component={Dashboard} /><Route path="/projects" component={Projects} /><Route path="/create" component={Create} /><Route path="/projects/:projectId" component={ProjectWorkspace} /><Route path="/libraries/assets"><LibraryPage kind="assets" /></Route><Route path="/libraries/patterns"><LibraryPage kind="patterns" /></Route><Route path="/libraries/recipes"><LibraryPage kind="recipes" /></Route><Route path="/settings"><Settings /></Route><Route component={NotFound} /></Switch></Shell>;
}

function NotFound() { return <EmptyState icon={X} title="Route not found" detail="This part of the factory does not exist." action={<Link href="/" className="mt-5 text-sm font-bold text-primary" data-testid="link-not-found-home">Return to factory</Link>} />; }

function SignInPage() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-[#07111d] px-4 py-10"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}

function SignUpPage() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-[#07111d] px-4 py-10"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const previousUserId = useRef<string | null | undefined>(undefined);
  const qc = useQueryClient();

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        qc.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);
  return null;
}

function HomeRoute() {
  return <>
    <Show when="signed-in"><Redirect to="/factory" /></Show>
    <Show when="signed-out"><PublicHome /></Show>
  </>;
}

function PublicHome() {
  return <main className="min-h-[100dvh] overflow-hidden bg-[#07111d] text-[#edf7ff]">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(22,217,245,.16),transparent_32%),linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] bg-[size:auto,56px_56px,56px_56px]" />
    <div className="relative mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-6 py-6 sm:px-10">
      <header className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3" data-testid="link-public-logo">
          <img src={`${basePath}/logo.svg`} alt="PST Factory" className="h-10 w-auto" />
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/sign-in" className="rounded-lg px-4 py-2.5 text-sm font-semibold text-[#a9c1d3] transition-colors hover:text-[#edf7ff]" data-testid="link-sign-in">Sign in</Link>
          <Link href="/sign-up" className="rounded-lg border border-[#16d9f5]/50 bg-[#16d9f5] px-4 py-2.5 text-sm font-bold text-[#07111d] transition-colors hover:bg-[#72edff]" data-testid="link-sign-up">Create account</Link>
        </nav>
      </header>
      <section className="grid flex-1 items-center gap-12 py-20 lg:grid-cols-[1.05fr_.95fr]">
        <div>
          <p className="mb-6 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.22em] text-[#16d9f5]"><span className="h-1.5 w-1.5 rounded-full bg-[#16d9f5] shadow-[0_0_16px_#16d9f5]" /> Product studio for reusable clarity</p>
          <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.04] tracking-[-.045em] sm:text-7xl">Make the problem <span className="text-[#16d9f5]">shippable.</span></h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-[#a9c1d3]">PST Factory turns messy problems into structured, reusable Problem-Solving Toolkits — from first definition to approved customer workspace.</p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/sign-up" className="inline-flex items-center gap-2 rounded-lg bg-[#16d9f5] px-5 py-3.5 text-sm font-extrabold text-[#07111d] transition-transform hover:-translate-y-0.5 hover:bg-[#72edff]" data-testid="button-hero-sign-up">Start building <ArrowRight size={16} /></Link>
            <Link href="/sign-in" className="rounded-lg border border-[#2a4054] px-5 py-3.5 text-sm font-bold text-[#edf7ff] transition-colors hover:border-[#16d9f5]/60 hover:bg-[#102336]" data-testid="button-hero-sign-in">Open factory</Link>
          </div>
          <div className="mt-14 flex flex-wrap gap-x-8 gap-y-3 font-mono text-[10px] uppercase tracking-[.16em] text-[#6f8ca3]"><span>Problem → Blueprint</span><span>Blueprint → Assembly</span><span>QA → Publish</span></div>
        </div>
        <div className="relative">
          <div className="absolute -inset-8 rounded-full bg-[#16d9f5]/10 blur-3xl" />
          <div className="relative rounded-2xl border border-[#2a4054] bg-[#0d1b2b]/90 p-4 shadow-2xl shadow-[#02070c]/60 backdrop-blur">
            <div className="flex items-center justify-between border-b border-[#2a4054] px-2 pb-4"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#6f8ca3]">Production pulse</p><p className="mt-1 text-sm font-bold">Cashflow clarity toolkit</p></div><span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-emerald-300">Approved</span></div>
            <div className="space-y-3 p-2 pt-5">{['Problem definition', 'Architect blueprint', 'Reusable assembly', 'QA + human approval'].map((step, index) => <div key={step} className="flex items-center gap-3 rounded-lg border border-[#20364a] bg-[#102336] p-3"><div className={`grid h-7 w-7 place-items-center rounded-full font-mono text-xs ${index < 3 ? 'bg-[#16d9f5] text-[#07111d]' : 'border border-emerald-400/50 text-emerald-300'}`}>{index < 3 ? '✓' : '→'}</div><span className="text-sm font-semibold text-[#d8e8f2]">{step}</span><span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-[#6f8ca3]">{index < 3 ? 'done' : 'ready'}</span></div>)}</div>
            <div className="mt-3 rounded-lg border border-[#16d9f5]/20 bg-[#16d9f5]/5 p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-[#16d9f5]">Reusable intelligence</p><p className="mt-2 text-sm leading-6 text-[#a9c1d3]">Assets, patterns, and recipes compound across every new PST.</p></div>
          </div>
        </div>
      </section>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1b3042] py-5 font-mono text-[10px] uppercase tracking-[.16em] text-[#6f8ca3]"><span>PST Factory · product studio</span><span>Built for measurable progress</span></footer>
    </div>
  </main>;
}

function ProtectedApp() {
  return <>
    <Show when="signed-in"><WouterRouter base={`${basePath}/factory`}><AppRouter /></WouterRouter></Show>
    <Show when="signed-out"><Redirect to="/" /></Show>
  </>;
}

function AuthRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back to PST Factory', subtitle: 'Sign in to continue building shippable problems.' } },
      signUp: { start: { title: 'Create your factory account', subtitle: 'Start turning real problems into reusable tools.' } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <ClerkQueryClientCacheInvalidator />
      <Switch>
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/" component={HomeRoute} />
        <Route path="/workspace/:slug" component={CustomerWorkspace} />
        <Route path="/factory/*?" component={ProtectedApp} />
        <Route><Redirect to="/" /></Route>
      </Switch>
    </QueryClientProvider>
  </ClerkProvider>;
}

export default function App() {
  return <WouterRouter base={basePath}><TooltipProvider><ErrorBoundary><AuthRoutes /></ErrorBoundary><Toaster /></TooltipProvider></WouterRouter>;
}