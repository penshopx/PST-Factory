import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity, Archive, ArrowLeft, ArrowRight, Bot, Box, Check, CheckCircle2,
  ChevronRight, CircleDot, ClipboardCheck, Copy, Database, ExternalLink,
  BriefcaseBusiness, FileCode2, FileSearch, FlaskConical, Gauge, Hammer, LayoutDashboard, Library, Menu,
  MessageCircle, MoreHorizontal, Package, Pencil, Plus, Rocket, Search, Settings2, ShieldCheck, Sparkles,
  Target, Trash2, TriangleAlert, UserRound, Users, Workflow, X,
} from 'lucide-react';
import {
  getGetDashboardActivityQueryKey, getGetDashboardSummaryQueryKey,
  getGetPstBlueprintQueryKey, getGetPstProjectQueryKey, getGetPublicPstWorkspaceQueryKey,
  getGetPstReleasesQueryKey,
  getListPstProjectMembersQueryKey,
  getListPstAssetsQueryKey, getListPstPatternsQueryKey, getListPstProjectsQueryKey,
  getListPstRecipesQueryKey, useApprovePstProject, useArchivePstProject,
  useBuildPstProject, useCreatePstProject, useDuplicatePstProject,
  useGetDashboardActivity, useGetDashboardSummary, useGetPstBlueprint,
  useGetPstProject, useGetPstReleases, useGetPublicPstWorkspace, useListPstAssets, useListPstPatterns,
  useListPstProjectMembers, useListPstProjects, useListPstRecipes, usePublishPstProject, useRemovePstProjectMember, useRunPstArchitect,
  useUpsertPstProjectMember,
  useRestorePstRelease, useRunPstQa, useSimulatePstProject, useUpdatePstBlueprint, useUpdatePstProject,
} from '@workspace/api-client-react';
import type {
  BuildResult, FactoryEvent, PstAsset, PstBlueprint, PstPattern, PstProject,
  PstProjectMember, PstRecipe, PstRelease, QaRun, SimulationReport, WorkflowStep,
} from '@workspace/api-client-react';
import { createPstRuntime, advancePstRuntime } from '@workspace/db/schema/pst-runtime';
import type {
  PstExecutableStepV1, PstRuntimeAdvanceResultV1, PstRuntimeDiagnosticV1,
  PstRuntimeInputV1, PstRuntimeSessionV1, PstRuntimeStartResultV1,
  PstRuntimeStepViewV1,
} from '@workspace/db/schema/pst-runtime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  getPublishNoticeForError,
  refreshProjectData,
  type PublishNotice,
} from '@/lib/publish-feedback';
import { PublishNoticePanel } from '@/lib/publish-feedback-panel';
import PSTFactoryVideo from '@/components/PSTFactoryVideo';

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
  { href: '/', label: 'Pabrik', testId: 'factory', icon: LayoutDashboard },
  { href: '/projects', label: 'Proyek PST', testId: 'pst-projects', icon: Box },
  { href: '/libraries/assets', label: 'Komponen siap pakai', testId: 'asset-library', icon: Package },
  { href: '/libraries/patterns', label: 'Pola kerja', testId: 'pattern-library', icon: Workflow },
  { href: '/libraries/recipes', label: 'Panduan kerja', testId: 'recipe-library', icon: FlaskConical },
];

const gustaftaBaseUrl = 'https://gustafta.my.id';
const gustaftaLinks = [
  { href: '/chat/8193', label: 'Panduan Gustafta', detail: 'Cari fitur dan alur yang tepat', icon: MessageCircle },
  { href: '/chat/1', label: 'Help Desk Pekerjaan', detail: 'Tanya jalur SBU, SKK, tender, proyek', icon: Bot },
  { href: '/cek-kesiapan-sbu', label: 'Cek kesiapan SBU', detail: 'Diagnosis awal kesiapan badan usaha', icon: ShieldCheck },
  { href: '/klinik-konsultasi', label: 'Klinik konstruksi', detail: 'Konsultasi SBU, SKK, PKB, dan PUB', icon: MessageCircle },
  { href: '/bedah-dokumen/app', label: 'Bedah dokumen', detail: 'Upload dan pahami dokumen konstruksi', icon: FileSearch },
  { href: '/brain-project', label: 'Brain Project', detail: 'Bangun fondasi pengetahuan proyek', icon: Database },
  { href: '/ruang-simpan', label: 'Ruang Simpan', detail: 'Aktifkan konteks dokumen untuk AI', icon: Library },
  { href: '/tender', label: 'Peluang tender', detail: 'Buka ruang kerja tender Gustafta', icon: BriefcaseBusiness },
];

const stages = [
  { key: 'problem', label: 'Masalah', icon: Target },
  { key: 'architect', label: 'Perancang', icon: Sparkles },
  { key: 'blueprint', label: 'Rancangan', icon: FileCode2 },
  { key: 'build', label: 'Perakitan', icon: Hammer },
  { key: 'qa', label: 'Periksa kualitas + terbitkan', icon: ClipboardCheck },
];

const statusLabels: Record<string, string> = {
  UNKNOWN: 'Tidak diketahui',
  DRAFT: 'Draf',
  ARCHITECTED: 'Rancangan selesai',
  BLUEPRINT_READY: 'Rancangan siap',
  BUILDING: 'Sedang dirakit',
  QA: 'Pemeriksaan kualitas',
  APPROVED: 'Disetujui',
  PUBLISHED: 'Terbit',
  ARCHIVED: 'Diarsipkan',
  PASS: 'Lulus',
  READY: 'Siap',
  PREVIEW: 'Pratinjau',
  ERROR: 'Kesalahan',
};

const roleLabels: Record<string, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Penampil',
};

function displayStatus(value: string) {
  return statusLabels[value] ?? value.replaceAll('_', ' ');
}

const breadcrumbLabels: Record<string, string> = {
  projects: 'proyek',
  create: 'buat',
  libraries: 'koleksi',
  assets: 'komponen',
  patterns: 'pola',
  recipes: 'panduan',
  settings: 'pengaturan',
  workspace: 'ruang-kerja',
};

function displayBreadcrumb(path: string) {
  return path === '/'
    ? 'ringkasan'
    : path.split('/').filter(Boolean).map((segment) => breadcrumbLabels[segment] ?? segment).join(' / ');
}

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function Loading({ label = 'Memuat data pabrik' }: { label?: string }) {
  return <div className="space-y-3" data-testid="loading-state">
    <div className="h-5 w-40 animate-pulse rounded bg-muted" />
    <div className="h-24 w-full animate-pulse rounded-xl bg-muted" />
    <p className="font-mono text-[11px] uppercase tracking-[.18em] text-muted-foreground">{label}</p>
  </div>;
}

function ErrorState({ onRetry, label = 'Workspace ini tidak dapat dimuat' }: { onRetry?: () => void; label?: string }) {
  return <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center" data-testid="error-state">
    <TriangleAlert className="mb-3 text-destructive" size={22} />
    <p className="font-semibold" data-testid="status-error">{label}</p>
    <p className="mt-1 text-sm text-muted-foreground">Pabrik tidak dapat mengambil status terbaru dari server.</p>
    {onRetry && <Button variant="outline" size="sm" onClick={onRetry} className="mt-4" data-testid="button-retry">Coba lagi</Button>}
  </div>;
}

function apiErrorStatus(error: unknown) {
  return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
    ? error.status
    : undefined;
}

