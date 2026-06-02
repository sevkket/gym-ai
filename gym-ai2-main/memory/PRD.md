# KUVVET.AI - Yapay Zeka Destekli Spor Salonu Platformu

## Problem Statement
Kullanıcı talebi: "ai destekli bir spor salonu sitesi yapmak istiyorum"

## Seçimler
- AI Özellikleri: Vücut analizi, AI chatbot koç, Beslenme planı, Antrenman programı
- Model: GPT-5.2 (EMERGENT_LLM_KEY)
- Tip: Tam platform (JWT auth + dashboard + AI araçları)
- Tasarım: Koyu & enerjik (Kırmızı #FF3B30, Bebas Neue + Manrope)
- Dil: Türkçe (URL'ler dahil)

## Mimari (Minimalist - 5 ana dosya)
- `/app/backend/server.py` — tüm API (auth, AI, plans)
- `/app/backend/.env` — MONGO_URL, EMERGENT_LLM_KEY, JWT_SECRET
- `/app/frontend/src/App.js` — tüm sayfalar, auth, navbar
- `/app/frontend/src/index.css` — tüm stiller (Bebas Neue, Manrope)
- `/app/frontend/src/index.js` — giriş noktası

## Uygulananlar (2026-02)
- JWT kayıt/giriş (bcrypt), /api/auth/{register,login,me}
- AI endpoints (GPT-5.2): /api/ai/workout, /ai/diet, /ai/body-analysis, /ai/chat
- Plan geçmişi: /api/plans, /api/plans/{id}
- Ön yüz: Anasayfa, /giris, /kayit, /panel, /antrenman, /beslenme, /vucut-analizi, /koc, /profil
- Koyu tema, Bebas Neue başlıklar, kırmızı aksan
- Türkçe marka: KUVVET.AI

## Backlog (P1)
- Plan PDF/export
- Antrenman ilerleme takibi (haftalık log)
- Stripe ile ATLET/ELİT üyelik ödemesi
- E-posta doğrulama
- Admin paneli
