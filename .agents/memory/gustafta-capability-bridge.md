---
name: Gustafta capability bridge
description: Batas adopsi Gustafta yang disetujui untuk PST Factory.
---

PST Factory cukup mengadopsi capability publik Gustafta yang relevan melalui tautan resmi. API key, sinkronisasi server-to-server, dan pengiriman data PST bukan prasyarat.

**Why:** Kontrak API dan autentikasi resmi Gustafta belum tersedia; memaksa integrasi langsung akan menciptakan ketergantungan dan risiko data yang tidak perlu.

**How to apply:** Pertahankan adapter backend provider-neutral/mock dan gunakan deep link publik untuk capability yang relevan. Jangan menebak endpoint dari bundle frontend.