function memberAccessError(error: unknown) {
  switch (apiErrorStatus(error)) {
    case 400:
      return 'Masukkan ID pengguna dan pilih peran proyek yang benar.';
    case 403:
      return 'Hanya pemilik dan admin proyek yang dapat mengatur akses anggota.';
    case 404:
      return 'Proyek atau anggota ini sudah tidak tersedia. Muat ulang daftar lalu coba lagi.';
    case 409:
      return 'Perubahan akses ini bertentangan dengan aturan pemilik atau keanggotaan yang sudah ada.';
    default:
      return 'Akses proyek tidak dapat diperbarui. Muat ulang daftar lalu coba lagi.';
  }
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
  return <Badge variant="outline" className={cn('font-mono text-[10px] tracking-[.12em]', tone)} data-testid={`status-${status.toLowerCase()}`}>{displayStatus(status)}</Badge>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobile, setMobile] = useState(false);
  const { user } = useUser();
  const { signOut } = useClerk();
  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Anggota pabrik';
  const initials = displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return <div className="min-h-[100dvh] bg-background text-foreground">
    <aside className={cn('fixed inset-y-0 left-0 z-30 flex w-[248px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform md:translate-x-0', mobile ? 'translate-x-0' : '-translate-x-full')} data-testid="sidebar">
      <div className="flex h-[104px] items-center border-b border-sidebar-border px-5">
        <Link href="/" onClick={() => setMobile(false)} className="focus-ring block w-full rounded-lg" aria-label="PST Factory" data-testid="link-sidebar-logo">
          <img src={`${basePath}/logo.svg`} alt="PST Factory" className="h-auto w-full max-w-[214px]" />
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-7"><p className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[.2em] text-sidebar-foreground/40">Area produksi</p>
        <nav className="space-y-1">{nav.map(({ href, label, testId, icon: Icon }) => <Link href={href} key={href} onClick={() => setMobile(false)} className={cn('focus-ring flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors', location === href ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground')} data-testid={`link-nav-${testId}`}><Icon size={16} strokeWidth={1.8} /><span>{label}</span>{location === href && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />}</Link>)}</nav>
        <div className="mt-7 border-t border-sidebar-border/70 pt-5">
          <p className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[.2em] text-sidebar-foreground/40">Capability Gustafta</p>
          <nav className="space-y-1">
            {gustaftaLinks.map(({ href, label, icon: Icon }) => <a href={`${gustaftaBaseUrl}${href}`} key={href} target="_blank" rel="noreferrer" onClick={() => setMobile(false)} className="focus-ring flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground" data-testid={`link-gustafta-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={15} strokeWidth={1.8} /><span className="min-w-0 flex-1 truncate">{label}</span><ExternalLink size={12} className="shrink-0 opacity-60" /></a>)}
          </nav>
        </div>
      </div>
      <div className="mt-auto space-y-4 border-t border-sidebar-border p-4">
         <Link href="/create" onClick={() => setMobile(false)} className="focus-ring flex items-center justify-center gap-2 rounded-lg bg-sidebar-primary px-3 py-2.5 text-sm font-bold text-sidebar-primary-foreground transition-transform hover:translate-y-[-1px]" data-testid="link-create-pst"><Plus size={16} /> Buat PST</Link>
        <Link href="/settings" onClick={() => setMobile(false)} className="focus-ring flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/55 hover:text-sidebar-foreground" data-testid="link-settings"><Settings2 size={16} /> Pengaturan pabrik</Link>
        <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/60 p-3"><div className="grid h-8 w-8 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">{initials}</div><div className="min-w-0"><p className="truncate text-xs font-semibold">{displayName}</p><p className="truncate font-mono text-[10px] text-sidebar-foreground/45">anggota pabrik</p></div><button type="button" className="ml-auto text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground" onClick={() => void signOut({ redirectUrl: basePath || '/' })} aria-label="Keluar" data-testid="button-sign-out"><MoreHorizontal size={15} /></button></div>
      </div>
    </aside>
    <div className="md:pl-[248px]">
       <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-xl md:px-9">
         <div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobile(!mobile)} data-testid="button-toggle-menu"><Menu size={19} /></Button><span className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Pabrik / <span className="text-foreground">{displayBreadcrumb(location)}</span></span></div>
        <div className="flex items-center gap-2"><span className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[.14em] text-emerald-600 dark:text-emerald-300 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Semua sistem normal</span><Button variant="outline" size="icon" aria-label="Menu pengguna" data-testid="button-user-menu"><UserRound size={16} /></Button></div>
      </header>
      <main className="factory-grid min-h-[calc(100dvh-72px)] px-5 py-8 md:px-9 lg:px-12">{children}</main>
    </div>
  </div>;
}

function PageIntro({ eyebrow, title, detail, action, testId }: { eyebrow: string; title: string; detail?: string; action?: React.ReactNode; testId?: string }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end animate-rise"><div><p className="mb-2 font-mono text-[10px] uppercase tracking-[.22em] text-primary">{eyebrow}</p><h1 className="text-3xl font-extrabold tracking-[-.04em] md:text-4xl" data-testid={testId ?? `heading-${title.toLowerCase().replaceAll(' ', '-')}`}>{title}</h1>{detail && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{detail}</p>}</div>{action}</div>;
}

function Dashboard() {
  const summary = useGetDashboardSummary();
  const activity = useGetDashboardActivity({ query: { queryKey: getGetDashboardActivityQueryKey() } });
  if (summary.isLoading || activity.isLoading) return <Loading />;
  if (summary.isError || activity.isError) return <ErrorState onRetry={() => { void summary.refetch(); void activity.refetch(); }} />;
  const s = summary.data;
  const events = activity.data ?? [];
  return <div className="mx-auto max-w-[1440px]"><PageIntro eyebrow="PST Factory / gambaran pabrik" title="Ubah masalah menjadi solusi yang siap dipakai." testId="heading-make-the-problem-shippable." detail="Alur kerja terarah untuk mengubah satu masalah pengguna yang jelas menjadi alat bantu yang bisa dipakai lagi." action={<Link href="/create" className="focus-ring inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform hover:translate-y-[-1px]" data-testid="link-start-build"><Plus size={17} /> Buat PST</Link>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 animate-rise-2">
        <Metric label="Total proyek" testId="total-projects" value={s?.totalProjects ?? 0} icon={Box} tone="blue" />
       <Metric label="Perakitan aktif" testId="active-builds" value={s?.activeProjects ?? 0} icon={Hammer} tone="cyan" />
        <Metric label="Sudah diterbitkan" testId="published" value={s?.publishedProjects ?? 0} icon={Rocket} tone="amber" />
        <Metric label="Komponen siap pakai" testId="reusable-assets" value={s?.assets ?? 0} icon={Database} tone="green" />
        <Metric label="Sering dipakai lagi" testId="reuse-rate" value={`${s?.reuseRate ?? 0}%`} icon={Gauge} tone="purple" />
    </div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr] animate-rise-3">
        <Card className="overflow-hidden"><CardHeader className="flex-row items-start justify-between border-b border-border/70 pb-4"><div><CardTitle className="text-base">Alur pembuatan</CardTitle><CardDescription className="mt-1">Setiap proyek mengikuti langkah yang sama dan bisa dipantau.</CardDescription></div><div className="rounded-lg bg-primary/10 p-2 text-primary"><Activity size={18} /></div></CardHeader><CardContent className="p-6"><div className="relative grid gap-6 md:grid-cols-5">{stages.map((stage, i) => <div key={stage.key} className="relative"><div className="flex items-center gap-3 md:block"><div className="relative z-10 grid h-10 w-10 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary"><stage.icon size={17} /></div><div className="mt-0 md:mt-3"><p className="text-sm font-semibold">{stage.label}</p><p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{i === 0 ? 'mulai di sini' : i === 4 ? 'terbitkan saat siap' : 'sedang dikerjakan'}</p></div></div>{i < 4 && <div className="absolute left-5 top-10 h-6 w-px bg-border md:left-10 md:top-5 md:h-px md:w-[calc(100%-20px)] md:translate-x-5" />}</div>)}</div></CardContent></Card>
        <Card><CardHeader className="border-b border-border/70 pb-4"><CardTitle className="text-base">Hasil pemeriksaan</CardTitle><CardDescription className="mt-1">Persentase proyek yang lolos pemeriksaan kualitas.</CardDescription></CardHeader><CardContent className="p-6"><div className="flex items-end gap-3"><span className="text-5xl font-extrabold tracking-[-.06em] text-accent">{s?.qaPassRate ?? 0}%</span><span className="mb-2 font-mono text-[10px] uppercase text-muted-foreground">Proyek yang lolos</span></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(100, s?.qaPassRate ?? 0)}%` }} /></div><div className="mt-5 flex items-start gap-3 rounded-lg border border-border bg-muted/45 p-3"><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-500" size={16} /><p className="text-xs leading-relaxed text-muted-foreground">PST yang baik membuat langkah berikutnya jelas dan hasilnya bisa diukur.</p></div></CardContent></Card>
    </div>
      <Card className="mt-6 animate-rise-3"><CardHeader className="flex-row items-center justify-between border-b border-border/70 pb-4"><div><CardTitle className="text-base">Aktivitas terbaru</CardTitle><CardDescription className="mt-1">Catatan pabrik, mulai dari yang paling baru.</CardDescription></div><Link href="/projects" className="text-xs font-semibold text-primary hover:underline" data-testid="link-view-projects">Lihat semua proyek <ArrowRight className="ml-1 inline" size={13} /></Link></CardHeader><CardContent className="p-0">{events.length === 0 ? <EmptyState icon={Activity} title="Belum ada aktivitas pabrik" detail="Aktivitas pertama dari Perancang akan muncul di sini." /> : events.slice(0, 7).map((event) => <ActivityRow event={event} key={event.id} />)}</CardContent></Card>
      <GustaftaBridge />
  </div>;
}

function Metric({ label, testId, value, icon: Icon, tone }: { label: string; testId: string; value: string | number; icon: typeof Box; tone: string }) {
  return <div className="rounded-xl border border-border bg-card p-4 shadow-sm"><div className="flex items-start justify-between"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">{label}</p><Icon size={16} className={cn(tone === 'blue' && 'text-primary', tone === 'cyan' && 'text-accent', tone === 'amber' && 'text-amber-500', tone === 'green' && 'text-emerald-500', tone === 'purple' && 'text-violet-500')} /></div><p className="mt-3 text-2xl font-extrabold tracking-[-.04em]" data-testid={`text-metric-${testId}`}>{value}</p></div>;
}

function ActivityRow({ event }: { event: FactoryEvent }) {
  return <div className="flex items-center gap-4 border-b border-border/60 px-6 py-4 last:border-0" data-testid={`row-activity-${event.id}`}><div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><CircleDot size={15} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm">{event.message}</p><p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{event.type} · {new Date(event.createdAt).toLocaleDateString()}</p></div>{event.projectId && <Link href={`/projects/${event.projectId}`} className="text-muted-foreground hover:text-primary" data-testid={`link-activity-project-${event.id}`}><ChevronRight size={16} /></Link>}</div>;
}

function GustaftaBridge() {
  return <Card className="mt-6 overflow-hidden border-primary/20 bg-primary/[.03]" data-testid="card-gustafta-bridge">
    <CardHeader className="flex-row items-start justify-between gap-4 border-b border-border/70 pb-4">
      <div>
        <div className="flex items-center gap-2"><CardTitle className="text-base">Perlu dukungan pekerjaan?</CardTitle><span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[.14em] text-primary">Gustafta</span></div>
        <CardDescription className="mt-1">Capability pendamping yang relevan untuk dokumen, tender, dan pengetahuan konstruksi.</CardDescription>
      </div>
      <ExternalLink className="mt-1 shrink-0 text-primary" size={17} />
    </CardHeader>
    <CardContent className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
      {gustaftaLinks.map(({ href, label, detail, icon: Icon }) => <a href={`${gustaftaBaseUrl}${href}`} key={href} target="_blank" rel="noreferrer" className="focus-ring group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-primary/[.05]" data-testid={`card-link-gustafta-${label.toLowerCase().replaceAll(' ', '-')}`}>
        <div className="mb-4 flex items-center justify-between"><div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Icon size={17} /></div><ExternalLink size={14} className="text-muted-foreground transition-colors group-hover:text-primary" /></div>
        <p className="text-sm font-semibold">{label}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
      </a>)}
    </CardContent>
  </Card>;
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
  return <div className="mx-auto max-w-[1440px]"><PageIntro eyebrow="Portofolio / semua PST" title="Daftar proyek" testId="heading-project-line-up" detail="Cari proyek, lihat komponen yang bisa dipakai lagi, dan lanjutkan pembuatannya." action={<Link href="/create" className="focus-ring inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground" data-testid="link-create-project"><Plus size={17} /> Buat proyek</Link>} />
     <div className="mb-5 flex flex-col gap-3 md:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 text-muted-foreground" size={17} /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari proyek berdasarkan nama atau masalah..." className="pl-9 bg-card" data-testid="input-project-search" /></div><select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" data-testid="select-project-status"><option value="">Semua status</option>{['DRAFT', 'ARCHITECTED', 'BLUEPRINT_READY', 'BUILDING', 'QA', 'APPROVED', 'PUBLISHED', 'ARCHIVED'].map((item) => <option value={item} key={item}>{displayStatus(item)}</option>)}</select></div>
     {projects.isLoading ? <Loading label="Memuat daftar proyek" /> : projects.isError ? <ErrorState onRetry={() => void projects.refetch()} /> : list.length === 0 ? <EmptyState icon={Box} title={search ? 'Tidak ada proyek yang cocok' : 'Belum ada proyek'} detail={search ? 'Coba gunakan kata pencarian yang lebih umum.' : 'Mulai dari satu masalah yang spesifik. Pabrik akan membantu membentuk sisanya.'} action={!search && <Link href="/create" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary" data-testid="link-empty-create">Buat PST pertama Anda <ArrowRight size={15} /></Link>} /> : <div className="grid gap-3">{list.map((project) => <ProjectRow project={project} key={project.id} onDuplicate={() => duplicate.mutate({ projectId: project.id }, { onSuccess: refresh })} onArchive={() => archive.mutate({ projectId: project.id }, { onSuccess: refresh })} />)}</div>}
  </div>;
}

function ProjectRow({ project, onDuplicate, onArchive }: { project: PstProject; onDuplicate: () => void; onArchive: () => void }) {
  return <div className="group flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md md:flex-row md:items-center" data-testid={`card-project-${project.id}`}><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 font-mono text-sm font-bold text-primary">{project.name.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Link href={`/projects/${project.id}`} className="truncate text-base font-bold hover:text-primary" data-testid={`link-project-${project.id}`}>{project.name}</Link><StatusBadge value={project.status} /></div><p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{project.description || project.problemStatement}</p><div className="mt-3 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"><span>{project.domain || 'umum'}</span><span>·</span><span>v{project.version}</span><span>·</span><span>{project.components?.length ?? 0} komponen</span></div></div><div className="flex items-center gap-2 md:opacity-0 md:transition-opacity md:group-hover:opacity-100"><Button size="sm" variant="outline" onClick={onDuplicate} data-testid={`button-duplicate-${project.id}`}><Copy size={14} /> Pakai lagi</Button>{project.status !== 'ARCHIVED' && <Button size="icon" variant="ghost" onClick={onArchive} aria-label="Arsipkan proyek" data-testid={`button-archive-${project.id}`}><Archive size={15} /></Button>}<Link href={`/projects/${project.id}`} className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground hover:text-primary" aria-label="Buka proyek" data-testid={`link-open-project-${project.id}`}><ArrowRight size={15} /></Link></div></div>;
}

function Create() {
  const [, setLocation] = useLocation();
  const create = useCreatePstProject();
  const [form, setForm] = useState({ name: '', description: '', domain: '', family: '', series: '', problemStatement: '', targetUser: '', desiredOutcome: '' });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const valid = form.name.trim() && form.problemStatement.trim() && form.targetUser.trim() && form.desiredOutcome.trim();
  return <div className="mx-auto max-w-5xl"><PageIntro eyebrow="Buat PST baru" title="Jelaskan masalahnya dulu." testId="heading-define-the-problem-first." detail="Mulailah dari masalah, bukan daftar fitur. Beri Perancang informasi yang cukup agar dapat membuat solusi yang berguna." />
     <div className="mb-7 flex items-center overflow-x-auto border-b border-border">{['01 Masalah', '02 Pengguna', '03 Hasil', '04 Langkah berikutnya'].map((step, i) => <div className={cn('flex items-center gap-2 border-b-2 px-4 py-3 font-mono text-[10px] uppercase tracking-wider', i === 0 ? 'border-accent text-accent' : 'border-transparent text-muted-foreground')} key={step}><span className="grid h-5 w-5 place-items-center rounded-full border border-current">{i + 1}</span>{step}</div>)}</div>
     <Card><CardHeader><CardTitle className="text-xl">Informasi utama</CardTitle><CardDescription>Empat informasi ini menjadi dasar rancangan PST.</CardDescription></CardHeader><CardContent className="grid gap-5 md:grid-cols-2"><Field label="Nama PST" value={form.name} onChange={(v) => update('name', v)} placeholder="mis. Panduan Minggu Pertama" test="input-create-name" /><Field label="Bidang penggunaan" value={form.domain} onChange={(v) => update('domain', v)} placeholder="mis. orientasi, operasional" test="input-create-domain" /><Field label="Kelompok produk" value={form.family} onChange={(v) => update('family', v)} placeholder="Opsional" test="input-create-family" /><Field label="Seri produk" value={form.series} onChange={(v) => update('series', v)} placeholder="Opsional" test="input-create-series" /><Field label="Masalah yang ingin diselesaikan" value={form.problemStatement} onChange={(v) => update('problemStatement', v)} placeholder="Situasi spesifik apa yang terus terjadi?" multiline test="input-create-problem" /><Field label="Siapa yang akan memakai" value={form.targetUser} onChange={(v) => update('targetUser', v)} placeholder="Siapa yang mengalami situasi itu?" multiline test="input-create-user" /><Field label="Hasil yang diharapkan" value={form.desiredOutcome} onChange={(v) => update('desiredOutcome', v)} placeholder="Perubahan apa yang bisa diukur setelah alat ini dipakai?" multiline test="input-create-outcome" /><Field label="Penjelasan singkat" value={form.description} onChange={(v) => update('description', v)} placeholder="Satu kalimat tentang PST ini" multiline test="input-create-description" /><div className="flex items-center justify-between md:col-span-2"><p className="text-xs text-muted-foreground">{valid ? 'Siap dikirim ke Perancang.' : 'Lengkapi empat informasi wajib untuk melanjutkan.'}</p><Button disabled={!valid || create.isPending} onClick={() => create.mutate({ data: form }, { onSuccess: (project) => setLocation(`/projects/${project.id}`) })} data-testid="button-create-pst">{create.isPending ? 'Membuat...' : 'Buat dan buka ruang kerja'} <ArrowRight size={16} /></Button></div></CardContent></Card>
  </div>;
}

function Field({ label, value, onChange, placeholder, multiline, test }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; multiline?: boolean; test: string }) {
  return <label className="block"><span className="mb-2 block font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">{label}</span>{multiline ? <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-h-[88px] bg-background" data-testid={test} /> : <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-background" data-testid={test} />}</label>;
}

function ProjectWorkspace() {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const projectQuery = useGetPstProject(projectId, { query: { queryKey: getGetPstProjectQueryKey(projectId) } });
  const blueprintQuery = useGetPstBlueprint(projectId, { query: { queryKey: getGetPstBlueprintQueryKey(projectId) } });
  const releasesQuery = useGetPstReleases(projectId, { query: { queryKey: getGetPstReleasesQueryKey(projectId) } });
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
  const [publishNotice, setPublishNotice] = useState<PublishNotice | null>(null);
  const architect = useRunPstArchitect();
  const updateProject = useUpdatePstProject();
  const updateBlueprint = useUpdatePstBlueprint();
  const buildMutation = useBuildPstProject();
  const simulate = useSimulatePstProject();
  const runQa = useRunPstQa();
  const approve = useApprovePstProject();
  const publish = usePublishPstProject();
  const restoreRelease = useRestorePstRelease();
  const qc = useQueryClient();
  const projectPatternId = project?.selectedPatterns?.[0]?.id ?? '';
  const projectRecipeId = project?.selectedRecipes?.[0]?.id ?? '';
  useEffect(() => {
    if (project) {
      setSelectedPatternId(projectPatternId);
      setSelectedRecipeId(projectRecipeId);
    }
  }, [project?.id, projectPatternId, projectRecipeId]);
  if (projectQuery.isLoading) return <Loading label="Memuat ruang kerja PST" />;
  if (projectQuery.isError || !project) return <ErrorState onRetry={() => void projectQuery.refetch()} label="Ruang kerja proyek tidak ditemukan" />;
  const blueprint = blueprintQuery.data ?? project.blueprint;
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: getGetPstProjectQueryKey(projectId) });
    void qc.invalidateQueries({ queryKey: getGetPstBlueprintQueryKey(projectId) });
    void qc.invalidateQueries({ queryKey: getGetPstReleasesQueryKey(projectId) });
  };
  const refreshProject = () => {
    void refreshProjectData(
      [
        () => projectQuery.refetch(),
        () => blueprintQuery.refetch(),
        () => releasesQuery.refetch(),
      ],
      () => {
        setPublishNotice(null);
        publish.reset();
      },
    );
  };
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
    if (action === 'publish') publish.mutate({ projectId }, {
      onSuccess: () => {
        setPublishNotice(null);
        invalidate();
      },
      onError: (error) => {
        setPublishNotice(getPublishNoticeForError(error));
      },
    });
  };
  const restore = (releaseId: string) => {
    if (window.confirm('Pulihkan rilis ini ke draf yang dapat diedit? Rilis customer yang sedang terbit akan tetap aktif sampai Anda menerbitkannya lagi.')) {
      restoreRelease.mutate({ projectId, releaseId }, { onSuccess: invalidate });
    }
  };
  const tabs = [{ key: 'overview', label: 'Ringkasan' }, { key: 'problem', label: 'Masalah' }, { key: 'architect', label: 'Perancang' }, { key: 'blueprint', label: 'Rancangan' }, { key: 'assets', label: 'Komponen' }, { key: 'workflow', label: 'Langkah-langkah' }, { key: 'ai', label: 'Bantuan AI' }, { key: 'build', label: 'Perakitan' }, { key: 'preview', label: 'Pratinjau' }, { key: 'qa', label: 'Kualitas' }, { key: 'publish', label: 'Terbitkan' }, { key: 'versions', label: 'Versi' }, { key: 'access', label: 'Akses' }];
  return <div className="mx-auto max-w-[1440px]"><Link href="/projects" className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-primary" data-testid="link-back-projects"><ArrowLeft size={14} /> Semua proyek</Link><div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="mb-2 flex items-center gap-2"><StatusBadge value={project.status} /><span className="font-mono text-[10px] text-muted-foreground">v{project.version} · {project.domain || 'umum'}</span></div><h1 className="text-3xl font-extrabold tracking-[-.05em]" data-testid="heading-project-name">{project.name}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{project.description || project.problemStatement}</p></div><div className="flex flex-wrap gap-2"><Link href={`/workspace/${project.slug}`} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold hover:border-primary hover:text-primary" data-testid="link-customer-workspace"><ExternalLink size={14} /> Tampilan pengguna</Link><Button variant="outline" size="sm" onClick={() => updateProject.mutate({ projectId, data: { description: project.description } }, { onSuccess: invalidate })} data-testid="button-save-project"><Check size={14} /> Simpan perubahan</Button></div></div>
    <div className="mb-6 overflow-x-auto border-b border-border"><div className="flex min-w-max gap-1">{tabs.map((item) => <button onClick={() => setTab(item.key)} className={cn('border-b-2 px-3 py-3 text-xs font-semibold transition-colors', tab === item.key ? 'border-accent text-accent' : 'border-transparent text-muted-foreground hover:text-foreground')} key={item.key} data-testid={`tab-${item.key}`}>{item.label}</button>)}</div></div>
     {tab === 'overview' && <><OverviewTab project={project} blueprint={blueprint} onArchitect={() => run('architect')} onBuild={() => run('build')} /><GustaftaProjectBridge project={project} /></>}
    {tab === 'problem' && <ProblemTab project={project} onSave={(data) => updateProject.mutate({ projectId, data }, { onSuccess: invalidate })} />}
     {tab === 'architect' && <ArchitectTab project={project} context={architectContext} setContext={setArchitectContext} patterns={patternsQuery.data ?? []} recipes={recipesQuery.data ?? []} selectedPatternId={selectedPatternId} selectedRecipeId={selectedRecipeId} setSelectedPatternId={setSelectedPatternId} setSelectedRecipeId={setSelectedRecipeId} onRun={() => run('architect')} pending={architect.isPending} />}
    {tab === 'blueprint' && <BlueprintTab projectId={projectId} blueprint={blueprint} onSave={(data) => updateBlueprint.mutate({ projectId, data }, { onSuccess: invalidate })} />}
    {tab === 'assets' && <ProjectAssets project={project} />}
    {tab === 'workflow' && <WorkflowTab workflow={blueprint?.workflow ?? []} />}
    {tab === 'ai' && <AiTab blueprint={blueprint} />}
    {tab === 'preview' && <PreviewTab project={project} simulation={simulation} onSimulate={() => run('simulate')} pending={simulate.isPending} />}
    {tab === 'qa' && <QaTab project={project} qa={qa} onRun={() => run('qa')} pending={runQa.isPending} />}
    {tab === 'publish' && <PublishTab project={project} onApprove={() => run('approve')} onPublish={() => run('publish')} onRefreshProject={refreshProject} publishNotice={publishNotice} approvePending={approve.isPending} publishPending={publish.isPending} />}
     {tab === 'versions' && <VersionsTab project={project} releases={releasesQuery.data ?? []} onRestore={restore} restorePending={restoreRelease.isPending} />}
     {tab === 'access' && <MembersTab projectId={projectId} />}
      {tab === 'build' && (build ? <BuildTab build={build} /> : <EmptyState icon={Hammer} title="Perakitan belum dijalankan" detail="Pilih Perakitan dari Ringkasan untuk mengubah rancangan menjadi komponen." />)}
     {tab !== 'build' && buildMutation.isPending && <div className="fixed bottom-5 right-5 flex items-center gap-3 rounded-lg border border-accent/30 bg-card px-4 py-3 text-sm shadow-lg"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Merakit komponen...</div>}
  </div>;
}

function OverviewTab({ project, blueprint, onArchitect, onBuild }: { project: PstProject; blueprint?: PstBlueprint; onArchitect: () => void; onBuild: () => void }) {
  return <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]"><Card><CardHeader><CardTitle className="text-base">Ringkasan hasil</CardTitle><CardDescription>Perubahan yang ingin dicapai lewat PST ini.</CardDescription></CardHeader><CardContent className="space-y-5"><InfoBlock label="Masalah" text={project.problemStatement} accent="primary" /><InfoBlock label="Pengguna" text={project.targetUser} accent="accent" /><InfoBlock label="Hasil yang diharapkan" text={project.desiredOutcome} accent="amber" /></CardContent></Card><div className="space-y-6"><Card><CardHeader><CardTitle className="text-base">Langkah berikutnya</CardTitle><CardDescription>Pabrik membantu Anda melanjutkan dari sini.</CardDescription></CardHeader><CardContent><div className="flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/5 p-4"><Sparkles className="mt-0.5 shrink-0 text-accent" size={18} /><div><p className="text-sm font-bold">{blueprint?.nextStep || 'Minta Perancang membuat rancangan'}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Buat rencana yang jelas berdasarkan masalah ini.</p></div></div><div className="mt-4 flex gap-2"><Button onClick={onArchitect} data-testid="button-overview-architect"><Sparkles size={15} /> Jalankan Perancang</Button><Button variant="outline" onClick={onBuild} data-testid="button-overview-build"><Hammer size={15} /> Mulai perakitan</Button></div></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Ringkasan isi</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3">{[['Langkah', project.productDna?.journey?.length ?? 0], ['Komponen', project.components?.length ?? 0], ['Kualitas', project.qaStatus], ['Publikasi', project.publicationStatus]].map(([label, value]) => <div className="rounded-lg bg-muted/50 p-3" key={String(label)}><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>)}</CardContent></Card></div></div>;
}

