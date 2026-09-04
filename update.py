import sys

def main():
    with open('artifacts/pst-factory/src/App.tsx', 'r') as f:
        lines = f.readlines()
    
    start_idx = -1
    end_idx = -1
    for i, line in enumerate(lines):
        if line.startswith('function PublicHome() {'):
            start_idx = i
        if start_idx != -1 and line.startswith('function ProtectedApp() {'):
            end_idx = i
            break
            
    if start_idx == -1 or end_idx == -1:
        print("Could not find boundaries")
        return
        
    new_home = """function PublicHome() {
  return (
    <main className="min-h-[100dvh] overflow-x-hidden bg-[#030910] text-[#edf7ff] font-sans selection:bg-[#16d9f5]/30 selection:text-[#030910]">
      {/* Background grids and lights */}
      <div className="pointer-events-none fixed inset-0 z-0 flex justify-center">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:linear-gradient(to_bottom,white,transparent)]" />
        <div className="absolute top-0 h-[600px] w-[800px] rounded-full bg-[#16d9f5]/10 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-[1400px] flex-col px-6 lg:px-12">
        <header className="flex h-24 items-center justify-between border-b border-[#2a4054]/50">
          <Link href="/" className="focus-ring block w-40 shrink-0 lg:w-48" data-testid="link-public-logo">
            <img src={`${basePath}/logo.svg`} alt="PST Factory" className="h-auto w-full" />
          </Link>
          <nav className="flex items-center gap-4 lg:gap-8">
            <Link href="/video" className="focus-ring hidden text-sm font-semibold tracking-wide text-[#91a9bd] transition-colors hover:text-[#16d9f5] md:block" data-testid="link-process-film">
              Film proses
            </Link>
            <div className="flex items-center gap-3">
              <Link href="/sign-in" className="focus-ring hidden rounded-lg px-4 py-2.5 text-sm font-bold text-[#edf7ff] transition-colors hover:bg-[#ffffff0a] md:block" data-testid="link-sign-in">
                Masuk
              </Link>
              <Link href="/sign-up" className="focus-ring rounded-lg border border-[#16d9f5]/30 bg-[#16d9f5]/10 px-5 py-2.5 text-sm font-bold text-[#16d9f5] shadow-[0_0_20px_rgba(22,217,245,0.1)] transition-all hover:bg-[#16d9f5] hover:text-[#030910]" data-testid="link-sign-up">
                Akses Pabrik
              </Link>
            </div>
          </nav>
        </header>

        <div className="flex-1 pb-32">
          {/* Hero Section */}
          <section className="mt-20 lg:mt-32">
            <div className="grid gap-16 lg:grid-cols-[1fr_0.8fr] lg:items-center">
              <div className="max-w-3xl">
                <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-[#2a4054] bg-[#101a2a] px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-[#91a9bd] animate-rise">
                  <span className="h-2 w-2 rounded-full bg-[#16d9f5] shadow-[0_0_8px_#16d9f5]" />
                  Untuk Operator & Pakar Domain
                </div>
                <h1 className="text-balance text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl animate-rise-2">
                  Ubah keahlian diam menjadi <span className="text-[#16d9f5]">alur kerja digital.</span>
                </h1>
                <p className="mt-8 max-w-2xl text-lg leading-relaxed text-[#91a9bd] animate-rise-3">
                  Berhenti mengandalkan memori pakar dan dokumen yang berserakan. PST Factory membantu Anda merangkai metode penyelesaian masalah operasional menjadi alur kerja yang terstruktur, dapat diuji, dan selalu konsisten setiap kali digunakan.
                </p>
                <div className="mt-10 flex flex-col gap-4 sm:flex-row animate-rise-3" style={{ animationDelay: '0.15s' }}>
                  <Link href="/sign-up" className="focus-ring group inline-flex h-14 items-center justify-center gap-3 rounded-xl bg-[#16d9f5] px-8 text-sm font-extrabold text-[#030910] shadow-[0_0_30px_rgba(22,217,245,0.3)] transition-all hover:bg-[#72edff] sm:w-auto" data-testid="button-hero-sign-up">
                    Mulai Merakit Alur
                    <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link href="/video" className="focus-ring group inline-flex h-14 items-center justify-center gap-3 rounded-xl border border-[#2a4054] bg-[#101a2a] px-8 text-sm font-bold text-[#edf7ff] transition-all hover:border-[#16d9f5]/50 hover:bg-[#16273a] sm:w-auto" data-testid="button-hero-video">
                    <Rocket size={18} className="text-[#16d9f5]" />
                    Lihat Cara Kerja
                  </Link>
                </div>
              </div>

              {/* Hero visual representation of a messy to clean state */}
              <div className="relative mx-auto w-full max-w-[500px] lg:mx-0 animate-rise-3" style={{ animationDelay: '0.2s' }}>
                <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-[#16d9f5]/20 to-transparent opacity-50 blur-2xl" />
                <div className="relative rounded-2xl border border-[#2a4054] bg-[#0b121c] p-6 shadow-2xl overflow-hidden">
                  <div className="absolute top-0 right-0 p-4">
                    <div className="font-mono text-[9px] text-[#2a4054] uppercase tracking-widest">System_State</div>
                  </div>
                  <div className="space-y-6">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-[#ff7184] mb-3 flex items-center gap-2"><X size={12}/> Kondisi Manual</p>
                      <div className="flex flex-wrap gap-2 opacity-60">
                        <div className="h-8 w-24 rounded border border-[#2a4054] bg-[#101a2a]" />
                        <div className="h-8 w-32 rounded border border-[#2a4054] bg-[#101a2a]" />
                        <div className="h-8 w-16 rounded border border-[#2a4054] bg-[#101a2a]" />
                        <div className="h-8 w-28 rounded border border-[#2a4054] bg-[#101a2a]" />
                        <div className="h-8 w-20 rounded border border-[#2a4054] bg-[#101a2a]" />
                      </div>
                    </div>
                    
                    <div className="flex justify-center border-y border-[#2a4054]/50 py-3">
                      <div className="h-6 w-px bg-gradient-to-b from-[#16d9f5]/0 via-[#16d9f5] to-[#16d9f5]/0" />
                    </div>

                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-[#16d9f5] mb-3 flex items-center gap-2"><Check size={12}/> PST Executable</p>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 rounded-lg border border-[#16d9f5]/30 bg-[#16d9f5]/10 px-4 py-2.5">
                          <CircleDot size={14} className="text-[#16d9f5]" />
                          <div className="h-2 w-3/4 rounded bg-[#16d9f5]/40" />
                        </div>
                        <div className="flex items-center gap-3 rounded-lg border border-[#2a4054] bg-[#101a2a] px-4 py-2.5 ml-6">
                          <ArrowRight size={14} className="text-[#91a9bd]" />
                          <div className="h-2 w-1/2 rounded bg-[#2a4054]" />
                        </div>
                        <div className="flex items-center gap-3 rounded-lg border border-[#2a4054] bg-[#101a2a] px-4 py-2.5 ml-12">
                          <CheckCircle2 size={14} className="text-[#91a9bd]" />
                          <div className="h-2 w-1/3 rounded bg-[#2a4054]" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Identity Statement */}
          <section className="mt-32 border-y border-[#2a4054]/50 bg-[#070c14] py-24 sm:mt-48">
            <div className="mx-auto max-w-4xl text-center">
              <h2 className="text-3xl font-extrabold tracking-tight text-[#edf7ff] sm:text-5xl">Bukan pembuat aplikasi generik.</h2>
              <p className="mt-6 text-xl leading-relaxed text-[#91a9bd]">
                PST Factory dibuat khusus untuk prosedur yang ruwet—keputusan berulang yang butuh akurasi tinggi. Kami tidak membuat chatbot, tidak membuat generator dokumen acak, dan tidak membuat manajer proyek kosong. Kami membangun <strong>Problem-Solving Toolkits</strong>.
              </p>
            </div>
          </section>

          {/* What is a PST? */}
          <section className="mt-32 sm:mt-48" data-testid="section-workflow-explanation">
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-24">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 text-[#16d9f5]">
                  <Database size={20} />
                  <span className="font-mono text-xs uppercase tracking-widest">Anatomi Toolkit</span>
                </div>
                <h2 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
                  Apa itu Problem-Solving Toolkit (PST)?
                </h2>
                <p className="mt-6 text-lg leading-relaxed text-[#91a9bd]">
                  PST adalah panduan digital yang deterministik. Ia mengambil input yang terstruktur, menjalankan logika bisnis yang telah Anda tentukan, dan menghasilkan output keputusan operasional yang bisa dieksekusi secara instan.
                </p>
                <ul className="mt-10 flex flex-col gap-6">
                  {[
                    { title: "Input Terpandu", desc: "Tidak ada layar kosong. Pengguna menjawab variabel spesifik yang dibutuhkan untuk mengambil keputusan.", icon: ArrowRight },
                    { title: "Logika Tetap", desc: "Keahlian Anda dikodekan ke dalam sistem—mengurangi deviasi manual dan keputusan impulsif.", icon: Workflow },
                    { title: "Output Terukur", desc: "Setiap sesi menghasilkan rekam jejak. Bisa diaudit, bisa diuji kembali, dan selalu konsisten.", icon: CheckCircle2 }
                  ].map((item, idx) => (
                    <li key={idx} className="flex gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#101a2a] border border-[#2a4054] text-[#16d9f5]">
                        <item.icon size={18} />
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-[#edf7ff]">{item.title}</h4>
                        <p className="mt-1 text-sm text-[#91a9bd]">{item.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { title: "Definisi Masalah", detail: "Batasi cakupan operasional.", icon: Target },
                  { title: "Rancangan Arsitektur", detail: "Petakan logika dan langkah penyelesaian.", icon: FileCode2 },
                  { title: "Perakitan Toolkit", detail: "Ubah komponen menjadi antarmuka yang membimbing.", icon: Hammer },
                  { title: "Publikasi", detail: "Uji dan terbitkan versi rilis ke lapangan.", icon: Rocket },
                ].map(({ title, detail, icon: Icon }, index) => (
                  <div key={title} className="group relative rounded-2xl border border-[#2a4054] bg-[#0b121c] p-6 transition-all hover:border-[#16d9f5]/50" data-testid={`card-workflow-${index}`}>
                    <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-[#101a2a] text-[#16d9f5] border border-[#2a4054] transition-colors group-hover:bg-[#16d9f5]/10 group-hover:border-[#16d9f5]/30">
                      <Icon size={22} />
                    </div>
                    <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#91a9bd] mb-2">Langkah {index + 1}</h3>
                    <h4 className="text-lg font-bold text-[#edf7ff] mb-2">{title}</h4>
                    <p className="text-sm text-[#6f8ca3] leading-relaxed">{detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Value Props / Audience */}
          <section className="mt-32 sm:mt-48" data-testid="section-audience-value">
            <div className="mb-16 text-center">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">Metodologi yang dikemas menjadi sistem.</h2>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-[#91a9bd]">PST Factory mendigitalkan keahlian lapangan menjadi alat bantu harian.</p>
            </div>
            
            <div className="grid gap-6 md:grid-cols-3">
              {[
                { id: 'operator', role: 'Operator Lapangan', title: 'Eksekusi Tanpa Ragu', detail: 'Saat terjadi krisis operasional, operator tidak perlu menebak. PST memberikan instruksi langkah-demi-langkah sesuai prosedur.', icon: Gauge },
                { id: 'consultant', role: 'Konsultan & Spesialis', title: 'Skalakan Metodologi', detail: 'Ubah kerangka kerja manual Anda di spreadsheet menjadi aplikasi mandiri yang bisa didistribusikan ke klien tanpa kehadiran Anda secara fisik.', icon: BriefcaseBusiness },
                { id: 'expert', role: 'Pakar Domain', title: 'Warisan Pengetahuan', detail: 'Cegah hilangnya ilmu saat karyawan senior pergi. Ekstrak memori pakar ke dalam toolkit sistematis yang awet.', icon: Database },
              ].map(({ id, role, title, detail, icon: Icon }) => (
                <div key={id} className="relative overflow-hidden rounded-2xl border border-[#2a4054] bg-[#0b121c] p-8" data-testid={`card-audience-${id}`}>
                  <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-[#16d9f5]/5 blur-2xl" />
                  <Icon size={28} className="text-[#16d9f5] mb-6" />
                  <p className="font-mono text-[10px] uppercase tracking-widest text-[#91a9bd] mb-2">{role}</p>
                  <h3 className="text-xl font-bold text-[#edf7ff] mb-4">{title}</h3>
                  <p className="text-sm leading-relaxed text-[#6f8ca3]">{detail}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Detail: Reusability */}
          <section className="mt-32 sm:mt-48" data-testid="section-product-value">
             <div className="relative overflow-hidden rounded-3xl border border-[#2a4054] bg-[#0b121c] p-8 sm:p-16 lg:p-20">
               <div className="absolute right-0 top-0 h-[500px] w-[500px] translate-x-1/3 -translate-y-1/3 rounded-full bg-[#16d9f5]/5 blur-[100px]" />
               
               <div className="grid gap-12 lg:grid-cols-2 lg:items-center relative z-10">
                 <div>
                   <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">Hasilnya dapat digunakan ulang.</h2>
                   <p className="mt-6 text-lg leading-relaxed text-[#91a9bd]">
                     Anda tidak membangun aplikasi sekali pakai. Setiap toolkit, pola, dan resep yang Anda ciptakan masuk ke dalam pustaka aset Anda—siap digabungkan dengan solusi baru di masa depan.
                   </p>
                   <Link href="/video" className="focus-ring mt-10 inline-flex h-12 items-center justify-center gap-3 rounded-xl bg-[#101a2a] border border-[#2a4054] px-6 text-sm font-bold text-[#edf7ff] transition-all hover:border-[#16d9f5]/50 hover:bg-[#16273a]" data-testid="link-product-value-video">
                     <FileSearch size={16} className="text-[#16d9f5]" />
                     Jelajahi Pustaka Aset
                   </Link>
                 </div>
                 
                 <div className="grid gap-4 sm:grid-cols-2">
                   {[
                     { title: "Jejak Audit", detail: "Semua keputusan tercatat.", icon: Activity },
                     { title: "Pola Modular", detail: "Alur kerja yang bisa dibagikan.", icon: Box },
                     { title: "Pengembangan Cepat", detail: "Rakit tanpa mulai dari nol.", icon: Sparkles },
                     { title: "Standar Terpusat", detail: "Satu sumber kebenaran operasional.", icon: Library }
                   ].map(({ title, detail, icon: Icon }) => (
                     <div key={title} className="rounded-xl border border-[#2a4054] bg-[#070c14] p-5" data-testid={`card-product-value-${title.toLowerCase().replaceAll(' ', '-')}`}>
                       <Icon size={20} className="text-[#16d9f5] mb-4" />
                       <h4 className="text-sm font-bold text-[#edf7ff] mb-1">{title}</h4>
                       <p className="text-xs text-[#6f8ca3]">{detail}</p>
                     </div>
                   ))}
                 </div>
               </div>
             </div>
          </section>

          {/* Final CTA */}
          <section className="mt-32 mb-16 text-center sm:mt-48">
            <h2 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
              Tertibkan operasi Anda hari ini.
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-[#91a9bd]">
              PST Factory merampingkan proses yang kacau menjadi sistem digital yang terpandu. Berhenti memecahkan masalah yang sama dua kali.
            </p>
            <div className="mt-12 flex justify-center">
              <Link href="/sign-up" className="focus-ring group inline-flex h-16 items-center justify-center gap-3 rounded-2xl bg-[#16d9f5] px-10 text-base font-extrabold text-[#030910] shadow-[0_0_40px_rgba(22,217,245,0.25)] transition-all hover:-translate-y-1 hover:bg-[#72edff] hover:shadow-[0_0_60px_rgba(22,217,245,0.4)]" data-testid="link-cta-sign-up">
                Akses Pabrik Sekarang
                <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </section>
        </div>

        <footer className="flex flex-col items-center justify-between gap-6 border-t border-[#2a4054]/50 py-10 sm:flex-row">
          <div className="flex items-center gap-3">
            <img src={`${basePath}/logo.svg`} alt="PST Factory" className="h-6 w-auto opacity-50 grayscale" />
            <span className="font-mono text-xs text-[#5c778c]">© PST Factory</span>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#5c778c]">
            Structured Problem Solving
          </div>
        </footer>
      </div>
    </main>
  );
}
"""
    
    lines[start_idx:end_idx] = [new_home + "\n"]
    
    with open('artifacts/pst-factory/src/App.tsx', 'w') as f:
        f.writelines(lines)
        
    print("Replaced successfully.")

if __name__ == '__main__':
    main()