function GustaftaProjectBridge({ project }: { project: PstProject }) {
  const context = [project.name, project.domain, project.family, project.problemStatement, project.targetUser, project.desiredOutcome].join(' ');
  if (!/(konstruksi|tender|sbu|skk|dokumen|legalitas|kontrak|lapangan|proyek)/i.test(context)) return null;
  const links = [
    ...gustaftaLinks.filter(({ href }) => ['/cek-kesiapan-sbu', '/klinik-konsultasi', '/bedah-dokumen/app', '/brain-project', '/tender'].includes(href)),
    { href: '/konsultan-kontrak', label: 'Konsultan kontrak', detail: 'Review kontrak, klaim, dan sengketa', icon: ShieldCheck },
    { href: '/konsultan-dokumen-proyek', label: 'Dokumen proyek', detail: 'Rapikan laporan dan dokumentasi proyek', icon: FileCode2 },
  ];
  return <Card className="mt-6 border-primary/20 bg-primary/[.03]" data-testid="card-gustafta-project-bridge">
    <CardHeader className="border-b border-border/70 pb-4">
      <CardTitle className="text-base">Capability Gustafta untuk konteks ini</CardTitle>
      <CardDescription className="mt-1">Pintu masuk opsional untuk pemeriksaan SBU, dokumen, knowledge, dan tender. Data PST tidak dikirim otomatis.</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
      {links.map(({ href, label, detail, icon: Icon }) => <a href={`${gustaftaBaseUrl}${href}`} key={href} target="_blank" rel="noreferrer" className="focus-ring group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-primary/[.05]" data-testid={`project-link-gustafta-${label.toLowerCase().replaceAll(' ', '-')}`}>
        <div className="mb-4 flex items-center justify-between"><div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Icon size={17} /></div><ExternalLink size={14} className="text-muted-foreground transition-colors group-hover:text-primary" /></div>
        <p className="text-sm font-semibold">{label}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
      </a>)}
    </CardContent>
  </Card>;
}

function InfoBlock({ label, text, accent }: { label: string; text: string; accent: string }) { return <div className="border-l-2 border-current pl-4" style={{ color: `hsl(var(--${accent}))` }}><p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">{label}</p><p className="mt-2 text-sm leading-relaxed text-foreground">{text || 'Belum didefinisikan.'}</p></div>; }

function ProblemTab({ project, onSave }: { project: PstProject; onSave: (data: { problemStatement: string; targetUser: string; desiredOutcome: string }) => void }) {
  const [values, setValues] = useState({ problemStatement: project.problemStatement, targetUser: project.targetUser, desiredOutcome: project.desiredOutcome });
  return <Card className="max-w-3xl"><CardHeader><CardTitle>Jelaskan masalah</CardTitle><CardDescription>Jelaskan satu masalah yang spesifik dan bisa diukur hasilnya.</CardDescription></CardHeader><CardContent className="space-y-5"><Field label="Masalah yang ingin diselesaikan" value={values.problemStatement} onChange={(v) => setValues({ ...values, problemStatement: v })} placeholder="Situasi apa yang terus berulang?" multiline test="input-project-problem" /><Field label="Siapa yang mengalami" value={values.targetUser} onChange={(v) => setValues({ ...values, targetUser: v })} placeholder="Siapa yang berada dalam situasi tersebut?" multiline test="input-project-user" /><Field label="Hasil yang diharapkan" value={values.desiredOutcome} onChange={(v) => setValues({ ...values, desiredOutcome: v })} placeholder="Perubahan apa yang bisa diukur?" multiline test="input-project-outcome" /><Button onClick={() => onSave(values)} data-testid="button-save-problem"><Check size={15} /> Simpan perubahan</Button></CardContent></Card>;
}

function ArchitectTab({ project, context, setContext, patterns, recipes, selectedPatternId, selectedRecipeId, setSelectedPatternId, setSelectedRecipeId, onRun, pending }: { project: PstProject; context: string; setContext: (v: string) => void; patterns: PstPattern[]; recipes: PstRecipe[]; selectedPatternId: string; selectedRecipeId: string; setSelectedPatternId: (v: string) => void; setSelectedRecipeId: (v: string) => void; onRun: () => void; pending: boolean }) {
  return <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]"><Card><CardHeader><CardTitle className="text-base">Ringkasan perancang</CardTitle><CardDescription>Pilih pola dan panduan yang sudah terbukti sebelum membuat rancangan.</CardDescription></CardHeader><CardContent><div className="space-y-4"><InfoBlock label="Masalah" text={project.problemStatement} accent="primary" /><InfoBlock label="Pengguna" text={project.targetUser} accent="accent" /><div className="grid gap-3 sm:grid-cols-2"><ReferenceSelect label="Pola kerja" value={selectedPatternId} onChange={setSelectedPatternId} options={patterns.map((pattern) => ({ id: pattern.id, name: pattern.name }))} emptyLabel="Tanpa pola" test="select-architect-pattern" /><ReferenceSelect label="Panduan" value={selectedRecipeId} onChange={setSelectedRecipeId} options={recipes.map((recipe) => ({ id: recipe.id, name: recipe.name }))} emptyLabel="Tanpa panduan" test="select-architect-recipe" /></div><p className="text-xs leading-relaxed text-muted-foreground">Pola dan panduan ini akan dipakai sebagai acuan saat membuat rancangan dan merakit PST.</p><Field label="Konteks tambahan" value={context} onChange={setContext} placeholder="Apa yang perlu dilindungi, dihindari, atau diprioritaskan?" multiline test="input-architect-context" /><Button className="w-full" onClick={onRun} disabled={pending} data-testid="button-run-architect"><Sparkles size={16} /> {pending ? 'Menyusun rancangan...' : 'Buat usulan'}</Button></div></CardContent></Card><Card className="factory-grid"><CardHeader><CardTitle className="text-base">Yang akan dilakukan</CardTitle><CardDescription>Perancang akan mengubah informasi ini menjadi rancangan yang bisa dibuat.</CardDescription></CardHeader><CardContent className="space-y-3">{['Menghubungkan pola terpilih ke langkah kerja', 'Memakai panduan terpilih sebagai acuan komponen', 'Menentukan pengetahuan dan bantuan AI yang dibutuhkan', 'Menjelaskan langkah berikutnya untuk perakitan'].map((line, i) => <div className="flex items-center gap-3 rounded-lg border border-border bg-card/75 p-3" key={line}><span className="font-mono text-xs text-accent">0{i + 1}</span><span className="text-sm">{line}</span><CheckCircle2 className="ml-auto text-emerald-500" size={15} /></div>)}</CardContent></Card></div>;
}

function ReferenceSelect({ label, value, onChange, options, emptyLabel, test }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ id: string; name: string }>; emptyLabel: string; test: string }) {
  return <label className="block"><span className="mb-2 block font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" data-testid={test}><option value="">{emptyLabel}</option>{options.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select></label>;
}

function BlueprintTab({ projectId, blueprint, onSave }: { projectId: string; blueprint?: PstBlueprint; onSave: (data: Partial<PstBlueprint>) => void }) {
  const [nextStep, setNextStep] = useState(blueprint?.nextStep ?? '');
  if (!blueprint) return <EmptyState icon={FileCode2} title="Rancangan belum dibuat" detail="Jalankan Perancang untuk membuat usulan pertama." />;
  return <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Isi rancangan</CardTitle><CardDescription>v{blueprint.version} · diperbarui {new Date(blueprint.updatedAt).toLocaleDateString('id-ID')}</CardDescription></CardHeader><CardContent className="space-y-4"><InfoBlock label="Jenis masalah" text={blueprint.problemType} accent="primary" /><InfoBlock label="Hasil yang diharapkan" text={blueprint.expectedOutput?.join(' · ')} accent="accent" /><Field label="Langkah berikutnya" value={nextStep} onChange={setNextStep} placeholder="Apa yang perlu dilakukan pengguna berikutnya?" test="input-blueprint-next-step" /><Button onClick={() => onSave({ nextStep })} data-testid={`button-save-blueprint-${projectId}`}><Check size={15} /> Simpan rancangan</Button></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Yang dibutuhkan</CardTitle></CardHeader><CardContent className="space-y-5"><ListBlock label="Pengetahuan" items={blueprint.knowledgeRequirements} /><ListBlock label="Komponen" items={blueprint.componentRequirements} /><ListBlock label="Bantuan AI" items={blueprint.aiRequirements} /></CardContent></Card></div>;
}

function ListBlock({ label, items = [] }: { label: string; items?: string[] }) { return <div><p className="mb-2 font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">{label}</p>{items.length ? <div className="space-y-1.5">{items.map((item) => <div className="flex gap-2 rounded-md bg-muted/50 p-2 text-xs" key={item}><span className="text-accent">+</span>{item}</div>)}</div> : <p className="text-xs text-muted-foreground">Belum ada persyaratan.</p>}</div>; }

function ProjectAssets({ project }: { project: PstProject }) { return <Card><CardHeader><CardTitle className="text-base">Komponen yang dipilih</CardTitle><CardDescription>Komponen yang akan dirakit menjadi PST ini.</CardDescription></CardHeader><CardContent>{project.components?.length ? <div className="grid gap-2 md:grid-cols-2">{project.components.map((component) => <div className="flex items-center gap-3 rounded-lg border border-border p-3" key={component.id}><div className="rounded-md bg-primary/10 p-2 text-primary"><Package size={15} /></div><div className="flex-1"><p className="text-sm font-semibold">{component.name}</p><p className="font-mono text-[10px] uppercase text-muted-foreground">{component.type} · {component.source}</p></div><StatusBadge value={component.status} /></div>)}</div> : <EmptyState icon={Package} title="Belum ada komponen" detail="Perancang atau panduan dapat menambahkan komponen ke sini." />}</CardContent></Card>; }
function WorkflowTab({ workflow }: { workflow: WorkflowStep[] }) { return <Card><CardHeader><CardTitle className="text-base">Langkah kerja</CardTitle><CardDescription>Setiap langkah menjelaskan masukan, hasil, dan tindakan berikutnya.</CardDescription></CardHeader><CardContent>{workflow.length ? <div className="space-y-3">{workflow.map((step, i) => <div className="flex gap-4 rounded-xl border border-border p-4" key={step.id}><div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-xs text-primary">{String(i + 1).padStart(2, '0')}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{step.title}</p><Badge variant="outline" className="font-mono text-[9px]">{step.type}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{step.description}</p><div className="mt-3 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"><span>masukan: {step.inputs?.join(', ') || 'tidak ada'}</span><span>hasil: {step.outputs?.join(', ') || 'tidak ada'}</span></div></div><ChevronRight size={16} className="mt-1 text-muted-foreground" /></div>)}</div> : <EmptyState icon={Workflow} title="Langkah kerja belum ada" detail="Buat rancangan untuk menyusun langkah-langkah kerja." />}</CardContent></Card>; }
function AiTab({ blueprint }: { blueprint?: PstBlueprint }) { return <Card className="max-w-3xl"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bot className="text-accent" size={18} /> Bantuan AI</CardTitle><CardDescription>AI dipakai di dalam alur kerja untuk tugas yang jelas.</CardDescription></CardHeader><CardContent><ListBlock label="Yang dibutuhkan dari AI" items={blueprint?.aiRequirements} /><div className="mt-6 rounded-lg border border-accent/25 bg-accent/5 p-4"><p className="text-sm font-semibold">Batas penggunaan</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Setiap saran harus membantu pengguna mencapai hasil yang ditentukan. Sistem harus tetap mudah dipahami dan bisa diabaikan.</p></div></CardContent></Card>; }

function BuildTab({ build }: { build: BuildResult }) { return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Hammer className="text-accent" size={19} /> Laporan perakitan <StatusBadge value={build.status} /></CardTitle><CardDescription>Pemilihan komponen setelah perakitan terakhir.</CardDescription></CardHeader><CardContent className="grid gap-6 md:grid-cols-2"><ListBlock label="Siap" items={build.ready} /><ListBlock label="Kurang" items={build.missing} /><ListBlock label="Peringatan" items={build.warnings} /><ListBlock label="Kesalahan" items={build.errors} /></CardContent></Card>; }
function PreviewTab({ project, simulation, onSimulate, pending }: { project: PstProject; simulation: SimulationReport | null; onSimulate: () => void; pending: boolean }) { return <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]"><Card className="min-h-[360px] overflow-hidden"><div className="flex items-center justify-between border-b border-border bg-muted/35 px-5 py-3"><div className="flex gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive/60" /><span className="h-2 w-2 rounded-full bg-amber-400/70" /><span className="h-2 w-2 rounded-full bg-emerald-500/70" /></div><span className="font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground">pratinjau pengguna / {project.slug}</span><ExternalLink size={14} className="text-muted-foreground" /></div><div className="factory-grid flex min-h-[300px] items-center justify-center p-8 text-center"><div className="max-w-md"><div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><Target size={22} /></div><h2 className="text-2xl font-extrabold">{project.name}</h2><p className="mt-3 text-sm text-muted-foreground">{project.desiredOutcome}</p><Button className="mt-5" onClick={onSimulate} disabled={pending} data-testid="button-simulate-preview"><FlaskConical size={15} /> {pending ? 'Menjalankan uji coba...' : 'Jalankan uji coba'}</Button></div></div></Card><Card><CardHeader><CardTitle className="text-base">Hasil uji coba</CardTitle><CardDescription>Periksa alurnya sebelum dibuka untuk pengguna.</CardDescription></CardHeader><CardContent>{simulation ? <div><div className="flex items-center gap-3"><StatusBadge value={simulation.status} /><span className="font-mono text-[10px] text-muted-foreground">{new Date(simulation.createdAt).toLocaleString('id-ID')}</span></div><div className="mt-4 space-y-2">{simulation.checks?.map((check) => <div className="flex gap-2 text-sm" key={check}><CheckCircle2 className="shrink-0 text-emerald-500" size={16} />{check}</div>)}</div></div> : <EmptyState icon={FlaskConical} title="Belum ada uji coba" detail="Jalankan uji coba untuk menemukan bagian yang masih perlu diperbaiki." />}</CardContent></Card></div>; }
function QaTab({ project, qa, onRun, pending }: { project: PstProject; qa: QaRun | null; onRun: () => void; pending: boolean }) { return <Card><CardHeader className="flex-row items-start justify-between"><div><CardTitle className="text-base">Pemeriksaan kualitas</CardTitle><CardDescription>Periksa kejelasan, kelengkapan, dan kesesuaian hasil.</CardDescription></div><Button onClick={onRun} disabled={pending} data-testid="button-run-qa"><ClipboardCheck size={15} /> {pending ? 'Memeriksa...' : 'Periksa sekarang'}</Button></CardHeader><CardContent>{qa ? <div className="space-y-2">{qa.results?.map((result) => <div className="flex items-start gap-3 rounded-lg border border-border p-3" key={`${result.category}-${result.label}`}><StatusBadge value={result.status} /><div><p className="text-sm font-semibold">{result.label}</p><p className="mt-1 text-xs text-muted-foreground">{result.detail}</p></div></div>)}</div> : <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-5"><div className="rounded-lg bg-muted p-2"><ClipboardCheck size={17} /></div><div><p className="text-sm font-semibold">Belum diperiksa pada v{project.version}</p><p className="mt-1 text-xs text-muted-foreground">Hasil ini menjadi dasar sebelum PST disetujui.</p></div></div>}</CardContent></Card>; }
function PublishTab({ project, onApprove, onPublish, onRefreshProject, publishNotice, approvePending, publishPending }: { project: PstProject; onApprove: () => void; onPublish: () => void; onRefreshProject: () => void; publishNotice: PublishNotice | null; approvePending: boolean; publishPending: boolean }) {
  const approved = project.status === 'APPROVED' || project.status === 'PUBLISHED';
  return <div className="max-w-3xl">
    <Card>
       <CardHeader><CardTitle className="text-base">Sebelum diterbitkan</CardTitle><CardDescription>Setelah diterbitkan, ruang kerja terpandu dapat digunakan oleh pengguna.</CardDescription></CardHeader>
      <CardContent>
        {publishNotice && <PublishNoticePanel notice={publishNotice} onRefresh={onRefreshProject} />}
         <div className="space-y-3">{[['Hasil QA', project.qaStatus, project.qaStatus === 'PASS'], ['Persetujuan', approved ? project.status : 'Menunggu persetujuan', approved], ['Publikasi', project.publicationStatus, project.publicationStatus === 'PUBLISHED']].map(([label, value, good]) => <div className="flex items-center gap-3 rounded-lg border border-border p-4" key={String(label)}><div className={cn('grid h-8 w-8 place-items-center rounded-full', good ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground')}>{good ? <Check size={15} /> : <CircleDot size={15} />}</div><div className="flex-1"><p className="text-sm font-semibold">{label}</p><p className="font-mono text-[10px] uppercase text-muted-foreground">{displayStatus(String(value))}</p></div></div>)}</div>
          <div className="mt-5 flex gap-2">{!approved && <Button variant="outline" onClick={onApprove} disabled={approvePending || project.qaStatus !== 'PASS'} data-testid="button-approve-pst"><CheckCircle2 size={15} /> {approvePending ? 'Menyetujui...' : 'Setujui hasil'}</Button>}<Button onClick={onPublish} disabled={publishPending || !approved || project.publicationStatus === 'PUBLISHED'} data-testid="button-publish-pst"><Rocket size={15} /> {publishPending ? 'Menerbitkan...' : project.publicationStatus === 'PUBLISHED' ? 'Sudah diterbitkan' : 'Terbitkan untuk pengguna'}</Button></div>
      </CardContent>
    </Card>
  </div>;
}
function VersionsTab({ project, releases, onRestore, restorePending }: { project: PstProject; releases: PstRelease[]; onRestore: (releaseId: string) => void; restorePending: boolean }) {
  const [compareId, setCompareId] = useState('');
  const selected = releases.find((release) => release.id === compareId) ?? releases[0];
  const current = releases[0];
  return <div className="max-w-4xl space-y-5">
    <Card>
       <CardHeader><CardTitle className="text-base">Riwayat versi</CardTitle><CardDescription>Setiap terbitan adalah salinan tetap. Mengubah draf tidak akan mengubah tampilan pengguna.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {releases.length === 0 ? <EmptyState icon={Rocket} title="Belum ada rilis terbit" detail={`Snapshot tidak berubah pertama akan dibuat saat ${project.name} diterbitkan.`} /> : releases.map((release, index) => <div className={cn('flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center', index === 0 ? 'border-accent/40 bg-accent/5' : 'border-border')} key={release.id} data-testid={`card-release-${release.id}`}>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{release.version}</div>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{index === 0 ? 'Terbitan yang sedang dipakai' : 'Terbitan lama'}</p>{index === 0 && <StatusBadge value="PUBLISHED" />}</div><p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">terbit {new Date(release.createdAt).toLocaleString('id-ID')} · {release.snapshot.workflow.length} langkah · {release.snapshot.components.length} komponen</p></div>
           <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setCompareId(release.id)} data-testid={`button-compare-release-${release.id}`}>Bandingkan</Button><Button size="sm" variant="ghost" onClick={() => onRestore(release.id)} disabled={restorePending} data-testid={`button-restore-release-${release.id}`}><ArrowLeft size={14} /> Pulihkan</Button></div>
        </div>)}
      </CardContent>
    </Card>
    {selected && current && <Card data-testid="card-release-comparison">
       <CardHeader><CardTitle className="text-base">Bandingkan terbitan</CardTitle><CardDescription>{selected.version} tetap sama seperti saat diterbitkan. Pulihkan ke draf jika ingin melanjutkan dari versi ini.</CardDescription></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
         <div className="rounded-lg border border-accent/30 bg-accent/5 p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-accent">Dipilih / {selected.version}</p><p className="mt-3 text-sm font-semibold">{selected.snapshot.project.desiredOutcome}</p><div className="mt-4 space-y-2 text-xs text-muted-foreground"><p>{selected.snapshot.workflow.map((step) => step.title).join(' → ')}</p><p>{selected.snapshot.components.map((component) => component.name).join(' · ')}</p></div></div>
         <div className="rounded-lg border border-border p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Terbaru / {current.version}</p><p className="mt-3 text-sm font-semibold">{current.snapshot.project.desiredOutcome}</p><div className="mt-4 space-y-2 text-xs text-muted-foreground"><p>{current.snapshot.workflow.map((step) => step.title).join(' → ')}</p><p>{current.snapshot.components.map((component) => component.name).join(' · ')}</p></div></div>
      </CardContent>
    </Card>}
  </div>;
}

function MembersTab({ projectId }: { projectId: string }) {
  const membersQuery = useListPstProjectMembers(projectId, {
    query: { queryKey: getListPstProjectMembersQueryKey(projectId) },
  });
  const addMember = useUpsertPstProjectMember();
  const qc = useQueryClient();
  const [selectedMember, setSelectedMember] = useState<PstProjectMember | null>(null);
  const [newMemberUserId, setNewMemberUserId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'editor' | 'viewer'>('viewer');
  const [notice, setNotice] = useState<string | null>(null);
  const queryKey = getListPstProjectMembersQueryKey(projectId);
  const members = membersQuery.data ?? [];
  const removeMember = useRemovePstProjectMember();

  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const userId = newMemberUserId.trim();
    if (!userId) {
      setNotice('Masukkan ID pengguna sebelum menambahkan akses proyek.');
      return;
    }
    setNotice(null);
    addMember.mutate({ projectId, data: { userId, role: newMemberRole } }, {
      onSuccess: (member) => {
        qc.setQueryData<PstProjectMember[]>(queryKey, (current) => {
          const existing = current?.find((item) => item.userId === member.userId);
          if (existing) {
            return current?.map((item) => item.userId === member.userId ? { ...item, ...member } : item) ?? [member];
          }
          return [...(current ?? []), member];
        });
        setNewMemberUserId('');
        setNewMemberRole('viewer');
        setNotice(null);
        void qc.invalidateQueries({ queryKey });
      },
      onError: (error) => {
        setNotice(memberAccessError(error));
        if (apiErrorStatus(error) === 404) void membersQuery.refetch();
      },
    });
  };

  const confirmRemoval = () => {
    if (!selectedMember) return;
    const userId = selectedMember.userId;
    setNotice(null);
    removeMember.mutate({ projectId, userId }, {
      onSuccess: () => {
        qc.setQueryData<PstProjectMember[]>(queryKey, (current) => current?.filter((member) => member.userId !== userId) ?? []);
        setSelectedMember(null);
        setNotice(null);
        void qc.invalidateQueries({ queryKey });
      },
      onError: (error) => {
        setNotice(memberAccessError(error));
        if (apiErrorStatus(error) === 404) void membersQuery.refetch();
      },
    });
  };

   if (membersQuery.isLoading) return <Loading label="Memuat akses proyek" />;
  if (membersQuery.isError) {
    return <Card className="max-w-3xl border-destructive/30" data-testid="card-member-access-error">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="text-destructive" size={18} /> Kontrol akses tidak tersedia</CardTitle></CardHeader>
      <CardContent><p className="text-sm text-muted-foreground" role="alert" data-testid="status-member-error">{memberAccessError(membersQuery.error)}</p><Button variant="outline" size="sm" className="mt-4" onClick={() => void membersQuery.refetch()} data-testid="button-retry-members">Coba lagi</Button></CardContent>
    </Card>;
  }

  return <div className="max-w-4xl space-y-5">
    <Card data-testid="card-add-project-member">
      <CardHeader>
         <CardTitle className="flex items-center gap-2 text-base"><Plus className="text-accent" size={18} /> Tambahkan anggota proyek</CardTitle>
         <CardDescription>Berikan akses ruang kerja kepada pengguna. Jika sudah terdaftar, perannya akan diperbarui.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-[1fr_180px_auto] md:items-end" onSubmit={add}>
          <label className="block">
            <span className="mb-2 block font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">ID pengguna</span>
            <Input
              value={newMemberUserId}
              onChange={(event) => setNewMemberUserId(event.target.value)}
              placeholder="user_..."
              className="bg-background"
              disabled={addMember.isPending}
              data-testid="input-member-user-id"
            />
          </label>
          <label className="block">
            <span className="mb-2 block font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Peran</span>
            <select
              value={newMemberRole}
              onChange={(event) => setNewMemberRole(event.target.value as typeof newMemberRole)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={addMember.isPending}
              data-testid="select-member-role"
            >
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="viewer">Penampil</option>
            </select>
          </label>
          <Button type="submit" disabled={addMember.isPending} data-testid="button-add-member">
            <Plus size={15} /> {addMember.isPending ? 'Menambahkan...' : 'Tambahkan anggota'}
          </Button>
        </form>
      </CardContent>
    </Card>
    <Card data-testid="card-project-members">
      <CardHeader className="flex-row items-start justify-between border-b border-border/70">
         <div><CardTitle className="flex items-center gap-2 text-base"><Users className="text-accent" size={18} /> Akses proyek</CardTitle><CardDescription className="mt-1">Lihat siapa yang dapat membuka ruang kerja ini dan apa yang dapat mereka lakukan.</CardDescription></div>
        <Badge variant="outline" className="font-mono text-[10px]">{members.length} anggota</Badge>
      </CardHeader>
      <CardContent className="p-0">
         {members.length === 0 ? <EmptyState icon={Users} title="Tidak ada anggota" detail="Belum ada anggota yang diberi akses ke proyek ini." /> : <div className="divide-y divide-border/70">
          {members.map((member) => {
            const isOwner = (member as PstProjectMember & { isOwner?: boolean }).isOwner ?? false;
            return <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center" key={member.id} data-testid={`row-project-member-${member.userId}`}>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-xs font-bold text-primary">{member.userId.slice(-2).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-xs" title={member.userId}>{member.userId}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="capitalize">{roleLabels[member.role] ?? member.role}</Badge>
               {isOwner ? <Badge className="bg-accent/15 text-accent hover:bg-accent/20">Pemilik proyek</Badge> : <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Anggota</span>}
              </div>
            </div>
            {isOwner ? <span className="text-xs text-muted-foreground" data-testid={`text-owner-protected-${member.userId}`}>Akses pemilik dilindungi</span> : <Button variant="outline" size="sm" onClick={() => { setNotice(null); setSelectedMember(member); }} aria-label={`Cabut akses untuk ${member.userId}`} data-testid={`button-remove-member-${member.userId}`}><Trash2 size={14} /> Cabut akses</Button>}
          </div>;
          })}
        </div>}
      </CardContent>
    </Card>
    {notice && <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm" role="alert" data-testid="status-member-mutation-error"><TriangleAlert className="mt-0.5 shrink-0 text-destructive" size={16} /><p>{notice}</p><button type="button" className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setNotice(null)} aria-label="Tutup error akses" data-testid="button-dismiss-member-error"><X size={14} /></button></div>}
    <AlertDialog open={Boolean(selectedMember)} onOpenChange={(open) => { if (!open && !removeMember.isPending) setSelectedMember(null); }}>
      <AlertDialogContent>
       <AlertDialogHeader><AlertDialogTitle>Cabut akses anggota?</AlertDialogTitle><AlertDialogDescription>Ini akan menghapus <span className="font-mono text-foreground">{selectedMember?.userId}</span> dari proyek ini. Mereka tidak dapat lagi membuka ruang kerja ini.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={removeMember.isPending}>Pertahankan akses</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmRemoval} disabled={removeMember.isPending}>{removeMember.isPending ? 'Mencabut...' : 'Cabut akses'}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

function LibraryPage({ kind }: { kind: 'assets' | 'patterns' | 'recipes' }) {
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const assetParams = { ...(search ? { search } : {}) };
  const assets = useListPstAssets(assetParams, { query: { queryKey: getListPstAssetsQueryKey(assetParams) } });
  const patterns = useListPstPatterns({ query: { queryKey: getListPstPatternsQueryKey() } });
  const recipes = useListPstRecipes({ query: { queryKey: getListPstRecipesQueryKey() } });
  const title = kind === 'assets' ? 'Komponen siap pakai' : kind === 'patterns' ? 'Pola kerja' : 'Panduan kerja';
  const titleTestId = kind === 'assets' ? 'heading-asset-library' : kind === 'patterns' ? 'heading-pattern-library' : 'heading-recipe-library';
  const singular = kind === 'assets' ? 'komponen' : kind === 'patterns' ? 'pola' : 'panduan';
  const plural = singular;
  const detail = kind === 'assets' ? 'Bagian yang sudah siap dipakai untuk membuat PST lebih cepat.' : kind === 'patterns' ? 'Urutan langkah yang sudah teruji untuk masalah yang sering muncul.' : 'Kumpulan komponen dan langkah yang membantu perakitan lebih cepat.';
  const items = kind === 'assets' ? (assets.data ?? []) : kind === 'patterns' ? (patterns.data ?? []) : (recipes.data ?? []);
  const loading = kind === 'assets' ? assets.isLoading : kind === 'patterns' ? patterns.isLoading : recipes.isLoading;
  const error = kind === 'assets' ? assets.isError : kind === 'patterns' ? patterns.isError : recipes.isError;
  return <div className="mx-auto max-w-[1440px]"><PageIntro eyebrow="Bahan yang bisa dipakai lagi" title={title} testId={titleTestId} detail={detail} /><div className="mb-5 flex gap-3"><div className="relative max-w-xl flex-1"><Search className="absolute left-3 top-2.5 text-muted-foreground" size={17} /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Cari ${plural}...`} className="bg-card pl-9" data-testid={`input-search-${kind}`} /></div><Button variant="outline" onClick={() => setNotice(`Penambahan ${singular} tersedia saat membuat proyek.`)} data-testid={`button-add-${kind}`}><Plus size={15} /> Tambah {singular}</Button></div>{notice && <div className="mb-5 flex items-center gap-2 rounded-lg border border-accent/25 bg-accent/5 px-4 py-3 text-xs text-muted-foreground" data-testid={`status-library-${kind}`}><CircleDot size={14} className="text-accent" /> {notice}<button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setNotice('')} aria-label="Tutup pemberitahuan" data-testid={`button-dismiss-${kind}-notice`}><X size={14} /></button></div>}{loading ? <Loading label={`Memuat ${plural}`} /> : error ? <ErrorState onRetry={() => { if (kind === 'assets') void assets.refetch(); if (kind === 'patterns') void patterns.refetch(); if (kind === 'recipes') void recipes.refetch(); }} /> : items.length === 0 ? <EmptyState icon={Library} title={`Belum ada ${plural}`} detail="Bahan yang bisa dipakai lagi akan muncul di sini seiring pabrik Anda berkembang." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => kind === 'assets' ? <AssetCard item={item as PstAsset} key={item.id} /> : kind === 'patterns' ? <PatternCard item={item as PstPattern} key={item.id} /> : <RecipeCard item={item as PstRecipe} key={item.id} />)}</div>}</div>;
}
function AssetCard({ item }: { item: PstAsset }) { return <Card className="group transition-all hover:border-primary/40 hover:shadow-md" data-testid={`card-asset-${item.id}`}><CardHeader className="pb-3"><div className="flex justify-between gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><Package size={17} /></div><StatusBadge value={item.status} /></div><CardTitle className="pt-2 text-base">{item.name}</CardTitle><CardDescription>{item.description}</CardDescription></CardHeader><CardContent><div className="flex flex-wrap gap-1.5">{item.tags?.map((tag) => <Badge variant="outline" className="text-[10px]" key={tag}>{tag}</Badge>)}</div><div className="mt-4 flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground"><span>{item.type}</span><span>v{item.version}</span></div></CardContent></Card>; }
function PatternCard({ item }: { item: PstPattern }) { return <Card className="transition-all hover:border-accent/50 hover:shadow-md" data-testid={`card-pattern-${item.id}`}><CardHeader><div className="flex justify-between"><div className="rounded-lg bg-accent/10 p-2 text-accent"><Workflow size={17} /></div><span className="font-mono text-[10px] uppercase text-muted-foreground">{item.usageCount} kali dipakai</span></div><CardTitle className="pt-2 text-base">{item.name}</CardTitle><CardDescription>{item.description}</CardDescription></CardHeader><CardContent><div className="space-y-1.5">{item.steps?.slice(0, 4).map((step, i) => <div className="flex gap-2 text-xs text-muted-foreground" key={step}><span className="font-mono text-accent">{i + 1}</span>{step}</div>)}</div>{item.projects?.length ? <p className="mt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Dipakai oleh {item.projects.map((project) => project.name).join(', ')}</p> : <p className="mt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Belum dipakai oleh proyek</p>}</CardContent></Card>; }
function RecipeCard({ item }: { item: PstRecipe }) { return <Card className="transition-all hover:border-amber-500/50 hover:shadow-md" data-testid={`card-recipe-${item.id}`}><CardHeader><div className="flex justify-between"><div className="rounded-lg bg-amber-500/10 p-2 text-amber-500"><FlaskConical size={17} /></div><span className="font-mono text-[10px] uppercase text-muted-foreground">{item.usageCount} kali dipakai</span></div><CardTitle className="pt-2 text-base">{item.name}</CardTitle><CardDescription>{item.description}</CardDescription></CardHeader><CardContent><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{item.components?.length ?? 0} komponen</p><div className="mt-2 flex flex-wrap gap-1.5">{item.components?.slice(0, 4).map((component) => <Badge variant="outline" className="text-[10px]" key={component}>{component}</Badge>)}</div>{item.projects?.length ? <p className="mt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Dipakai oleh {item.projects.map((project) => project.name).join(', ')}</p> : <p className="mt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Belum dipakai oleh proyek</p>}</CardContent></Card>; }

function CustomerWorkspace() {
  const { slug = '' } = useParams<{ slug: string }>();
  const workspaceQuery = useGetPublicPstWorkspace(slug, { query: { queryKey: getGetPublicPstWorkspaceQueryKey(slug) } });

  const [runtimeState, setRuntimeState] = useState<RuntimeUiState | null>(null);

  useEffect(() => {
    if (workspaceQuery.data?.definition) {
      const def = workspaceQuery.data.definition;
      const started = createPstRuntime(def);
      if (started.status === "READY") {
        setRuntimeState(advancePstRuntime(started.session));
      } else {
        setRuntimeState(started);
      }
    }
  }, [workspaceQuery.data?.definition]);

  if (workspaceQuery.isLoading) return <div className="flex min-h-[100dvh] items-center justify-center bg-[#07111d]"><Loading label="Menyiapkan workspace terpandu" /></div>;
  if (workspaceQuery.isError || !workspaceQuery.data) return <div className="flex min-h-[100dvh] items-center justify-center bg-[#07111d] p-6"><ErrorState onRetry={() => void workspaceQuery.refetch()} label="Workspace customer ini tidak tersedia" /></div>;

  const { project, definition } = workspaceQuery.data;

  if (!runtimeState) return <div className="flex min-h-[100dvh] items-center justify-center bg-[#07111d]"><Loading label="Memulai Runtime..." /></div>;

  return (
    <div className="min-h-[100dvh] bg-[#07111d] text-[#edf7ff] font-sans flex flex-col selection:bg-[#16d9f5]/30 selection:text-[#edf7ff]">
      <header className="flex h-[72px] items-center justify-between border-b border-[#2a4054]/60 px-6 backdrop-blur-xl bg-[#07111d]/90 sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80" data-testid="link-workspace-brand">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#16d9f5] text-[#07111d] font-mono font-bold">P</div>
            <span className="hidden sm:inline-block font-extrabold text-sm tracking-wide">PST Factory</span>
          </Link>
          <div className="h-4 w-px bg-[#2a4054]" />
          <span className="font-mono text-[10px] uppercase tracking-[.2em] text-[#91a9bd]">{project.name}</span>
        </div>
        <div className="flex items-center gap-3">
           <Badge variant="outline" className="font-mono text-[10px] border-[#16d9f5]/30 text-[#16d9f5] bg-[#16d9f5]/10">v{project.version}</Badge>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto p-5 py-8 md:p-10 lg:py-16 grid lg:grid-cols-[1fr_300px] gap-10 lg:gap-16">
        <div className="flex flex-col min-w-0">
          <div className="mb-10">
            <h1 className="text-3xl font-extrabold tracking-[-.04em] md:text-5xl text-[#edf7ff] mb-4">{project.desiredOutcome}</h1>
            <p className="text-base text-[#a9c1d3] max-w-2xl leading-relaxed">{project.description || project.problemStatement}</p>
          </div>

          <WorkspaceRuntime
            activeState={runtimeState}
            onAdvance={(next) => setRuntimeState(next)}
            onRestart={() => {
              if (definition) {
                const started = createPstRuntime(definition);
                if (started.status === "READY") {
                  setRuntimeState(advancePstRuntime(started.session));
                } else {
                  setRuntimeState(started);
                }
              }
            }}
          />
        </div>

        <aside className="hidden lg:block">
          <WorkspaceProgress state={runtimeState} />
        </aside>
      </main>
    </div>
  );
}

type RuntimeUiState = PstRuntimeAdvanceResultV1
  | Extract<PstRuntimeStartResultV1, { status: 'BLOCKED' }>;

function WorkspaceRuntime({ activeState, onAdvance, onRestart }: {
  activeState: RuntimeUiState;
  onAdvance: (state: PstRuntimeAdvanceResultV1) => void;
  onRestart: () => void;
}) {
  if (activeState.status === "BLOCKED") {
    return (
      <div className="animate-rise" data-testid="runtime-blocked">
        <div className="rounded-2xl border border-[#ff7184]/30 bg-[#ff7184]/10 p-8 shadow-xl">
          <div className="mx-auto w-12 h-12 bg-[#ff7184]/20 text-[#ff7184] rounded-full flex items-center justify-center mb-5">
            <TriangleAlert size={24} />
          </div>
          <h2 className="text-xl font-bold mb-2 text-center text-[#edf7ff]">Terjadi Kesalahan Runtime</h2>
          <p className="text-[#a9c1d3] text-sm mb-6 text-center">PST ini tidak dapat dilanjutkan karena ada masalah pada definisinya.</p>
          <div className="space-y-3 mb-8 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {activeState.errors.map((err: PstRuntimeDiagnosticV1, i: number) => (
              <div key={i} className="bg-[#101a2a] border border-[#ff7184]/20 p-4 rounded-xl font-mono text-xs text-[#ffb4be]">
                <div className="mb-2 pb-2 border-b border-[#ff7184]/20 flex justify-between items-start gap-4">
                  <span className="font-bold text-[#ff7184] bg-[#ff7184]/10 px-2 py-0.5 rounded">{err.code}</span>
                  <span className="opacity-70 break-all text-right">{err.path}</span>
                </div>
                <p className="leading-relaxed">{err.message}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-center">
            <Button onClick={onRestart} className="font-bold bg-[#2a4054] text-[#edf7ff] hover:bg-[#3b556e]" data-testid="button-restart">Mulai Ulang</Button>
          </div>
        </div>
      </div>
    );
  }

  if (activeState.status === "COMPLETED") {
    return (
      <div className="animate-rise" data-testid="runtime-completed">
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-8 md:p-12 shadow-2xl relative overflow-hidden">
          <div className="absolute -inset-24 bg-emerald-400/10 blur-[80px] pointer-events-none" />
          <div className="relative z-10 text-center">
            <div className="mx-auto w-20 h-20 bg-emerald-400/20 text-emerald-300 rounded-full flex items-center justify-center mb-6 ring-8 ring-emerald-400/10">
              <CheckCircle2 size={40} />
            </div>
            <h2 className="text-3xl font-extrabold tracking-[-.04em] mb-3 text-[#edf7ff]">Selesai</h2>
            <p className="text-[#a9c1d3] text-base mb-10 max-w-md mx-auto leading-relaxed">Anda telah menyelesaikan semua langkah. Berikut adalah hasil dari proses ini.</p>

            <div className="bg-[#101a2a] border border-[#2a4054] rounded-xl p-6 text-left mb-10 shadow-inner">
              <h3 className="font-mono text-[11px] uppercase tracking-widest text-[#6f8ca3] mb-5 flex items-center gap-2">
                <Database size={14} className="text-emerald-400" />
                Output Akhir
              </h3>
              {Object.keys(activeState.output).length === 0 ? (
                <p className="text-sm italic text-[#6f8ca3]">Tidak ada output yang dihasilkan.</p>
              ) : (
                <div className="space-y-6">
                  {Object.entries(activeState.output).map(([key, value]) => (
                    <div key={key}>
                      <p className="font-semibold text-sm mb-2 text-[#edf7ff]">{key}</p>
                      <pre className="text-xs p-4 rounded-lg bg-[#07111d] border border-[#2a4054] overflow-auto whitespace-pre-wrap text-[#a9c1d3] leading-relaxed shadow-inner">{JSON.stringify(value, null, 2)}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button onClick={onRestart} size="lg" className="font-bold gap-2 bg-[#16d9f5] text-[#07111d] hover:bg-[#72edff] transition-transform hover:-translate-y-0.5" data-testid="button-restart">
              <Rocket size={18} />
              Mulai Ulang Proses
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (activeState.status === "WAITING_INPUT") {
    return <WorkspaceStep step={activeState.step} session={activeState.session} onAdvance={onAdvance} />;
  }

  return null;
}

function WorkspaceStep({ step, session, onAdvance }: {
  step: PstRuntimeStepViewV1;
  session: PstRuntimeSessionV1;
  onAdvance: (state: PstRuntimeAdvanceResultV1) => void;
}) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    setFormData({});
    setErrors({});
    setIsTransitioning(false);
  }, [step.id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    let valid = true;

    const runtimeInput: PstRuntimeInputV1 = {};
    step.requiredInputs.forEach((input) => {
      if (input.required && (formData[input.key] === undefined || formData[input.key] === '')) {
        newErrors[input.key] = "Bidang ini wajib diisi";
        valid = false;
      } else if (input.type === 'json' && typeof formData[input.key] === 'string') {
        try {
          runtimeInput[input.key] = JSON.parse(formData[input.key] as string) as unknown;
        } catch {
          newErrors[input.key] = "Masukkan JSON yang valid";
          valid = false;
        }
      } else if (formData[input.key] !== undefined) {
        runtimeInput[input.key] = formData[input.key];
      }
    });

    setErrors(newErrors);
    if (!valid) return;

    setIsTransitioning(true);
    setTimeout(() => {
      const next = advancePstRuntime(session, runtimeInput);
      onAdvance(next);
    }, 250);
  };

  return (
    <div className={cn("transition-all duration-300", isTransitioning ? "opacity-0 translate-y-[-15px]" : "opacity-100 translate-y-0")} data-testid="runtime-input">
      <div className="mb-10">
        <Badge variant="outline" className="mb-5 text-[#16d9f5] border-[#16d9f5]/30 bg-[#16d9f5]/10 px-3 py-1 font-mono uppercase tracking-widest text-[10px]">Langkah saat ini</Badge>
        <h2 className="text-3xl font-extrabold tracking-[-.02em] mb-4 text-[#edf7ff]">{step.title}</h2>
        <p className="text-lg text-[#a9c1d3] leading-relaxed">{step.description}</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-[#101a2a] border border-[#2a4054] p-6 md:p-10 rounded-2xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#16d9f5] via-[#16d9f5]/50 to-transparent" />

        {step.requiredInputs.length === 0 ? (
          <div className="py-8 text-center">
            <div className="mx-auto w-12 h-12 bg-[#2a4054]/50 text-[#a9c1d3] rounded-full flex items-center justify-center mb-4">
              <Check size={20} />
            </div>
            <p className="text-[#a9c1d3] mb-2 text-sm font-semibold">Tidak ada input yang diperlukan.</p>
            <p className="text-[#6f8ca3] text-xs">Silakan lanjutkan ke langkah berikutnya.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {step.requiredInputs.map((input) => (
              <div key={input.key} className="space-y-3">
                <label className="text-sm font-bold text-[#edf7ff] flex items-center gap-2">
                  {input.label}
                  {input.required && <span className="text-[#ff7184] text-lg leading-none">*</span>}
                </label>
                {input.options ? (
                  <div className="relative">
                    <select
                      value={stringRuntimeField(formData, input.key)}
                      onChange={(e) => setFormData({ ...formData, [input.key]: e.target.value })}
                      className="flex h-12 w-full appearance-none rounded-xl border border-[#2a4054] bg-[#0b1421] px-4 py-2 text-sm text-[#edf7ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16d9f5]/50 focus-visible:border-[#16d9f5] disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-inner"
                      data-testid={`input-${input.key}`}
                    >
                      <option value="" disabled className="text-[#6f8ca3]">Pilih salah satu...</option>
                      {input.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <ChevronRight size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6f8ca3] rotate-90 pointer-events-none" />
                  </div>
                ) : input.type === 'number' ? (
                  <Input
                    type="number"
                    value={numberRuntimeField(formData, input.key)}
                    onChange={(e) => setFormData({
                      ...formData,
                      [input.key]: e.target.value === '' ? undefined : Number(e.target.value),
                    })}
                    className="h-12 rounded-xl border-[#2a4054] bg-[#0b1421] text-[#edf7ff] placeholder:text-[#6f8ca3] focus-visible:ring-[#16d9f5]/50 focus-visible:border-[#16d9f5] shadow-inner text-base"
                    placeholder="Masukkan angka..."
                    data-testid={`input-${input.key}`}
                  />
                ) : input.type === 'boolean' ? (
                  <label className="flex items-center gap-4 py-3 px-4 rounded-xl border border-[#2a4054] bg-[#0b1421] cursor-pointer hover:border-[#16d9f5]/50 transition-colors">
                    <div className="relative flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={formData[input.key] === true}
                        onChange={(e) => setFormData({ ...formData, [input.key]: e.target.checked })}
                        className="peer appearance-none w-6 h-6 rounded-md border-2 border-[#6f8ca3] bg-[#0b1421] checked:bg-[#16d9f5] checked:border-[#16d9f5] transition-colors cursor-pointer"
                        data-testid={`input-${input.key}`}
                      />
                      <Check size={14} strokeWidth={3} className="absolute text-[#07111d] opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" />
                    </div>
                    <span className="text-sm text-[#edf7ff] select-none font-medium">Ya, saya setuju</span>
                  </label>
                ) : input.type === 'date' ? (
                  <Input
                    type="date"
                    value={stringRuntimeField(formData, input.key)}
                    onChange={(e) => setFormData({ ...formData, [input.key]: e.target.value })}
                    className="h-12 rounded-xl border-[#2a4054] bg-[#0b1421] text-[#edf7ff] focus-visible:ring-[#16d9f5]/50 focus-visible:border-[#16d9f5] shadow-inner text-base"
                    data-testid={`input-${input.key}`}
                  />
                ) : (
                  <Textarea
                    value={stringRuntimeField(formData, input.key)}
                    onChange={(e) => setFormData({ ...formData, [input.key]: e.target.value })}
                    placeholder="Ketik jawaban Anda di sini..."
                    className="min-h-[140px] resize-y rounded-xl border-[#2a4054] bg-[#0b1421] text-[#edf7ff] placeholder:text-[#6f8ca3] focus-visible:ring-[#16d9f5]/50 focus-visible:border-[#16d9f5] shadow-inner text-base p-4"
                    data-testid={`input-${input.key}`}
                  />
                )}
                {errors[input.key] && (
                  <p className="text-xs font-bold text-[#ff7184] animate-rise flex items-center gap-1.5 mt-2">
                    <TriangleAlert size={12} /> {errors[input.key]}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="pt-8 mt-8 border-t border-[#2a4054] flex justify-end">
          <Button type="submit" size="lg" className="font-extrabold gap-2 px-8 bg-[#16d9f5] text-[#07111d] hover:bg-[#72edff] transition-transform hover:-translate-y-0.5" disabled={isTransitioning} data-testid="button-submit">
            {step.requiredInputs.length === 0 ? "Lanjut" : "Kirim & Lanjut"}
            <ArrowRight size={18} strokeWidth={2.5} />
          </Button>
        </div>
      </form>
    </div>
  );
}

function stringRuntimeField(values: Record<string, unknown>, key: string) {
  const value = values[key];
  return typeof value === 'string' ? value : '';
}

function numberRuntimeField(values: Record<string, unknown>, key: string) {
  const value = values[key];
  return typeof value === 'number' ? value : '';
}

function WorkspaceProgress({ state }: { state: RuntimeUiState | null }) {
  if (!state || state.status === "BLOCKED") return null;

  const session = state.session;
  if (!session) return null;

  const definition = session.definition;
  const steps = definition?.steps || [];

  const total = steps.length;
  const currentIndex = state.status === "COMPLETED"
    ? total
    : steps.findIndex((step: PstExecutableStepV1) => step.id === session.currentStepId);
  const progressPercent = total ? Math.round((Math.max(0, currentIndex) / total) * 100) : 0;

  return (
    <div className="sticky top-[100px]">
      <div className="rounded-2xl border border-[#2a4054] bg-[#101a2a] p-6 mb-8 shadow-lg">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#16d9f5] mb-2">Kemajuan</p>
        <div className="flex items-end gap-2 mb-4">
          <p className="text-3xl font-extrabold text-[#edf7ff] leading-none">{state.status === "COMPLETED" ? 100 : progressPercent}%</p>
          <p className="text-xs text-[#6f8ca3] font-mono uppercase pb-1">Selesai</p>
        </div>
        <div className="h-2 rounded-full bg-[#0b1421] overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-[#16d9f5]/50 to-[#16d9f5] transition-all duration-700 ease-out relative" style={{ width: `${state.status === "COMPLETED" ? 100 : progressPercent}%` }}>
            <div className="absolute top-0 right-0 bottom-0 w-10 bg-gradient-to-r from-transparent to-white/30" />
          </div>
        </div>
      </div>

      <div className="pl-2">
        <h3 className="font-mono text-[11px] uppercase tracking-[.2em] text-[#6f8ca3] mb-6">Peta Perjalanan</h3>
        <div className="space-y-1 relative before:absolute before:inset-0 before:ml-[15px] before:h-full before:w-px before:bg-gradient-to-b before:from-[#2a4054] before:via-[#2a4054] before:to-transparent">
          {steps.map((step: PstExecutableStepV1, idx: number) => {
            const isVisited = session.visitedStepIds.includes(step.id);
            const isCurrent = session.currentStepId === step.id && state.status !== "COMPLETED";
            const isCompleted = state.status === "COMPLETED";
            const isPast = isVisited && !isCurrent;

            let statusColor = "bg-[#0b1421] text-[#6f8ca3] border-[#2a4054]";
            let textColor = "text-[#6f8ca3]";

            if (isCurrent) {
              statusColor = "bg-[#16d9f5] text-[#07111d] border-[#16d9f5] ring-4 ring-[#16d9f5]/20";
              textColor = "text-[#edf7ff] font-bold";
            } else if (isPast || isCompleted) {
              statusColor = "bg-[#101a2a] text-[#16d9f5] border-[#16d9f5]/50";
              textColor = "text-[#a9c1d3]";
            }

            return (
              <div key={step.id} className="relative flex items-start gap-5 z-10 py-3">
                <div className={cn("w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-500", statusColor)}>
                  {(isPast || isCompleted) ? <Check size={14} strokeWidth={3} /> : <span className="text-[10px] font-bold font-mono">{idx + 1}</span>}
                </div>
                <div className="flex-1 pt-1.5 pb-2">
                  <p className={cn("text-sm transition-colors", textColor, !isCurrent && !isPast && !isCompleted && "opacity-50")}>{step.title}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Settings() {
  const [name, setName] = useState('PST factory');
  const [description, setDescription] = useState('Studio produk terarah untuk membuat solusi masalah yang hasilnya bisa diukur.');
  const [saved, setSaved] = useState(false);
  return <div className="mx-auto max-w-4xl"><PageIntro eyebrow="Pabrik / konfigurasi" title="Pengaturan" testId="heading-settings" detail="Atur cara studio produk bekerja dan siapa yang boleh membuat, memeriksa, atau menerbitkan PST." /><div className="grid gap-6 md:grid-cols-[180px_1fr]"><div className="space-y-1">{['Ruang kerja', 'Peran', 'Bawaan'].map((item, i) => <button className={cn('w-full rounded-lg px-3 py-2 text-left text-sm font-semibold', i === 0 ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')} onClick={() => setSaved(false)} key={item} data-testid={`button-settings-${['workspace', 'roles', 'defaults'][i]}`}>{item}</button>)}</div><div className="space-y-5"><Card><CardHeader><CardTitle className="text-base">Identitas ruang kerja</CardTitle><CardDescription>Nama dan keterangan yang dilihat tim Anda.</CardDescription></CardHeader><CardContent className="space-y-5"><Field label="Nama pabrik" value={name} onChange={setName} placeholder="" test="input-settings-name" /><Field label="Keterangan ruang kerja" value={description} onChange={setDescription} placeholder="" multiline test="input-settings-description" /><div className="flex items-center gap-3"><Button onClick={() => setSaved(true)} data-testid="button-save-settings"><Check size={15} /> Simpan pengaturan</Button>{saved && <span className="text-xs text-emerald-600 dark:text-emerald-300" data-testid="status-settings-saved">Pengaturan disimpan di perangkat ini</span>}</div></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Peran saat ini</CardTitle><CardDescription>Hak akses yang digunakan di ruang kerja ini.</CardDescription></CardHeader><CardContent><div className="flex items-center gap-3 rounded-lg border border-border p-4"><div className="grid h-9 w-9 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">MC</div><div><p className="text-sm font-semibold">Mara Chen</p><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Perancang produk · dapat merakit, menyetujui, menerbitkan</p></div></div></CardContent></Card></div></div></div>;
}

function AppRouter() {
  return <Shell><Switch><Route path="/" component={Dashboard} /><Route path="/projects" component={Projects} /><Route path="/create" component={Create} /><Route path="/projects/:projectId" component={ProjectWorkspace} /><Route path="/libraries/assets"><LibraryPage kind="assets" /></Route><Route path="/libraries/patterns"><LibraryPage kind="patterns" /></Route><Route path="/libraries/recipes"><LibraryPage kind="recipes" /></Route><Route path="/settings"><Settings /></Route><Route component={NotFound} /></Switch></Shell>;
}

function NotFound() { return <EmptyState icon={X} title="Rute tidak ditemukan" detail="Bagian pabrik ini tidak tersedia." action={<Link href="/" className="mt-5 text-sm font-bold text-primary" data-testid="link-not-found-home">Kembali ke pabrik</Link>} />; }

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
  return (
    <main className="min-h-[100dvh] overflow-x-hidden bg-[#030910] text-[#edf7ff] font-sans selection:bg-[#16d9f5]/30 selection:text-white">
      <div className="absolute inset-0 z-0 opacity-40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(22,217,245,.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.02)_1px,transparent_1px)] bg-[size:auto,48px_48px,48px_48px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-7xl flex-col px-6 sm:px-10 lg:px-12">
        <header className="flex flex-col items-stretch gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="focus-ring block w-full max-w-[420px] shrink-0 rounded-xl sm:w-auto sm:max-w-none" data-testid="link-public-logo">
            <img src={`${basePath}/logo.svg`} alt="PST Factory" className="h-auto w-full sm:h-28 sm:w-auto" />
          </Link>
          <nav className="flex items-center justify-end gap-2">
            <Link href="/video" className="focus-ring hidden rounded-lg px-4 py-2.5 text-sm font-semibold text-[#a9c1d3] transition-colors hover:text-[#edf7ff] sm:inline-flex" data-testid="link-process-film">Film proses</Link>
            <Link href="/sign-in" className="focus-ring rounded-lg px-4 py-2.5 text-sm font-semibold text-[#a9c1d3] transition-colors hover:text-[#edf7ff]" data-testid="link-sign-in">Masuk</Link>
            <Link href="/sign-up" className="focus-ring rounded-lg border border-[#16d9f5]/50 bg-[#16d9f5] px-4 py-2.5 text-sm font-bold text-[#030910] transition-colors hover:bg-[#72edff]" data-testid="link-sign-up">Buat akun</Link>
          </nav>
        </header>

        <div className="flex-1 pb-24 pt-16 sm:pt-24 lg:pt-32">
          {/* Attention */}
          <section className="mx-auto max-w-4xl text-center">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#16d9f5]/20 bg-[#16d9f5]/5 px-4 py-1.5 font-mono text-xs font-medium text-[#16d9f5] animate-rise">
              <span className="h-1.5 w-1.5 rounded-full bg-[#16d9f5] shadow-[0_0_12px_#16d9f5]" />
              Studio produk untuk membuat solusi nyata
            </div>
            <h1 className="text-balance text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-7xl lg:text-8xl animate-rise-2">
              Ubah masalah menjadi <span className="text-[#16d9f5]">solusi siap pakai.</span>
            </h1>
            <p className="mx-auto mt-8 max-w-2xl text-balance text-lg leading-relaxed text-[#91a9bd] animate-rise-3">
              Ide yang berserakan tidak menghasilkan kemajuan. PST Factory menyatukan kebingungan menjadi arah yang jelas — dari penjelasan awal hingga ruang kerja yang terstruktur dan siap digunakan.
            </p>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row animate-rise-3" style={{ animationDelay: '0.24s' }}>
              <Link href="/sign-up" className="focus-ring group flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#16d9f5] px-8 text-base font-bold text-[#030910] transition-all hover:bg-[#72edff] hover:shadow-[0_0_32px_rgba(22,217,245,0.4)] sm:w-auto" data-testid="button-hero-sign-up">
                Mulai membuat solusi
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/video" className="focus-ring group flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-[#2a4054] bg-[#101a2a] px-8 text-base font-bold text-[#edf7ff] transition-colors hover:border-[#16d9f5]/50 hover:bg-[#16273a] sm:w-auto" data-testid="button-hero-video">
                <Rocket size={18} className="text-[#16d9f5]" /> Lihat cara kerjanya
              </Link>
            </div>
            <div className="mt-14 flex flex-wrap justify-center gap-x-8 gap-y-3 font-mono text-[10px] uppercase tracking-[.16em] text-[#6f8ca3] animate-rise-3">
              <span>Masalah → Rancangan</span>
              <span>Rancangan → Perakitan</span>
              <span>Perakitan → Periksa</span>
              <span>Periksa → Terbitkan</span>
            </div>
          </section>

          {/* Interest */}
          <section className="mt-32 sm:mt-48 lg:mt-56">
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-24">
              <div className="relative order-2 lg:order-1">
                <div className="absolute -inset-10 rounded-full bg-[#16d9f5]/5 blur-3xl" />
                <div className="relative rounded-2xl border border-[#2a4054] bg-[#0d1522] p-6 shadow-2xl sm:p-8">
                  <div className="mb-6 flex items-center justify-between border-b border-[#1f3143] pb-4">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-[#91a9bd]">Tahap Awal</p>
                      <p className="mt-1 text-base font-bold text-[#edf7ff]">Rancangan Solusi</p>
                    </div>
                    <FileCode2 className="text-[#16d9f5]" size={24} />
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-xl border border-[#1f3143] bg-[#142031] p-4 transition-colors hover:border-[#16d9f5]/40">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#16d9f5]/10 text-[#16d9f5]">
                          <Check size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#edf7ff]">Pernyataan masalah</p>
                          <p className="text-sm text-[#91a9bd]">Tajam dan dapat diamati.</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#1f3143] bg-[#142031] p-4 transition-colors hover:border-[#16d9f5]/40">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#16d9f5]/10 text-[#16d9f5]">
                          <Check size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#edf7ff]">Pola kerja</p>
                          <p className="text-sm text-[#91a9bd]">Pilihan terpandu yang aman.</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#1f3143] bg-[#142031] p-4 transition-colors hover:border-[#16d9f5]/40">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#16d9f5]/10 text-[#16d9f5]">
                          <Check size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#edf7ff]">Pengguna</p>
                          <p className="text-sm text-[#91a9bd]">Peran yang akan menggunakan alat.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="order-1 lg:order-2">
                <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                  Dari kekacauan menuju kejelasan.
                </h2>
                <p className="mt-6 text-lg leading-relaxed text-[#91a9bd]">
                  Setiap masalah yang rumit dipecah menjadi komponen dasar yang bisa dikelola. PST Factory memaksa Anda untuk memikirkan ulang keluhan sebagai pola yang dapat diamati dan ditindaklanjuti, menciptakan fondasi kuat sebelum pembuatan alat dimulai.
                </p>
                <ul className="mt-8 space-y-4">
                  <li className="flex gap-4">
                    <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#16d9f5]/20 text-[#16d9f5]">
                      <ArrowRight size={14} />
                    </div>
                    <div>
                      <strong className="block text-[#edf7ff]">Amati sinyal</strong>
                      <span className="text-[#91a9bd]">Kumpulkan bukti yang tersebar di lapangan.</span>
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#16d9f5]/20 text-[#16d9f5]">
                      <ArrowRight size={14} />
                    </div>
                    <div>
                      <strong className="block text-[#edf7ff]">Beri bentuk pada masalah</strong>
                      <span className="text-[#91a9bd]">Tentukan target dan arah perbaikan yang terukur.</span>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Desire */}
          <section className="mt-32 sm:mt-48 lg:mt-56">
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-24">
              <div>
                <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                  Bukan sekadar dokumen. <span className="text-[#16d9f5]">Sebuah ruang kerja.</span>
                </h2>
                <p className="mt-6 text-lg leading-relaxed text-[#91a9bd]">
                  Setiap masalah yang selesai dirancang akan dirakit menjadi ruang kerja interaktif. Dengan menggunakan komponen siap pakai dan pola pengalaman yang konsisten, pengguna akhir Anda akan dipandu langkah demi langkah menuju hasil yang dapat dipertanggungjawabkan.
                </p>
                <div className="mt-8 flex flex-col gap-4">
                  <div className="flex items-start gap-4 rounded-xl border border-[#2a4054] bg-[#0d1522] p-5 transition-colors hover:border-[#16d9f5]/50">
                    <div className="rounded-lg bg-[#16d9f5]/10 p-2 text-[#16d9f5]">
                      <LayoutDashboard size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-[#edf7ff]">Antarmuka interaktif</h4>
                      <p className="mt-1 text-sm text-[#91a9bd]">Ruang kerja yang memandu dan merespons pilihan pengguna.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 rounded-xl border border-[#2a4054] bg-[#0d1522] p-5 transition-colors hover:border-[#16d9f5]/50">
                    <div className="rounded-lg bg-[#16d9f5]/10 p-2 text-[#16d9f5]">
                      <Workflow size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-[#edf7ff]">Bahan yang bisa dipakai lagi</h4>
                      <p className="mt-1 text-sm text-[#91a9bd]">Pola dan komponen yang mempercepat perakitan PST berikutnya.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="relative">
                <div className="absolute -inset-10 rounded-full bg-[#16d9f5]/5 blur-3xl" />
                <div className="relative overflow-hidden rounded-2xl border border-[#2a4054] bg-[#0d1522] shadow-2xl">
                  <div className="flex items-center gap-2 border-b border-[#1f3143] bg-[#0a101a] px-4 py-3">
                    <div className="flex gap-1.5">
                      <span className="h-3 w-3 rounded-full bg-[#2a4054]" />
                      <span className="h-3 w-3 rounded-full bg-[#2a4054]" />
                      <span className="h-3 w-3 rounded-full bg-[#2a4054]" />
                    </div>
                    <div className="mx-auto flex h-6 w-1/2 items-center justify-center rounded bg-[#142031] font-mono text-[10px] text-[#91a9bd]">
                      ruang-kerja / kejernihan-arus-kas
                    </div>
                  </div>
                  <div className="flex h-[320px]">
                    <div className="flex w-16 flex-col items-center gap-4 border-r border-[#1f3143] bg-[#0a101a] py-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-[#16d9f5]/20 font-bold text-[#16d9f5]">P</div>
                      <span className="h-8 w-8 rounded border border-[#2a4054]" />
                      <span className="h-8 w-8 rounded border border-[#2a4054]" />
                    </div>
                    <div className="flex-1 p-6">
                      <div className="mb-6 flex gap-2">
                        <span className="h-1.5 flex-1 rounded-full bg-[#16d9f5]" />
                        <span className="h-1.5 flex-1 rounded-full bg-[#2a4054]" />
                        <span className="h-1.5 flex-1 rounded-full bg-[#2a4054]" />
                      </div>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-[#16d9f5]">Tahap Utama</p>
                      <h3 className="mt-2 text-2xl font-bold">Apa yang berubah hari ini?</h3>
                      <p className="mt-2 text-sm text-[#91a9bd]">Pilih sinyal pengamatan sebelum memberikan tindakan.</p>
                      <div className="mt-6 space-y-3">
                        <div className="flex h-12 items-center justify-between rounded-lg border border-[#16d9f5] bg-[#16d9f5]/10 px-4">
                          <span className="font-semibold text-[#edf7ff]">Pendapatan bertambah</span>
                          <CheckCircle2 className="text-[#16d9f5]" size={18} />
                        </div>
                        <div className="flex h-12 items-center rounded-lg border border-[#2a4054] bg-[#142031] px-4 opacity-50">
                          <span className="font-semibold text-[#edf7ff]">Biaya berkurang</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Action */}
          <section className="mt-32 sm:mt-48 lg:mt-56 text-center">
            <div className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl border border-[#2a4054] bg-[#0d1522] p-8 shadow-2xl sm:p-16">
              <div className="absolute -inset-24 opacity-20">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(22,217,245,1),transparent_70%)]" />
              </div>
              <div className="relative z-10">
                <h2 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
                  Siap membangun alat bantu pertama Anda?
                </h2>
                <p className="mx-auto mt-6 max-w-xl text-lg text-[#91a9bd]">
                  PST Factory adalah tempat Anda mulai memetakan, merakit, dan menerbitkan solusi yang benar-benar bisa digunakan oleh tim Anda.
                </p>
                <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <Link href="/sign-up" className="focus-ring group flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#16d9f5] px-8 text-base font-bold text-[#030910] transition-all hover:bg-[#72edff] hover:shadow-[0_0_32px_rgba(22,217,245,0.4)] sm:w-auto" data-testid="link-cta-sign-up">
                    Buat akun pabrik
                    <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className="flex flex-col items-center justify-between gap-6 border-t border-[#1f3143] py-8 sm:flex-row">
          <div className="flex items-center gap-2">
            <img src={`${basePath}/logo.svg`} alt="PST Factory" className="h-6 w-auto opacity-50 grayscale" />
            <span className="font-mono text-xs text-[#5c778c]">© PST Factory Studio</span>
          </div>
          <div className="flex font-mono text-xs uppercase tracking-widest text-[#5c778c]">
            Dibuat untuk kemajuan
          </div>
        </footer>
      </div>
    </main>
  );
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
       signIn: { start: { title: 'Selamat datang kembali di PST Factory', subtitle: 'Masuk untuk terus membangun solusi masalah yang siap diluncurkan.' } },
       signUp: { start: { title: 'Buat akun pabrik Anda', subtitle: 'Mulai ubah masalah nyata menjadi alat yang dapat digunakan kembali.' } },
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
         <Route path="/video" component={PSTFactoryVideo} />
        <Route path="/factory/*?" component={ProtectedApp} />
        <Route><Redirect to="/" /></Route>
      </Switch>
    </QueryClientProvider>
  </ClerkProvider>;
}

export default function App() {
  return <WouterRouter base={basePath}><TooltipProvider><ErrorBoundary><AuthRoutes /></ErrorBoundary><Toaster /></TooltipProvider></WouterRouter>;
}