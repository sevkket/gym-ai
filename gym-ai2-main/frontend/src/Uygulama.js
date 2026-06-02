// ============================================================================
// KUVVET.AI - Yapay Zeka Destekli Spor Salonu Uygulaması
// ============================================================================
// Bu dosya React uygulamasının tamamını içerir:
// - Oturum yönetimi (giriş, kayıt, çıkış, JWT token saklama)
// - Sayfalar (anasayfa, panel, antrenman, beslenme, vücut analizi, koç vb.)
// - Yardımcı bileşenler (üst menü, form alanı, markdown gösterici, PDF indirme)
// ============================================================================

import { useEffect, useState, useRef, createContext, useContext } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate, useLocation } from "react-router-dom";
import { Toaster, toast } from "sonner";
import axios from "axios";
import { Dumbbell, LogOut, User, ArrowRight, Zap, Brain, Apple, MessageSquare, Target, ArrowUpRight, Send, Loader2, Download, TrendingUp, Trash2, Plus, Mail, Shield, X, Users, Inbox, BarChart3, KeyRound, ChevronRight } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import "@/index.css";

// ----------------------------------------------------------------------------
// API AYARLARI
// ----------------------------------------------------------------------------
// Backend URL'ini .env dosyasındaki REACT_APP_BACKEND_URL değişkeninden alıyoruz.
// Tüm API istekleri /api/ ön eki ile çalışır.
// ----------------------------------------------------------------------------
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Axios istemcisi - her isteğe otomatik olarak token eklenir
const istemci = axios.create({ baseURL: API });
istemci.interceptors.request.use((ayar) => {
  const jeton = localStorage.getItem("kuvvet_token");
  if (jeton) ayar.headers.Authorization = `Bearer ${jeton}`;
  return ayar;
});

// ----------------------------------------------------------------------------
// OTURUM YÖNETİMİ (Context API ile)
// ----------------------------------------------------------------------------
// Kullanıcı bilgisi ve giriş/kayıt/çıkış fonksiyonları tüm uygulamada
// useOturum() çağrısı ile erişilebilir.
// ----------------------------------------------------------------------------
const OturumContext = createContext(null);
const useOturum = () => useContext(OturumContext);

// Oturum sağlayıcı - uygulamanın köküne sarılır
const OturumSaglayici = ({ children }) => {
  const [kullanici, setKullanici] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  // Sayfa ilk açıldığında token varsa kullanıcı bilgisini çek
  useEffect(() => {
    const jeton = localStorage.getItem("kuvvet_token");
    if (!jeton) { setYukleniyor(false); return; }
    istemci.get("/auth/me")
      .then(cevap => setKullanici(cevap.data))
      .catch(() => localStorage.removeItem("kuvvet_token"))
      .finally(() => setYukleniyor(false));
  }, []);

  // E-posta ve şifre ile giriş yap
  const girisYap = async (eposta, sifre) => {
    const { data } = await istemci.post("/auth/login", { email: eposta, password: sifre });
    localStorage.setItem("kuvvet_token", data.token);
    setKullanici(data.user);
    return data.user;
  };

  // Yeni hesap oluştur
  const kayitOl = async (isim, eposta, sifre) => {
    const { data } = await istemci.post("/auth/register", { name: isim, email: eposta, password: sifre });
    localStorage.setItem("kuvvet_token", data.token);
    setKullanici(data.user);
    return data.user;
  };

  // Çıkış yap - token'ı sil
  const cikisYap = () => {
    localStorage.removeItem("kuvvet_token");
    setKullanici(null);
  };

  return (
    <OturumContext.Provider value={{ kullanici, yukleniyor, girisYap, kayitOl, cikisYap }}>
      {children}
    </OturumContext.Provider>
  );
};

// Giriş yapılmamışsa /giris sayfasına yönlendiren koruma bileşeni.
// sadeceAdmin=true ise sadece admin rolündeki kullanıcılar erişebilir.
const OzelRota = ({ children, sadeceAdmin = false }) => {
  const { kullanici, yukleniyor } = useOturum();
  if (yukleniyor) return <div className="min-h-screen flex items-center justify-center text-zinc-400">Yükleniyor…</div>;
  if (!kullanici) return <Navigate to="/giris" replace />;
  if (sadeceAdmin && kullanici.role !== "admin") return <Navigate to="/panel" replace />;
  return children;
};

// ----------------------------------------------------------------------------
// YARDIMCI BİLEŞENLER
// ----------------------------------------------------------------------------

// Markdown biçimli metni HTML'e dönüştürüp gösteren basit bileşen.
// Başlıkları (#, ##, ###), kalın/italik metni, listeleri ve kod bloklarını
// algılar. Yapay zekadan gelen plan metinlerini güzel bir şekilde gösterir.
const IcerikGosterici = ({ metin }) => {
  const html = (metin || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^---$/gm, "<hr/>")
    .replace(/^\s*[-*]\s+(.*)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<h\d|<ul|<li|<hr|<p)(.+)$/gm, "<p>$1</p>");
  return <div className="md-content" dangerouslySetInnerHTML={{ __html: html }} />;
};

// Verilen HTML elemanını ekran görüntüsü olarak yakalayıp PDF'e çevirir.
// html2canvas ile tuval oluşturulur, jsPDF ile A4 sayfalara bölünerek indirilir.
const pdfIndir = async (elemanRef, dosyaAdi = "plan.pdf") => {
  if (!elemanRef.current) return;
  toast.info("PDF hazırlanıyor...");
  try {
    const tuval = await html2canvas(elemanRef.current, {
      backgroundColor: "#121212",
      scale: 2,
    });
    const resimVerisi = tuval.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const sayfaGenislik = pdf.internal.pageSize.getWidth();
    const sayfaYukseklik = pdf.internal.pageSize.getHeight();
    const resimGenislik = sayfaGenislik;
    const resimYukseklik = (tuval.height * resimGenislik) / tuval.width;
    let kalanYukseklik = resimYukseklik;
    let konum = 0;
    pdf.addImage(resimVerisi, "PNG", 0, konum, resimGenislik, resimYukseklik);
    kalanYukseklik -= sayfaYukseklik;
    // Uzun içerikler için sayfa ekleyerek devam et
    while (kalanYukseklik > 0) {
      konum = kalanYukseklik - resimYukseklik;
      pdf.addPage();
      pdf.addImage(resimVerisi, "PNG", 0, konum, resimGenislik, resimYukseklik);
      kalanYukseklik -= sayfaYukseklik;
    }
    pdf.save(dosyaAdi);
    toast.success("PDF indirildi");
  } catch (e) {
    toast.error("PDF oluşturulamadı");
  }
};

// Üst menü - logo, navigasyon linkleri, giriş/çıkış butonları
const UstMenu = ({ yanPaneliAc }) => {
  const { kullanici, cikisYap } = useOturum();
  const yonlendir = useNavigate();
  const konum = useLocation();

  // Aktif sayfanın linkini vurgulamak için CSS sınıfı üretir
  const linkSinifi = (yol) =>
    `text-sm tracking-wider uppercase font-semibold transition-colors ${
      konum.pathname === yol ? "text-[#FF3B30]" : "text-zinc-300 hover:text-white"
    }`;

  const adminMi = kullanici?.role === "admin";

  return (
    <header className="glass-nav fixed top-0 left-0 right-0 z-50" data-testid="site-navbar">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2" data-testid="logo-link">
          <Dumbbell className="w-6 h-6 text-[#FF3B30]" strokeWidth={2.5} />
          <span className="font-heading text-2xl tracking-wider">KUVVET<span className="text-[#FF3B30]">.AI</span></span>
        </Link>

        {/* Navigasyon linkleri - giriş yapmamış ve giriş yapmış kullanıcı için farklı */}
        <nav className="hidden md:flex items-center gap-6">
          {!kullanici && <>
            <Link to="/" className={linkSinifi("/")} data-testid="nav-home">Anasayfa</Link>
            <a href="/#ozellikler" onClick={(e)=>{ if(konum.pathname==="/"){ e.preventDefault(); document.getElementById("ozellikler")?.scrollIntoView({behavior:"smooth"}); } }} className="text-sm tracking-wider uppercase font-semibold text-zinc-300 hover:text-white transition-colors" data-testid="nav-features">Özellikler</a>
            <a href="/#uyelikler" onClick={(e)=>{ if(konum.pathname==="/"){ e.preventDefault(); document.getElementById("uyelikler")?.scrollIntoView({behavior:"smooth"}); } }} className="text-sm tracking-wider uppercase font-semibold text-zinc-300 hover:text-white transition-colors" data-testid="nav-pricing">Üyelikler</a>
            <Link to="/sss" className={linkSinifi("/sss")} data-testid="nav-sss">S.S.S.</Link>
            <Link to="/iletisim" className={linkSinifi("/iletisim")} data-testid="nav-iletisim">İletişim</Link>
          </>}
          {kullanici && !adminMi && <Link to="/panel" className={linkSinifi("/panel")} data-testid="nav-panel">Panel</Link>}
          {kullanici && !adminMi && <Link to="/antrenman" className={linkSinifi("/antrenman")} data-testid="nav-antrenman">Antrenman</Link>}
          {kullanici && !adminMi && <Link to="/beslenme" className={linkSinifi("/beslenme")} data-testid="nav-beslenme">Beslenme</Link>}
          {kullanici && !adminMi && <Link to="/ilerleme" className={linkSinifi("/ilerleme")} data-testid="nav-ilerleme">İlerleme</Link>}
          {kullanici && !adminMi && <Link to="/koc" className={linkSinifi("/koc")} data-testid="nav-koc">Koç</Link>}
          {kullanici && !adminMi && <Link to="/iletisim" className={linkSinifi("/iletisim")} data-testid="nav-iletisim-user">İletişim</Link>}
          {adminMi && <Link to="/admin" className={linkSinifi("/admin")} data-testid="nav-admin">Admin Panel</Link>}
          {adminMi && <Link to="/admin/uyeler" className={linkSinifi("/admin/uyeler")} data-testid="nav-admin-users">Üyeler</Link>}
          {adminMi && <Link to="/admin/mesajlar" className={linkSinifi("/admin/mesajlar")} data-testid="nav-admin-mesajlar">Gelen Kutusu</Link>}
        </nav>

        {/* Kullanıcı aksiyonları - giriş durumuna göre farklı butonlar */}
        <div className="flex items-center gap-3">
          {kullanici ? (
            <button onClick={yanPaneliAc} className="flex items-center gap-2 px-3 py-2 text-sm border border-white/20 hover:border-[#FF3B30] hover:text-[#FF3B30] text-white transition-colors" data-testid="profile-button">
              <User className="w-4 h-4" /> <span className="hidden sm:inline">{kullanici.name}</span>
              {adminMi && <Shield className="w-3.5 h-3.5 text-[#FF3B30]" />}
            </button>
          ) : (
            <>
              <Link to="/giris" className="hidden sm:inline-block px-4 py-2 text-sm text-zinc-300 hover:text-white tracking-wide uppercase" data-testid="nav-giris">Giriş</Link>
              <Link to="/kayit" className="px-4 py-2 text-sm bg-[#FF3B30] hover:bg-[#FF5C53] text-white font-bold tracking-wide uppercase transition-colors" data-testid="nav-kayit">Üye Ol</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

// Profil yan paneli - sağdan açılan Sheet benzeri bileşen.
// Kullanıcı bilgileri, hızlı aksiyonlar ve çıkış yap butonu içerir.
const YanPanel = ({ acik, kapat }) => {
  const { kullanici, cikisYap } = useOturum();
  const yonlendir = useNavigate();
  const [istatistik, setIstatistik] = useState({ plan: 0, ilerleme: 0 });

  // Panel açıldığında kullanıcının özet bilgilerini getir
  useEffect(() => {
    if (!acik || !kullanici || kullanici.role === "admin") return;
    Promise.all([
      istemci.get("/plans").catch(() => ({ data: [] })),
      istemci.get("/progress").catch(() => ({ data: [] })),
    ]).then(([planlar, ilerleme]) => {
      setIstatistik({ plan: planlar.data.length, ilerleme: ilerleme.data.length });
    });
  }, [acik, kullanici]);

  if (!kullanici) return null;
  const adminMi = kullanici.role === "admin";

  const git = (yol) => { kapat(); yonlendir(yol); };

  return (
    <>
      {/* Arka plan karartması - tıklanınca kapanır */}
      <div
        className={`fixed inset-0 bg-black/70 z-40 transition-opacity duration-300 ${acik ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={kapat}
        data-testid="side-panel-overlay"
      />
      {/* Yan panel içerik */}
      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-[380px] bg-[#0A0A0A] border-l border-white/10 z-50 transition-transform duration-300 overflow-y-auto ${acik ? "translate-x-0" : "translate-x-full"}`}
        data-testid="side-panel"
      >
        {/* Başlık ve kapat butonu */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-[#FF3B30] flex items-center justify-center font-heading text-xl">
              {kullanici.name?.[0]?.toUpperCase() || "K"}
            </div>
            <div>
              <div className="font-heading text-lg uppercase flex items-center gap-1">
                {kullanici.name}
                {adminMi && <Shield className="w-4 h-4 text-[#FF3B30]" />}
              </div>
              <div className="text-xs text-zinc-500">{kullanici.email}</div>
            </div>
          </div>
          <button onClick={kapat} className="text-zinc-500 hover:text-white p-2" data-testid="side-panel-close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Özet istatistikler - sadece normal kullanıcıya */}
        {!adminMi && (
          <div className="p-6 grid grid-cols-2 gap-3 border-b border-white/10">
            <div className="bg-[#121212] border border-white/10 p-4">
              <div className="text-xs uppercase tracking-widest text-zinc-500">Plan</div>
              <div className="font-heading text-3xl text-[#FF3B30]">{istatistik.plan}</div>
            </div>
            <div className="bg-[#121212] border border-white/10 p-4">
              <div className="text-xs uppercase tracking-widest text-zinc-500">Kayıt</div>
              <div className="font-heading text-3xl text-[#FF3B30]">{istatistik.ilerleme}</div>
            </div>
          </div>
        )}

        {/* Hızlı erişim menüsü */}
        <div className="p-6 space-y-1">
          <h4 className="overline mb-3">Hızlı Erişim</h4>
          {adminMi ? (
            <>
              <YanPanelLink ikon={BarChart3} etiket="Admin Panel" onClick={() => git("/admin")} />
              <YanPanelLink ikon={Users} etiket="Üyeler" onClick={() => git("/admin/uyeler")} />
              <YanPanelLink ikon={Inbox} etiket="Gelen Kutusu" onClick={() => git("/admin/mesajlar")} />
            </>
          ) : (
            <>
              <YanPanelLink ikon={BarChart3} etiket="Panelim" onClick={() => git("/panel")} />
              <YanPanelLink ikon={Dumbbell} etiket="Antrenman Planı" onClick={() => git("/antrenman")} />
              <YanPanelLink ikon={Apple} etiket="Beslenme Planı" onClick={() => git("/beslenme")} />
              <YanPanelLink ikon={Target} etiket="Vücut Analizi" onClick={() => git("/vucut-analizi")} />
              <YanPanelLink ikon={TrendingUp} etiket="İlerleme Takibi" onClick={() => git("/ilerleme")} />
              <YanPanelLink ikon={MessageSquare} etiket="Yapay Zeka Koç" onClick={() => git("/koc")} />
              <YanPanelLink ikon={User} etiket="Profilim ve Geçmiş" onClick={() => git("/profil")} />
            </>
          )}
        </div>

        <div className="p-6 space-y-1 border-t border-white/10">
          <h4 className="overline mb-3">Diğer</h4>
          <YanPanelLink ikon={Mail} etiket="İletişim" onClick={() => git("/iletisim")} />
          <YanPanelLink ikon={LogOut} etiket="Çıkış Yap" onClick={() => { cikisYap(); kapat(); yonlendir("/"); }} kirmizi />
        </div>
      </aside>
    </>
  );
};

// Yan paneldeki tek bir link öğesi
const YanPanelLink = ({ ikon: Ikon, etiket, onClick, kirmizi }) => (
  <button onClick={onClick} className={`w-full flex items-center justify-between px-3 py-3 border border-white/5 hover:border-white/20 hover:bg-white/5 transition-colors group ${kirmizi ? "text-[#FF3B30]" : "text-white"}`} data-testid={`side-link-${etiket.toLowerCase().replace(/ /g,"-")}`}>
    <span className="flex items-center gap-3 text-sm">
      <Ikon className="w-4 h-4" /> {etiket}
    </span>
    <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-[#FF3B30]" />
  </button>
);

// Basit form alanı sarmalayıcısı - etiket + giriş alanı
const Alan = ({ etiket, children }) => (
  <div>
    <label className="text-xs uppercase tracking-widest text-zinc-400 mb-2 block">{etiket}</label>
    {children}
  </div>
);

// İstatistik kartı - ilerleme sayfasında kullanılır
const IstatistikKart = ({ etiket, deger }) => (
  <div className="bg-[#121212] border border-white/10 p-5">
    <div className="text-xs tracking-[0.2em] uppercase text-zinc-500 mb-2">{etiket}</div>
    <div className="font-heading text-4xl text-white">{deger}</div>
  </div>
);

// ----------------------------------------------------------------------------
// SAYFALAR
// ----------------------------------------------------------------------------

// Ana sayfa arka plan görselleri (Unsplash/Pexels)
const HERO_RESIM = "https://images.unsplash.com/photo-1543300722-222718fd8509?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzNTl8MHwxfHNlYXJjaHw0fHxpbnRlbnNlJTIwZ3ltJTIwd29ya291dCUyMGRhcmt8ZW58MHx8fHwxNzc2NzYwNzEzfDA&ixlib=rb-4.1.0&q=85";
const ANTRENMAN_RESIM = "https://images.unsplash.com/photo-1605296867724-fa87a8ef53fd?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzNTl8MHwxfHNlYXJjaHwzfHxpbnRlbnNlJTIwZ3ltJTIwd29ya291dCUyMGRhcmt8ZW58MHx8fHwxNzc2NzYwNzEzfDA&ixlib=rb-4.1.0&q=85";
const NEON_RESIM = "https://images.unsplash.com/photo-1769120062656-23adba3790b3?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1ODh8MHwxfHNlYXJjaHwzfHxuZW9uJTIwZ3JpZCUyMGRhcmslMjBhYnN0cmFjdHxlbnwwfHx8fDE3NzY3NjA3MjN8MA&ixlib=rb-4.1.0&q=85";
const BESLENME_RESIM = "https://images.pexels.com/photos/842571/pexels-photo-842571.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

// Anasayfa - tanıtım sayfası. Zaten giriş yapmış kullanıcılar otomatik
// olarak admin veya kullanıcı paneline yönlendirilir.
const AnaSayfa = () => {
  const { kullanici, yukleniyor } = useOturum();
  if (yukleniyor) return <div className="min-h-screen bg-[#0A0A0A]" />;
  if (kullanici?.role === "admin") return <Navigate to="/admin" replace />;
  if (kullanici) return <Navigate to="/panel" replace />;
  return <TanitimSayfasi />;
};

// Tanıtım sayfası içeriği - hero, özellikler, fiyatlandırma
const TanitimSayfasi = () => (
  <div className="bg-[#0A0A0A] text-white">
    {/* Kahraman bölüm - dikkat çekici büyük başlık ve CTA */}
    <section className="relative min-h-screen flex items-center overflow-hidden pt-16" data-testid="hero-section">
      <div className="absolute inset-0">
        <img src={HERO_RESIM} alt="spor" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/40" />
        <div className="absolute inset-0 bg-black/40" />
      </div>
      <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-24 w-full">
        <div className="max-w-3xl">
          <div className="overline mb-6 flex items-center gap-3" data-testid="hero-tagline">
            <span className="w-2 h-2 rounded-full bg-[#FF3B30] pulse-dot" /> YAPAY ZEKA DESTEKLİ SPOR PLATFORMU
          </div>
          <h1 className="font-heading text-6xl sm:text-7xl lg:text-8xl leading-[0.9] mb-8 uppercase" data-testid="hero-title">
            Sınırı kendin<br/><span className="text-[#FF3B30]">belirle.</span><br/>Gerisini yapay<br/>zeka halleder.
          </h1>
          <p className="text-lg sm:text-xl text-zinc-300 max-w-xl mb-10 leading-relaxed" data-testid="hero-subtitle">
            Kişiye özel antrenman, beslenme ve 7/24 yapay zeka spor koçu. Kuvvet AI ile hedeflerine daha hızlı ulaş.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link to="/kayit" className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-[#FF3B30] hover:bg-[#FF5C53] text-white font-bold tracking-wider uppercase transition-colors" data-testid="hero-cta-kayit">
              Ücretsiz Başla <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="#ozellikler" className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-white/30 hover:border-white text-white tracking-wider uppercase font-bold transition-colors" data-testid="hero-cta-ozellikler">
              Özellikleri Keşfet
            </a>
          </div>
        </div>
        {/* Güven veren istatistikler */}
        <div className="mt-24 grid grid-cols-2 md:grid-cols-4 gap-8 border-t border-white/10 pt-10">
          {[{n:"12B+",l:"Aktif üye"},{n:"4",l:"Zeka aracı"},{n:"24/7",l:"Koç erişimi"},{n:"98%",l:"Memnuniyet"}].map((s, i) => (
            <div key={i} data-testid={`stat-${i}`}>
              <div className="font-heading text-5xl text-white">{s.n}</div>
              <div className="text-xs tracking-[0.2em] uppercase text-zinc-500 mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Özellikler bölümü - 4 yapay zeka aracı tanıtımı */}
    <section id="ozellikler" className="py-24 border-t border-white/10" data-testid="features-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="max-w-2xl mb-16">
          <div className="overline mb-4">YAPAY ZEKA ARAÇLARI</div>
          <h2 className="font-heading text-5xl sm:text-6xl uppercase leading-none">Dört silah. <span className="text-[#FF3B30]">Tek sen.</span></h2>
          <p className="text-zinc-400 mt-6 text-lg">Her biri gelişmiş yapay zeka ile çalışır. Hedeflerine göre öğrenir, gelişir.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Antrenman kartı - büyük */}
          <div className="md:col-span-7 relative overflow-hidden border border-white/10 hover-lift min-h-[380px] group" data-testid="feature-antrenman">
            <img src={ANTRENMAN_RESIM} alt="antrenman" className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-70 transition-opacity" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent" />
            <div className="relative p-8 h-full flex flex-col justify-end">
              <Dumbbell className="w-8 h-8 text-[#FF3B30] mb-4" strokeWidth={2.5} />
              <h3 className="font-heading text-4xl uppercase mb-2">Antrenman Programı</h3>
              <p className="text-zinc-300 max-w-md">Hedefine, seviyene ve ekipmanına göre haftalık detaylı plan.</p>
            </div>
          </div>
          {/* Beslenme kartı */}
          <div className="md:col-span-5 relative overflow-hidden border border-white/10 hover-lift min-h-[380px] group" data-testid="feature-beslenme">
            <img src={BESLENME_RESIM} alt="beslenme" className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-60 transition-opacity" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent" />
            <div className="relative p-8 h-full flex flex-col justify-end">
              <Apple className="w-8 h-8 text-[#FF3B30] mb-4" strokeWidth={2.5} />
              <h3 className="font-heading text-4xl uppercase mb-2">Beslenme Planı</h3>
              <p className="text-zinc-300">Makroları, kaloriyi ve alternatifleri hesaplar.</p>
            </div>
          </div>
          {/* Vücut analizi kartı */}
          <div className="md:col-span-4 bg-[#121212] border border-white/10 hover-lift p-8 min-h-[280px]" data-testid="feature-vucut">
            <Target className="w-8 h-8 text-[#FF3B30] mb-4" strokeWidth={2.5} />
            <h3 className="font-heading text-3xl uppercase mb-2">Vücut Analizi</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">BMI, vücut tipin ve hedef süren üzerinden gerçekçi yol haritası çıkarır.</p>
          </div>
          {/* Koç kartı - geniş */}
          <div className="md:col-span-8 relative overflow-hidden border border-white/10 hover-lift min-h-[280px] group" data-testid="feature-koc">
            <img src={NEON_RESIM} alt="zeka" className="absolute inset-0 w-full h-full object-cover opacity-30" />
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent" />
            <div className="relative p-8 h-full flex flex-col justify-center max-w-xl">
              <MessageSquare className="w-8 h-8 text-[#FF3B30] mb-4" strokeWidth={2.5} />
              <h3 className="font-heading text-4xl uppercase mb-2">Yapay Zeka Koç</h3>
              <p className="text-zinc-300">Günün her saatinde sorularını yanıtlayan, motive eden Türkçe yapay zeka koçun.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* Fiyatlandırma - üyelik paketleri */}
    <section id="uyelikler" className="py-24 border-t border-white/10" data-testid="pricing-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="max-w-2xl mb-16">
          <div className="overline mb-4">ÜYELİK</div>
          <h2 className="font-heading text-5xl sm:text-6xl uppercase leading-none">Her hedefe <span className="text-[#FF3B30]">uygun plan.</span></h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {ad:"BAŞLANGIÇ",fiyat:"0",tanim:"Yapay zekayı dene",ozellikler:["Haftalık 1 antrenman planı","Temel beslenme önerisi","Sınırlı yapay zeka koç"],buton:"Başla",vurgulu:false},
            {ad:"ATLET",fiyat:"299",tanim:"Ciddi sporcular için",ozellikler:["Sınırsız antrenman planı","Kişisel beslenme","7/24 yapay zeka koç","Vücut analizi"],buton:"Şimdi Katıl",vurgulu:true},
            {ad:"ELİT",fiyat:"599",tanim:"Profesyonel takip",ozellikler:["Atlet paketi +","Canlı koç desteği","Özel beslenme revizeleri","Öncelikli destek"],buton:"İletişim",vurgulu:false},
          ].map((paket, i) => (
            <div key={i} className={`p-8 border hover-lift relative bg-[#121212] ${paket.vurgulu ? "border-[#FF3B30]" : "border-white/10"}`} data-testid={`plan-${i}`}>
              {paket.vurgulu && <div className="absolute -top-3 left-8 bg-[#FF3B30] text-white text-xs font-bold tracking-widest uppercase px-3 py-1">Popüler</div>}
              <div className="font-heading text-3xl uppercase mb-1">{paket.ad}</div>
              <p className="text-zinc-500 text-sm mb-6">{paket.tanim}</p>
              <div className="mb-8"><span className="font-heading text-6xl">₺{paket.fiyat}</span><span className="text-zinc-500 ml-2">/ay</span></div>
              <ul className="space-y-3 mb-8">
                {paket.ozellikler.map((ozellik, j) => (
                  <li key={j} className="text-sm text-zinc-300 flex items-start gap-2">
                    <Zap className="w-4 h-4 text-[#FF3B30] mt-0.5 shrink-0" />{ozellik}
                  </li>
                ))}
              </ul>
              <Link to="/kayit" className={`block text-center py-3 font-bold tracking-wider uppercase text-sm transition-colors ${paket.vurgulu ? "bg-[#FF3B30] hover:bg-[#FF5C53] text-white" : "border border-white/20 hover:border-white text-white"}`} data-testid={`plan-cta-${i}`}>
                {paket.buton}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Son çağrı bölümü */}
    <section className="py-24 border-t border-white/10" data-testid="cta-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
        <Brain className="w-12 h-12 text-[#FF3B30] mx-auto mb-6" strokeWidth={2.5} />
        <h2 className="font-heading text-5xl sm:text-7xl uppercase leading-none mb-6">Vücudun bir <span className="text-[#FF3B30]">algoritma</span>.<br/>Onu okuyalım.</h2>
        <p className="text-zinc-400 text-lg max-w-xl mx-auto mb-10">Bugün kayıt ol, yapay zeka destekli dönüşümüne başla.</p>
        <Link to="/kayit" className="inline-flex items-center gap-3 px-10 py-4 bg-[#FF3B30] hover:bg-[#FF5C53] text-white font-bold tracking-widest uppercase transition-colors" data-testid="cta-final">
          Hesap oluştur <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>

    {/* Alt bilgi */}
    <footer className="border-t border-white/10 py-10">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-zinc-500 text-sm">
        <div className="font-heading text-xl tracking-wider text-white">KUVVET<span className="text-[#FF3B30]">.AI</span></div>
        <div>© 2026 Kuvvet AI Spor Salonu. Tüm hakları saklıdır.</div>
      </div>
    </footer>
  </div>
);

// Giriş sayfası - mevcut kullanıcılar için
const Giris = () => {
  const [eposta, setEposta] = useState("");
  const [sifre, setSifre] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const { girisYap } = useOturum();
  const yonlendir = useNavigate();

  // Form gönderiminde API çağrısı yap ve panele yönlendir
  const gonder = async (e) => {
    e.preventDefault();
    setYukleniyor(true);
    try {
      await girisYap(eposta, sifre);
      toast.success("Hoş geldin!");
      yonlendir("/panel");
    } catch (hata) {
      toast.error(hata?.response?.data?.detail || "Giriş başarısız");
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-12 flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="overline mb-3">GİRİŞ</div>
        <h1 className="font-heading text-5xl uppercase mb-8">Hoş geldin, <span className="text-[#FF3B30]">atlet.</span></h1>
        <form onSubmit={gonder} className="space-y-5" data-testid="giris-form">
          <Alan etiket="E-posta">
            <input type="email" required value={eposta} onChange={(e)=>setEposta(e.target.value)} className="inp" data-testid="giris-email" />
          </Alan>
          <Alan etiket="Şifre">
            <input type="password" required value={sifre} onChange={(e)=>setSifre(e.target.value)} className="inp" data-testid="giris-password" />
          </Alan>
          <button type="submit" disabled={yukleniyor} className="w-full py-3 bg-[#FF3B30] hover:bg-[#FF5C53] disabled:opacity-60 text-white font-bold tracking-widest uppercase transition-colors" data-testid="giris-submit">
            {yukleniyor ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>
        <p className="text-zinc-500 text-sm mt-8 text-center">
          Hesabın yok mu? <Link to="/kayit" className="text-[#FF3B30] hover:underline" data-testid="link-kayit">Üye ol</Link>
        </p>
      </div>
    </div>
  );
};

// Kayıt sayfası - yeni kullanıcı oluşturma
const Kayit = () => {
  const [isim, setIsim] = useState("");
  const [eposta, setEposta] = useState("");
  const [sifre, setSifre] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const { kayitOl } = useOturum();
  const yonlendir = useNavigate();

  // Form gönderimi - minimum şifre uzunluğu kontrolü yap
  const gonder = async (e) => {
    e.preventDefault();
    if (sifre.length < 6) return toast.error("Şifre en az 6 karakter olmalı");
    setYukleniyor(true);
    try {
      await kayitOl(isim, eposta, sifre);
      toast.success("Hesap oluşturuldu!");
      yonlendir("/panel");
    } catch (hata) {
      toast.error(hata?.response?.data?.detail || "Kayıt başarısız");
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-12 flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="overline mb-3">KAYIT OL</div>
        <h1 className="font-heading text-5xl uppercase mb-8">Yolculuğa <span className="text-[#FF3B30]">başla.</span></h1>
        <form onSubmit={gonder} className="space-y-5" data-testid="kayit-form">
          <Alan etiket="İsim">
            <input type="text" required value={isim} onChange={(e)=>setIsim(e.target.value)} className="inp" data-testid="kayit-name" />
          </Alan>
          <Alan etiket="E-posta">
            <input type="email" required value={eposta} onChange={(e)=>setEposta(e.target.value)} className="inp" data-testid="kayit-email" />
          </Alan>
          <Alan etiket="Şifre (en az 6)">
            <input type="password" required value={sifre} onChange={(e)=>setSifre(e.target.value)} className="inp" data-testid="kayit-password" />
          </Alan>
          <button type="submit" disabled={yukleniyor} className="w-full py-3 bg-[#FF3B30] hover:bg-[#FF5C53] disabled:opacity-60 text-white font-bold tracking-widest uppercase transition-colors" data-testid="kayit-submit">
            {yukleniyor ? "Hesap oluşturuluyor..." : "Hesap Oluştur"}
          </button>
        </form>
        <p className="text-zinc-500 text-sm mt-8 text-center">
          Zaten hesabın var mı? <Link to="/giris" className="text-[#FF3B30] hover:underline" data-testid="link-giris">Giriş yap</Link>
        </p>
      </div>
    </div>
  );
};

// Panel (dashboard) - kullanıcının tüm araçlara erişebileceği ana sayfa
const Panel = () => {
  const { kullanici } = useOturum();
  const [planlar, setPlanlar] = useState([]);

  // Sayfa açıldığında kullanıcının geçmiş planlarını çek
  useEffect(() => {
    istemci.get("/plans").then(cevap => setPlanlar(cevap.data)).catch(()=>{});
  }, []);

  // Her plan türünden kaç tane olduğunu say (panel kartlarında gösterilir)
  const sayilar = planlar.reduce((toplam, plan) => {
    toplam[plan.type] = (toplam[plan.type] || 0) + 1;
    return toplam;
  }, {});

  // Panel'de gösterilecek araç kartları
  const araclar = [
    { yol:"/antrenman", ikon: Dumbbell, baslik:"Antrenman Planı", aciklama:"Haftalık özel program", anahtar:"workout" },
    { yol:"/beslenme", ikon: Apple, baslik:"Beslenme Planı", aciklama:"Makro ve kalori planı", anahtar:"diet" },
    { yol:"/vucut-analizi", ikon: Target, baslik:"Vücut Analizi", aciklama:"BMI ve yol haritası", anahtar:"body_analysis" },
    { yol:"/ilerleme", ikon: TrendingUp, baslik:"İlerleme Takibi", aciklama:"Antrenman kayıtların", anahtar:"progress" },
    { yol:"/koc", ikon: MessageSquare, baslik:"Yapay Zeka Koç", aciklama:"7/24 sohbet et", anahtar:"chat" },
  ];

  return (
    <div className="min-h-screen pt-24 pb-16 px-6 lg:px-8 max-w-7xl mx-auto" data-testid="panel-page">
      <div className="mb-10">
        <div className="overline mb-2">KONTROL MERKEZİ</div>
        <h1 className="font-heading text-5xl sm:text-6xl uppercase">
          Merhaba, <span className="text-[#FF3B30]">{kullanici?.name}</span>
        </h1>
        <p className="text-zinc-400 mt-3">Bugün ne üzerinde çalışacağız?</p>
      </div>

      {/* Araç kartları ızgarası */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
        {araclar.map((arac, i) => {
          const Ikon = arac.ikon;
          return (
            <Link to={arac.yol} key={i} className="bg-[#121212] border border-white/10 p-6 hover-lift flex flex-col justify-between min-h-[180px] group" data-testid={`tool-${arac.anahtar}`}>
              <div>
                <Ikon className="w-7 h-7 text-[#FF3B30] mb-4" strokeWidth={2.5} />
                <h3 className="font-heading text-2xl uppercase">{arac.baslik}</h3>
                <p className="text-zinc-500 text-xs mt-1">{arac.aciklama}</p>
              </div>
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-zinc-500">{sayilar[arac.anahtar] || 0} kayıt</span>
                <ArrowUpRight className="w-4 h-4 text-zinc-500 group-hover:text-[#FF3B30] transition-colors" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Son oluşturulan planların özeti */}
      <div>
        <div className="flex items-end justify-between mb-6">
          <h2 className="font-heading text-3xl uppercase">Son Planların</h2>
          <Link to="/profil" className="text-xs uppercase tracking-widest text-zinc-400 hover:text-[#FF3B30]" data-testid="see-all-plans">Tümü →</Link>
        </div>
        {planlar.length === 0 ? (
          <div className="border border-dashed border-white/10 p-10 text-center text-zinc-500" data-testid="empty-plans">
            Henüz plan oluşturmadın. Yukarıdaki araçlardan birini seç ve başla.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {planlar.slice(0,4).map(plan => (
              <div key={plan.id} className="bg-[#121212] border border-white/10 p-5 hover-lift" data-testid={`plan-${plan.id}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs text-[#FF3B30] uppercase">{plan.type.replace("_"," ")}</span>
                  <span className="text-xs text-zinc-500">{new Date(plan.created_at).toLocaleDateString("tr-TR")}</span>
                </div>
                <p className="text-zinc-300 text-sm line-clamp-3">{plan.content.slice(0, 180)}...</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Genel yapay zeka formu bileşeni - Antrenman ve Beslenme sayfalarında yeniden kullanılır.
// Form alanları dışarıdan prop olarak alınır, sonuç PDF olarak indirilebilir.
const YapayZekaFormu = ({ baslik, etiket, uzanti, ikon: Ikon, alanlar, baslangic, testId }) => {
  const [form, setForm] = useState(baslangic);
  const [sonuc, setSonuc] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const sonucRef = useRef(null); // PDF indirme için referans

  // Form alan değiştirme yardımcısı
  const degistir = (anahtar, deger) => setForm(oncekiDurum => ({...oncekiDurum, [anahtar]: deger}));

  // API'ye istek at ve cevabı state'e kaydet
  const gonder = async (e) => {
    e.preventDefault();
    setYukleniyor(true);
    setSonuc(null);
    try {
      const { data } = await istemci.post(uzanti, form);
      setSonuc(data);
      toast.success("Planın hazır!");
    } catch (hata) {
      toast.error(hata?.response?.data?.detail || "Hata oluştu");
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-16 px-6 lg:px-8 max-w-6xl mx-auto" data-testid={`${testId}-page`}>
      <div className="mb-10">
        <div className="overline mb-2 flex items-center gap-2"><Ikon className="w-4 h-4" /> {etiket}</div>
        <h1 className="font-heading text-5xl uppercase">{baslik}</h1>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Sol kolon - form */}
        <form onSubmit={gonder} className="md:col-span-2 bg-[#121212] border border-white/10 p-6 space-y-4" data-testid={`${testId}-form`}>
          {alanlar({ form, degistir, testId })}
          <button type="submit" disabled={yukleniyor} className="w-full py-3 bg-[#FF3B30] hover:bg-[#FF5C53] disabled:opacity-60 text-white font-bold tracking-widest uppercase transition-colors flex items-center justify-center gap-2" data-testid={`${testId}-submit`}>
            {yukleniyor ? <><Loader2 className="w-4 h-4 animate-spin"/> Hazırlanıyor...</> : "Plan Oluştur"}
          </button>
        </form>
        {/* Sağ kolon - sonuç ve PDF indirme butonu */}
        <div className="md:col-span-3">
          {sonuc && (
            <div className="mb-3 flex justify-end">
              <button onClick={() => pdfIndir(sonucRef, `${testId}-plani.pdf`)} className="flex items-center gap-2 px-4 py-2 text-xs border border-white/20 hover:border-[#FF3B30] hover:text-[#FF3B30] text-white tracking-widest uppercase transition-colors" data-testid={`${testId}-download-pdf`}>
                <Download className="w-4 h-4" /> PDF İndir
              </button>
            </div>
          )}
          <div ref={sonucRef} className="bg-[#121212] border border-white/10 p-6 min-h-[400px]" data-testid={`${testId}-result`}>
            {yukleniyor && <div className="text-zinc-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/> Yapay zeka hazırlıyor...</div>}
            {!yukleniyor && !sonuc && <div className="text-zinc-500">Sonuç burada görüntülenecek.</div>}
            {sonuc && <IcerikGosterici metin={sonuc.content} />}
          </div>
        </div>
      </div>
    </div>
  );
};

// Antrenman programı oluşturma sayfası
const Antrenman = () => (
  <YapayZekaFormu
    baslik={<>Kişisel <span className="text-[#FF3B30]">program</span> üret</>}
    etiket="YAPAY ZEKA ANTRENMAN"
    uzanti="/ai/workout"
    ikon={Dumbbell}
    testId="antrenman"
    baslangic={{ goal:"Kas yapma", level:"Orta", days_per_week:4, equipment:"Spor salonu", notes:"" }}
    alanlar={({form, degistir, testId}) => (<>
      <Alan etiket="Hedef">
        <select value={form.goal} onChange={e=>degistir("goal", e.target.value)} className="inp" data-testid={`${testId}-goal`}>
          <option>Kilo verme</option><option>Kas yapma</option><option>Genel form</option><option>Güç artışı</option><option>Dayanıklılık</option>
        </select>
      </Alan>
      <Alan etiket="Seviye">
        <select value={form.level} onChange={e=>degistir("level", e.target.value)} className="inp" data-testid={`${testId}-level`}>
          <option>Başlangıç</option><option>Orta</option><option>İleri</option>
        </select>
      </Alan>
      <Alan etiket="Haftalık gün">
        <input type="number" min="1" max="7" value={form.days_per_week} onChange={e=>degistir("days_per_week", parseInt(e.target.value)||1)} className="inp" data-testid={`${testId}-days`} />
      </Alan>
      <Alan etiket="Ekipman">
        <select value={form.equipment} onChange={e=>degistir("equipment", e.target.value)} className="inp" data-testid={`${testId}-equipment`}>
          <option>Spor salonu</option><option>Ev (temel)</option><option>Ev (dumbbell)</option><option>Minimum ekipman</option>
        </select>
      </Alan>
      <Alan etiket="Ek notlar">
        <textarea rows="3" value={form.notes} onChange={e=>degistir("notes", e.target.value)} placeholder="Sakatlık, tercihler..." className="inp" data-testid={`${testId}-notes`} />
      </Alan>
    </>)}
  />
);

// Beslenme planı oluşturma sayfası
const Beslenme = () => (
  <YapayZekaFormu
    baslik={<>7 günlük <span className="text-[#FF3B30]">beslenme</span> planı</>}
    etiket="YAPAY ZEKA BESLENME"
    uzanti="/ai/diet"
    ikon={Apple}
    testId="beslenme"
    baslangic={{ goal:"Kas yapma", age:28, weight:75, height:178, gender:"Erkek", activity:"Orta aktif", restrictions:"" }}
    alanlar={({form, degistir, testId}) => (<>
      <Alan etiket="Hedef">
        <select value={form.goal} onChange={e=>degistir("goal", e.target.value)} className="inp" data-testid={`${testId}-goal`}>
          <option>Kilo verme</option><option>Kas yapma</option><option>Sağlıklı yaşam</option><option>Yağ yakımı</option>
        </select>
      </Alan>
      <div className="grid grid-cols-2 gap-3">
        <Alan etiket="Yaş"><input type="number" value={form.age} onChange={e=>degistir("age", parseInt(e.target.value)||0)} className="inp" data-testid={`${testId}-age`} /></Alan>
        <Alan etiket="Cinsiyet">
          <select value={form.gender} onChange={e=>degistir("gender", e.target.value)} className="inp" data-testid={`${testId}-gender`}>
            <option>Erkek</option><option>Kadın</option>
          </select>
        </Alan>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Alan etiket="Kilo (kg)"><input type="number" step="0.1" value={form.weight} onChange={e=>degistir("weight", parseFloat(e.target.value)||0)} className="inp" data-testid={`${testId}-weight`} /></Alan>
        <Alan etiket="Boy (cm)"><input type="number" value={form.height} onChange={e=>degistir("height", parseFloat(e.target.value)||0)} className="inp" data-testid={`${testId}-height`} /></Alan>
      </div>
      <Alan etiket="Aktivite">
        <select value={form.activity} onChange={e=>degistir("activity", e.target.value)} className="inp" data-testid={`${testId}-activity`}>
          <option>Sedanter</option><option>Hafif aktif</option><option>Orta aktif</option><option>Çok aktif</option>
        </select>
      </Alan>
      <Alan etiket="Kısıtlamalar">
        <input type="text" value={form.restrictions} onChange={e=>degistir("restrictions", e.target.value)} placeholder="Vegan, glutensiz..." className="inp" data-testid={`${testId}-restrictions`} />
      </Alan>
    </>)}
  />
);

// Vücut analizi sayfası - BMI hesaplama ve AI yorumu
const VucutAnalizi = () => {
  const [form, setForm] = useState({ age:28, gender:"Erkek", weight:75, height:178, body_fat:"", goal:"Kas yapma ve yağ kaybı", timeframe:"3 ay" });
  const [sonuc, setSonuc] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const sonucRef = useRef(null);

  const degistir = (anahtar, deger) => setForm(oncekiDurum => ({...oncekiDurum, [anahtar]: deger}));

  // Form gönderimi - vücut yağ oranı opsiyonel olduğu için ayrı kontrol ediliyor
  const gonder = async (e) => {
    e.preventDefault();
    setYukleniyor(true);
    setSonuc(null);
    try {
      const veri = { ...form, body_fat: form.body_fat === "" ? null : parseFloat(form.body_fat) };
      const { data } = await istemci.post("/ai/body-analysis", veri);
      setSonuc(data);
      toast.success("Analizin hazır!");
    } catch (hata) {
      toast.error(hata?.response?.data?.detail || "Hata oluştu");
    } finally {
      setYukleniyor(false);
    }
  };

  // BMI hesaplama - kilo / (boy_metre ** 2)
  const bmi = form.weight && form.height ? (form.weight / ((form.height/100)**2)).toFixed(1) : "-";

  return (
    <div className="min-h-screen pt-24 pb-16 px-6 lg:px-8 max-w-6xl mx-auto" data-testid="vucut-page">
      <div className="mb-10">
        <div className="overline mb-2 flex items-center gap-2"><Target className="w-4 h-4" /> VÜCUT ANALİZİ</div>
        <h1 className="font-heading text-5xl uppercase">Başlangıç <span className="text-[#FF3B30]">noktan</span></h1>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <form onSubmit={gonder} className="md:col-span-2 bg-[#121212] border border-white/10 p-6 space-y-4" data-testid="vucut-form">
          <div className="grid grid-cols-2 gap-3">
            <Alan etiket="Yaş"><input type="number" value={form.age} onChange={e=>degistir("age", parseInt(e.target.value)||0)} className="inp" data-testid="vucut-age" /></Alan>
            <Alan etiket="Cinsiyet">
              <select value={form.gender} onChange={e=>degistir("gender", e.target.value)} className="inp" data-testid="vucut-gender">
                <option>Erkek</option><option>Kadın</option>
              </select>
            </Alan>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Alan etiket="Kilo (kg)"><input type="number" step="0.1" value={form.weight} onChange={e=>degistir("weight", parseFloat(e.target.value)||0)} className="inp" data-testid="vucut-weight" /></Alan>
            <Alan etiket="Boy (cm)"><input type="number" value={form.height} onChange={e=>degistir("height", parseFloat(e.target.value)||0)} className="inp" data-testid="vucut-height" /></Alan>
          </div>
          <Alan etiket="Vücut yağ %"><input type="number" step="0.1" value={form.body_fat} onChange={e=>degistir("body_fat", e.target.value)} className="inp" data-testid="vucut-fat" /></Alan>
          <Alan etiket="Hedef"><input type="text" value={form.goal} onChange={e=>degistir("goal", e.target.value)} className="inp" data-testid="vucut-goal" /></Alan>
          <Alan etiket="Süre">
            <select value={form.timeframe} onChange={e=>degistir("timeframe", e.target.value)} className="inp" data-testid="vucut-timeframe">
              <option>1 ay</option><option>3 ay</option><option>6 ay</option><option>1 yıl</option>
            </select>
          </Alan>
          {/* Otomatik hesaplanan BMI kutusu */}
          <div className="bg-[#0A0A0A] border border-white/10 p-4 flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-zinc-400">BMI</span>
            <span className="font-heading text-3xl text-[#FF3B30]">{bmi}</span>
          </div>
          <button type="submit" disabled={yukleniyor} className="w-full py-3 bg-[#FF3B30] hover:bg-[#FF5C53] disabled:opacity-60 text-white font-bold tracking-widest uppercase transition-colors flex items-center justify-center gap-2" data-testid="vucut-submit">
            {yukleniyor ? <><Loader2 className="w-4 h-4 animate-spin"/> Analiz ediliyor...</> : "Analiz Et"}
          </button>
        </form>
        <div className="md:col-span-3">
          {sonuc && (
            <div className="mb-3 flex justify-end">
              <button onClick={() => pdfIndir(sonucRef, "vucut-analizi.pdf")} className="flex items-center gap-2 px-4 py-2 text-xs border border-white/20 hover:border-[#FF3B30] hover:text-[#FF3B30] text-white tracking-widest uppercase transition-colors" data-testid="vucut-download-pdf">
                <Download className="w-4 h-4" /> PDF İndir
              </button>
            </div>
          )}
          <div ref={sonucRef} className="bg-[#121212] border border-white/10 p-6 min-h-[400px]" data-testid="vucut-result">
            {yukleniyor && <div className="text-zinc-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/> Yapay zeka analiz yapıyor...</div>}
            {!yukleniyor && !sonuc && <div className="text-zinc-500">Analizin burada görüntülenecek.</div>}
            {sonuc && <IcerikGosterici metin={sonuc.content} />}
          </div>
        </div>
      </div>
    </div>
  );
};

// Yapay zeka koç sayfası - sohbet arayüzü
const Koc = () => {
  const [mesajlar, setMesajlar] = useState([
    { role:"assistant", content:"Selam! Ben Kuvvet AI koçun. Antrenman, beslenme, motivasyon... Ne sormak istersin?" }
  ]);
  const [oturumId, setOturumId] = useState(null);
  const [giris, setGiris] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const kaydirmaRef = useRef(null);

  // Yeni mesaj geldiğinde otomatik en aşağıya kaydır
  useEffect(() => {
    kaydirmaRef.current?.scrollTo({ top: kaydirmaRef.current.scrollHeight, behavior:"smooth" });
  }, [mesajlar]);

  // Mesaj gönderme - kullanıcı mesajını ekle, API'den cevap al, ekrana yaz
  const mesajGonder = async (e) => {
    e.preventDefault();
    if (!giris.trim() || yukleniyor) return;
    const metin = giris.trim();
    setMesajlar(m => [...m, { role:"user", content:metin }]);
    setGiris("");
    setYukleniyor(true);
    try {
      const { data } = await istemci.post("/ai/chat", { session_id: oturumId, message: metin });
      setOturumId(data.session_id);
      setMesajlar(m => [...m, { role:"assistant", content: data.reply }]);
    } catch (hata) {
      toast.error(hata?.response?.data?.detail || "Cevap alınamadı");
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-6 px-6 lg:px-8 max-w-4xl mx-auto flex flex-col" data-testid="koc-page">
      <div className="mb-6">
        <div className="overline mb-2 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> YAPAY ZEKA KOÇ</div>
        <h1 className="font-heading text-5xl uppercase">7/24 <span className="text-[#FF3B30]">koçluk</span></h1>
      </div>
      {/* Mesaj balonları */}
      <div ref={kaydirmaRef} className="flex-1 bg-[#121212] border border-white/10 p-6 overflow-y-auto space-y-4 max-h-[60vh]" data-testid="koc-messages">
        {mesajlar.map((mesaj, i) => (
          <div key={i} className={`flex ${mesaj.role==="user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
              mesaj.role==="user"
                ? "bg-white/10 text-white"
                : "bg-[#1A1A1A] text-white border border-[#FF3B30]/30 shadow-[0_0_15px_rgba(255,59,48,0.1)]"
            }`} data-testid={`msg-${mesaj.role}-${i}`}>
              {mesaj.content}
            </div>
          </div>
        ))}
        {/* Yapay zeka cevap yazarken gösterilen "düşünüyor" baloncuğu */}
        {yukleniyor && (
          <div className="flex justify-start">
            <div className="bg-[#1A1A1A] text-zinc-400 border border-[#FF3B30]/30 px-4 py-3 text-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> düşünüyor...
            </div>
          </div>
        )}
      </div>
      {/* Mesaj yazma formu */}
      <form onSubmit={mesajGonder} className="mt-4 flex gap-2" data-testid="koc-form">
        <input type="text" value={giris} onChange={e=>setGiris(e.target.value)} placeholder="Bir soru sor..." className="flex-1 inp" data-testid="koc-input" />
        <button type="submit" disabled={yukleniyor} className="px-6 bg-[#FF3B30] hover:bg-[#FF5C53] disabled:opacity-60 text-white font-bold transition-colors flex items-center gap-2" data-testid="koc-send">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};

// Profil sayfası - kullanıcı bilgileri + tüm geçmiş planlar listesi ve PDF indirme
const Profil = () => {
  const { kullanici } = useOturum();
  const [planlar, setPlanlar] = useState([]);
  const [secili, setSecili] = useState(null); // Şu an gösterilen plan
  const detayRef = useRef(null); // PDF indirme için referans

  useEffect(() => {
    istemci.get("/plans").then(cevap => setPlanlar(cevap.data)).catch(()=>{});
  }, []);

  // Plan türü kodlarını Türkçe etiketlere çevirme sözlüğü
  const etiketler = { workout:"Antrenman", diet:"Beslenme", body_analysis:"Vücut Analizi" };

  return (
    <div className="min-h-screen pt-24 pb-16 px-6 lg:px-8 max-w-7xl mx-auto" data-testid="profil-page">
      <div className="mb-10">
        <div className="overline mb-2 flex items-center gap-2"><User className="w-4 h-4" /> PROFİL</div>
        <h1 className="font-heading text-5xl uppercase">{kullanici?.name}</h1>
        <p className="text-zinc-400 mt-2 text-sm">{kullanici?.email}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sol kolon - geçmiş plan listesi */}
        <div className="md:col-span-1 bg-[#121212] border border-white/10 p-5 max-h-[70vh] overflow-y-auto">
          <h3 className="overline mb-4">GEÇMİŞ PLANLARIN ({planlar.length})</h3>
          {planlar.length === 0 && <p className="text-zinc-500 text-sm">Henüz plan yok.</p>}
          <div className="space-y-2">
            {planlar.map(plan => (
              <button key={plan.id} onClick={()=>setSecili(plan)} className={`w-full text-left p-3 border ${secili?.id===plan.id ? "border-[#FF3B30] bg-[#1A1A1A]" : "border-white/10 hover:border-white/30"} transition-colors`} data-testid={`history-${plan.id}`}>
                <div className="text-xs text-[#FF3B30] font-mono uppercase mb-1">{etiketler[plan.type] || plan.type}</div>
                <div className="text-xs text-zinc-500">{new Date(plan.created_at).toLocaleString("tr-TR")}</div>
              </button>
            ))}
          </div>
        </div>
        {/* Sağ kolon - seçilen planın detayı ve PDF butonu */}
        <div className="md:col-span-2">
          {secili && (
            <div className="mb-3 flex justify-end">
              <button onClick={() => pdfIndir(detayRef, `${etiketler[secili.type] || "plan"}.pdf`)} className="flex items-center gap-2 px-4 py-2 text-xs border border-white/20 hover:border-[#FF3B30] hover:text-[#FF3B30] text-white tracking-widest uppercase transition-colors" data-testid="profil-download-pdf">
                <Download className="w-4 h-4" /> PDF İndir
              </button>
            </div>
          )}
          <div ref={detayRef} className="bg-[#121212] border border-white/10 p-6 min-h-[60vh]" data-testid="history-detail">
            {!secili && <div className="text-zinc-500">Bir plan seç.</div>}
            {secili && <IcerikGosterici metin={secili.content} />}
          </div>
        </div>
      </div>
    </div>
  );
};

// İlerleme takibi sayfası - antrenman kayıtları tutulur, istatistik gösterilir
const Ilerleme = () => {
  const [kayitlar, setKayitlar] = useState([]);
  const [form, setForm] = useState({
    exercise: "",
    weight: 0,
    reps: 0,
    sets: 0,
    notes: "",
    date: new Date().toISOString().slice(0,10), // Bugünün tarihi
  });
  const [yukleniyor, setYukleniyor] = useState(false);

  const degistir = (anahtar, deger) => setForm(oncekiDurum => ({...oncekiDurum, [anahtar]: deger}));

  // Kayıtları sunucudan yeniden çek
  const yukle = () => istemci.get("/progress").then(cevap => setKayitlar(cevap.data)).catch(()=>{});
  useEffect(() => { yukle(); }, []);

  // Yeni kayıt ekleme
  const gonder = async (e) => {
    e.preventDefault();
    if (!form.exercise.trim()) return toast.error("Egzersiz adı gerekli");
    setYukleniyor(true);
    try {
      await istemci.post("/progress", {
        ...form,
        weight: parseFloat(form.weight) || 0,
        reps: parseInt(form.reps) || 0,
        sets: parseInt(form.sets) || 0,
      });
      toast.success("Kayıt eklendi");
      // Formu sıfırla
      setForm({ exercise: "", weight: 0, reps: 0, sets: 0, notes: "", date: new Date().toISOString().slice(0,10) });
      yukle();
    } catch (hata) {
      toast.error(hata?.response?.data?.detail || "Hata");
    } finally {
      setYukleniyor(false);
    }
  };

  // Kayıt silme
  const sil = async (id) => {
    try {
      await istemci.delete(`/progress/${id}`);
      toast.success("Silindi");
      yukle();
    } catch {
      toast.error("Silinemedi");
    }
  };

  // Egzersize göre en yüksek ağırlıkları hesapla (kişisel rekorlar)
  const egzersizGruplari = kayitlar.reduce((toplam, kayit) => {
    if (!toplam[kayit.exercise] || kayit.weight > toplam[kayit.exercise].weight) {
      toplam[kayit.exercise] = kayit;
    }
    return toplam;
  }, {});
  const enIyiKaldirmalar = Object.values(egzersizGruplari);

  return (
    <div className="min-h-screen pt-24 pb-16 px-6 lg:px-8 max-w-7xl mx-auto" data-testid="ilerleme-page">
      <div className="mb-10">
        <div className="overline mb-2 flex items-center gap-2"><TrendingUp className="w-4 h-4" /> ANTRENMAN TAKİBİ</div>
        <h1 className="font-heading text-5xl uppercase">İlerlemen <span className="text-[#FF3B30]">sayılarda.</span></h1>
      </div>

      {/* İstatistik kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <IstatistikKart etiket="Toplam Kayıt" deger={kayitlar.length} />
        <IstatistikKart etiket="Egzersiz Çeşidi" deger={enIyiKaldirmalar.length} />
        <IstatistikKart etiket="Toplam Set" deger={kayitlar.reduce((t,k)=>t+k.sets,0)} />
        <IstatistikKart etiket="Toplam Tekrar" deger={kayitlar.reduce((t,k)=>t+k.reps*k.sets,0)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Sol kolon - yeni kayıt formu */}
        <form onSubmit={gonder} className="md:col-span-2 bg-[#121212] border border-white/10 p-6 space-y-4" data-testid="ilerleme-form">
          <h3 className="overline">YENİ KAYIT EKLE</h3>
          <Alan etiket="Egzersiz">
            <input type="text" value={form.exercise} onChange={e=>degistir("exercise", e.target.value)} placeholder="Bench Press, Squat..." className="inp" data-testid="ilerleme-exercise" />
          </Alan>
          <div className="grid grid-cols-3 gap-2">
            <Alan etiket="Ağırlık (kg)">
              <input type="number" step="0.5" value={form.weight} onChange={e=>degistir("weight", e.target.value)} className="inp" data-testid="ilerleme-weight" />
            </Alan>
            <Alan etiket="Tekrar">
              <input type="number" value={form.reps} onChange={e=>degistir("reps", e.target.value)} className="inp" data-testid="ilerleme-reps" />
            </Alan>
            <Alan etiket="Set">
              <input type="number" value={form.sets} onChange={e=>degistir("sets", e.target.value)} className="inp" data-testid="ilerleme-sets" />
            </Alan>
          </div>
          <Alan etiket="Tarih">
            <input type="date" value={form.date} onChange={e=>degistir("date", e.target.value)} className="inp" data-testid="ilerleme-date" />
          </Alan>
          <Alan etiket="Not (opsiyonel)">
            <input type="text" value={form.notes} onChange={e=>degistir("notes", e.target.value)} className="inp" data-testid="ilerleme-notes" />
          </Alan>
          <button type="submit" disabled={yukleniyor} className="w-full py-3 bg-[#FF3B30] hover:bg-[#FF5C53] disabled:opacity-60 text-white font-bold tracking-widest uppercase transition-colors flex items-center justify-center gap-2" data-testid="ilerleme-submit">
            <Plus className="w-4 h-4" /> {yukleniyor ? "Ekleniyor..." : "Kayıt Ekle"}
          </button>
        </form>

        {/* Sağ kolon - geçmiş kayıt listesi */}
        <div className="md:col-span-3 bg-[#121212] border border-white/10 p-6 min-h-[400px]" data-testid="ilerleme-list">
          <h3 className="overline mb-4">GEÇMİŞ KAYITLAR</h3>
          {kayitlar.length === 0 ? (
            <p className="text-zinc-500 text-sm">Henüz kayıt yok. İlk antrenmanını ekle!</p>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {kayitlar.map(kayit => (
                <div key={kayit.id} className="flex items-center justify-between border border-white/10 p-3 hover:border-white/20 transition-colors" data-testid={`log-${kayit.id}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-heading text-lg uppercase">{kayit.exercise}</span>
                      <span className="font-mono text-sm text-[#FF3B30]">{kayit.weight}kg × {kayit.reps} × {kayit.sets}set</span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">
                      {new Date(kayit.date).toLocaleDateString("tr-TR")} {kayit.notes && `• ${kayit.notes}`}
                    </div>
                  </div>
                  <button onClick={()=>sil(kayit.id)} className="text-zinc-500 hover:text-[#FF3B30] p-2 transition-colors" data-testid={`delete-log-${kayit.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Sık sorulan sorular - accordion şeklinde
const SSS_LISTESI = [
  { s: "Kuvvet.AI nedir ve nasıl çalışır?", c: "Kuvvet.AI, yapay zeka destekli bir spor salonu platformudur. Hedeflerine ve ölçülerine göre sana özel antrenman programı, beslenme planı ve vücut analizi üretir. Ayrıca 7/24 sohbet edebileceğin yapay zeka koçun vardır." },
  { s: "Üye olmak ücretli mi?", c: "Hayır, Başlangıç paketi tamamen ücretsizdir. Yapay zeka araçlarını sınırlı da olsa deneyebilirsin. Daha fazla özellik için ATLET veya ELİT paketine geçebilirsin." },
  { s: "Kayıt olurken hangi bilgileri vermem gerekiyor?", c: "Sadece isim, e-posta ve en az 6 karakter uzunluğunda bir şifre yeterli. Plan oluştururken boy, kilo gibi bilgilerini sonradan ekleyebilirsin." },
  { s: "Şifremi unuttum, ne yapmalıyım?", c: "Şifreni unuttuysan destek ekibimizle iletişime geç. Admin üzerinden hesabının şifresini güvenli bir şekilde sıfırlayabiliriz." },
  { s: "Oluşturduğum planları kaybeder miyim?", c: "Hayır. Her oluşturduğun antrenman, beslenme ve vücut analizi planı hesabında kalıcı olarak saklanır. Profil sayfandan istediğin zaman geri dönüp inceleyebilir, PDF olarak indirebilirsin." },
  { s: "Antrenman ilerleme takibi nasıl çalışıyor?", c: "'İlerleme' sayfasında her antrenmanda yaptığın egzersizleri, ağırlığı, tekrar ve set sayısını kaydedebilirsin. Böylece zaman içindeki gelişimini sayılarla takip edersin." },
  { s: "Yapay zeka koç hangi dillerde cevap verir?", c: "Tamamen Türkçe olarak tasarlandı. Antrenman, beslenme, motivasyon ve toparlanma konularında sorularını yanıtlar." },
  { s: "Verilerim güvende mi?", c: "Şifreler bcrypt ile tek yönlü şifrelenir ve asla düz metin olarak saklanmaz. Kişisel bilgilerin sadece senin hesabında görünür; yapay zeka servislerine sadece ilgili plan bilgisi gönderilir." },
  { s: "Aboneliğimi iptal edebilir miyim?", c: "Evet, istediğin zaman iptal edebilirsin. İptal sonrasında dönem sonuna kadar mevcut özelliklerden faydalanmaya devam edersin." },
  { s: "İletişim formundan gönderdiğim mesaja ne kadar sürede dönülür?", c: "Ekibimiz 1-2 iş günü içinde geri dönüş yapar. Acil durumlar için 'destek' kategorisini seçebilirsin." },
];

// Tekil SSS öğesi - tıklanınca açılır/kapanır
const SssOgesi = ({ soru, cevap, acik, ac }) => (
  <div className="border border-white/10" data-testid="sss-item">
    <button onClick={ac} className="w-full text-left p-5 flex items-center justify-between gap-4 hover:bg-white/5 transition-colors">
      <span className="font-heading text-lg uppercase">{soru}</span>
      <span className={`text-[#FF3B30] text-2xl transition-transform ${acik ? "rotate-45" : ""}`}>+</span>
    </button>
    {acik && (
      <div className="px-5 pb-5 text-zinc-300 leading-relaxed text-sm border-t border-white/10 pt-4" data-testid="sss-answer">
        {cevap}
      </div>
    )}
  </div>
);

// S.S.S. sayfası - giriş yapmadan erişilebilir
const Sss = () => {
  const [acik, setAcik] = useState(null);
  return (
    <div className="min-h-screen pt-24 pb-16 px-6 lg:px-8 max-w-4xl mx-auto" data-testid="sss-page">
      <div className="mb-10">
        <div className="overline mb-2">SIK SORULAN SORULAR</div>
        <h1 className="font-heading text-5xl uppercase">Cevaplar <span className="text-[#FF3B30]">burada.</span></h1>
        <p className="text-zinc-400 mt-3">Aradığın cevabı bulamazsan <Link to="/iletisim" className="text-[#FF3B30] hover:underline">iletişim</Link> sayfasından bize yazabilirsin.</p>
      </div>
      <div className="space-y-3">
        {SSS_LISTESI.map((ogeler, i) => (
          <SssOgesi key={i} soru={ogeler.s} cevap={ogeler.c} acik={acik === i} ac={() => setAcik(acik === i ? null : i)} />
        ))}
      </div>
    </div>
  );
};

// İletişim sayfası - kullanıcılar şikayet/öneri/soru/destek mesajı gönderir
const Iletisim = () => {
  const { kullanici } = useOturum();
  const [sekme, setSekme] = useState("form"); // "form" veya "sss"
  const [acikSss, setAcikSss] = useState(null);
  const [form, setForm] = useState({
    name: kullanici?.name || "",
    email: kullanici?.email || "",
    category: "soru",
    subject: "",
    message: "",
  });
  const [yukleniyor, setYukleniyor] = useState(false);

  const degistir = (anahtar, deger) => setForm(s => ({...s, [anahtar]: deger}));

  const gonder = async (e) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) return toast.error("Konu ve mesaj gerekli");
    setYukleniyor(true);
    try {
      await istemci.post("/contact", form);
      toast.success("Mesajın iletildi. En kısa sürede dönüş yapacağız.");
      setForm({ ...form, subject: "", message: "" });
    } catch (hata) {
      toast.error(hata?.response?.data?.detail || "Gönderilemedi");
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-16 px-6 lg:px-8 max-w-4xl mx-auto" data-testid="iletisim-page">
      <div className="mb-8">
        <div className="overline mb-2 flex items-center gap-2"><Mail className="w-4 h-4" /> İLETİŞİM</div>
        <h1 className="font-heading text-5xl uppercase">Bize <span className="text-[#FF3B30]">ulaş.</span></h1>
      </div>

      {/* Sekme başlıkları */}
      <div className="flex border-b border-white/10 mb-8">
        <button onClick={()=>setSekme("form")} className={`px-6 py-3 text-sm tracking-widest uppercase font-bold transition-colors ${sekme === "form" ? "text-[#FF3B30] border-b-2 border-[#FF3B30]" : "text-zinc-400 hover:text-white"}`} data-testid="tab-form">
          Bize Yaz
        </button>
        <button onClick={()=>setSekme("sss")} className={`px-6 py-3 text-sm tracking-widest uppercase font-bold transition-colors ${sekme === "sss" ? "text-[#FF3B30] border-b-2 border-[#FF3B30]" : "text-zinc-400 hover:text-white"}`} data-testid="tab-sss">
          Sık Sorulan Sorular
        </button>
      </div>

      {sekme === "form" ? (
        <form onSubmit={gonder} className="bg-[#121212] border border-white/10 p-6 space-y-4" data-testid="iletisim-form">
          <p className="text-zinc-400 text-sm">Şikayet, öneri, soru veya destek talebi için formu kullanın.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Alan etiket="Adın">
              <input type="text" required value={form.name} onChange={e=>degistir("name", e.target.value)} className="inp" data-testid="iletisim-name" />
            </Alan>
            <Alan etiket="E-posta">
              <input type="email" required value={form.email} onChange={e=>degistir("email", e.target.value)} className="inp" data-testid="iletisim-email" />
            </Alan>
          </div>
          <Alan etiket="Kategori">
            <select value={form.category} onChange={e=>degistir("category", e.target.value)} className="inp" data-testid="iletisim-category">
              <option value="sikayet">Şikayet</option>
              <option value="oneri">Öneri</option>
              <option value="soru">Soru</option>
              <option value="destek">Destek</option>
              <option value="diger">Diğer</option>
            </select>
          </Alan>
          <Alan etiket="Konu">
            <input type="text" required value={form.subject} onChange={e=>degistir("subject", e.target.value)} className="inp" data-testid="iletisim-subject" />
          </Alan>
          <Alan etiket="Mesajın">
            <textarea rows="6" required value={form.message} onChange={e=>degistir("message", e.target.value)} className="inp" data-testid="iletisim-message" />
          </Alan>
          <button type="submit" disabled={yukleniyor} className="px-8 py-3 bg-[#FF3B30] hover:bg-[#FF5C53] disabled:opacity-60 text-white font-bold tracking-widest uppercase transition-colors flex items-center gap-2" data-testid="iletisim-submit">
            <Send className="w-4 h-4" /> {yukleniyor ? "Gönderiliyor..." : "Gönder"}
          </button>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-zinc-400 text-sm mb-6">Aşağıdaki sorular kullanıcıların en sık merak ettiği konulardır. Cevabını bulamazsan form sekmesinden bize yaz.</p>
          {SSS_LISTESI.map((ogeler, i) => (
            <SssOgesi key={i} soru={ogeler.s} cevap={ogeler.c} acik={acikSss === i} ac={() => setAcikSss(acikSss === i ? null : i)} />
          ))}
        </div>
      )}
    </div>
  );
};

// Kategori kodlarını Türkçe etikete çevirme sözlüğü (admin panelinde kullanılır)
const KATEGORI_ETIKET = {
  sikayet: "Şikayet",
  oneri: "Öneri",
  soru: "Soru",
  destek: "Destek",
  diger: "Diğer",
};

// Admin panel - özet istatistikler ve kısayollar
const AdminPanel = () => {
  const [istatistik, setIstatistik] = useState(null);
  useEffect(() => {
    istemci.get("/admin/stats").then(r => setIstatistik(r.data)).catch(()=>{});
  }, []);

  return (
    <div className="min-h-screen pt-24 pb-16 px-6 lg:px-8 max-w-7xl mx-auto" data-testid="admin-page">
      <div className="mb-10">
        <div className="overline mb-2 flex items-center gap-2"><Shield className="w-4 h-4" /> YÖNETİM PANELİ</div>
        <h1 className="font-heading text-5xl uppercase">Kontrol <span className="text-[#FF3B30]">merkezi.</span></h1>
      </div>

      {/* İstatistik kartları */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
        <IstatistikKart etiket="Üye" deger={istatistik?.toplam_kullanici ?? "-"} />
        <IstatistikKart etiket="Plan" deger={istatistik?.toplam_plan ?? "-"} />
        <IstatistikKart etiket="İlerleme Kaydı" deger={istatistik?.toplam_ilerleme ?? "-"} />
        <IstatistikKart etiket="Toplam Mesaj" deger={istatistik?.toplam_mesaj ?? "-"} />
        <IstatistikKart etiket="Okunmamış" deger={istatistik?.okunmamis_mesaj ?? "-"} />
      </div>

      {/* Hızlı erişim kartları */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/admin/uyeler" className="bg-[#121212] border border-white/10 p-6 hover-lift group" data-testid="admin-link-users">
          <Users className="w-7 h-7 text-[#FF3B30] mb-4" strokeWidth={2.5} />
          <h3 className="font-heading text-2xl uppercase">Üye Yönetimi</h3>
          <p className="text-zinc-500 text-sm mt-1">Kullanıcıları listele, detayları gör, şifre sıfırla, sil</p>
        </Link>
        <Link to="/admin/mesajlar" className="bg-[#121212] border border-white/10 p-6 hover-lift group" data-testid="admin-link-inbox">
          <Inbox className="w-7 h-7 text-[#FF3B30] mb-4" strokeWidth={2.5} />
          <h3 className="font-heading text-2xl uppercase">Gelen Kutusu</h3>
          <p className="text-zinc-500 text-sm mt-1">İletişim mesajlarını kategoriye göre incele</p>
        </Link>
        <div className="bg-[#121212] border border-white/10 p-6">
          <BarChart3 className="w-7 h-7 text-[#FF3B30] mb-4" strokeWidth={2.5} />
          <h3 className="font-heading text-2xl uppercase">Özet</h3>
          <p className="text-zinc-500 text-sm mt-1">Sistemdeki tüm aktivite buradan izlenir.</p>
        </div>
      </div>
    </div>
  );
};

// Admin - Üye yönetimi sayfası
const AdminUyeler = () => {
  const [uyeler, setUyeler] = useState([]);
  const [aktif, setAktif] = useState(null); // Detayı görüntülenen kullanıcı
  const [detay, setDetay] = useState(null);
  const [yeniSifre, setYeniSifre] = useState("");
  const [silmeOnay, setSilmeOnay] = useState(false); // 2-adımlı silme onayı

  const yukle = () => istemci.get("/admin/users").then(r => setUyeler(r.data)).catch(()=>{});
  useEffect(() => { yukle(); }, []);

  // Kullanıcı detayını aç
  const detayAc = (u) => {
    setAktif(u.id);
    setDetay(null);
    setSilmeOnay(false); // Yeni kullanıcıya geçildiğinde onayı sıfırla
    istemci.get(`/admin/users/${u.id}`).then(r => setDetay(r.data)).catch(()=>toast.error("Detay alınamadı"));
  };

  // Kullanıcı sil - 2 adımlı onay: ilk tıklamada "Emin misin?" moduna geçer,
  // ikinci tıklamada gerçekten siler (tarayıcı confirm() diyaloğuna bağlı değil).
  const sil = async (id) => {
    if (!silmeOnay) {
      setSilmeOnay(true);
      toast.warning("Silmek için tekrar tıklayın");
      setTimeout(() => setSilmeOnay(false), 5000); // 5 saniye sonra iptal ol
      return;
    }
    try {
      await istemci.delete(`/admin/users/${id}`);
      toast.success("Üye silindi");
      setAktif(null);
      setDetay(null);
      setSilmeOnay(false);
      yukle();
    } catch (hata) {
      toast.error(hata?.response?.data?.detail || "Silinemedi");
      setSilmeOnay(false);
    }
  };

  // Şifre sıfırla
  const sifreSifirla = async (id) => {
    if (yeniSifre.length < 6) return toast.error("Şifre en az 6 karakter olmalı");
    try {
      await istemci.post(`/admin/users/${id}/reset-password`, { new_password: yeniSifre });
      toast.success("Şifre güncellendi");
      setYeniSifre("");
    } catch (hata) {
      toast.error(hata?.response?.data?.detail || "Hata");
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-16 px-6 lg:px-8 max-w-7xl mx-auto" data-testid="admin-uyeler-page">
      <div className="mb-10">
        <div className="overline mb-2 flex items-center gap-2"><Users className="w-4 h-4" /> ÜYELER</div>
        <h1 className="font-heading text-5xl uppercase">Tüm <span className="text-[#FF3B30]">üyeler</span> ({uyeler.length})</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Sol: üye listesi */}
        <div className="lg:col-span-2 bg-[#121212] border border-white/10 max-h-[75vh] overflow-y-auto">
          {uyeler.length === 0 ? (
            <p className="p-6 text-zinc-500 text-sm">Henüz üye yok.</p>
          ) : uyeler.map(u => (
            <button key={u.id} onClick={()=>detayAc(u)} className={`w-full text-left p-4 border-b border-white/5 hover:bg-white/5 transition-colors ${aktif === u.id ? "bg-[#1A1A1A] border-l-2 border-l-[#FF3B30]" : ""}`} data-testid={`admin-user-${u.id}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-heading text-lg uppercase flex items-center gap-2">
                  {u.name}
                  {u.role === "admin" && <Shield className="w-3.5 h-3.5 text-[#FF3B30]" />}
                </span>
                <span className="text-xs text-zinc-500">{new Date(u.created_at).toLocaleDateString("tr-TR")}</span>
              </div>
              <div className="text-xs text-zinc-500 mb-2">{u.email}</div>
              <div className="flex gap-3 text-xs">
                <span className="text-[#FF3B30] font-mono">{u.plan_count} plan</span>
                <span className="text-[#00FFFF] font-mono">{u.progress_count} kayıt</span>
              </div>
            </button>
          ))}
        </div>

        {/* Sağ: detay */}
        <div className="lg:col-span-3 bg-[#121212] border border-white/10 p-6 min-h-[500px]">
          {!aktif && <div className="text-zinc-500 text-sm">Bir üye seç.</div>}
          {aktif && !detay && <div className="text-zinc-400 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/> Detaylar yükleniyor...</div>}
          {detay && (
            <div className="space-y-6">
              {/* Kullanıcı bilgi kutusu */}
              <div>
                <h3 className="overline mb-3">KULLANICI BİLGİLERİ</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <AdminBilgi etiket="İsim" deger={detay.user.name} />
                  <AdminBilgi etiket="E-posta" deger={detay.user.email} />
                  <AdminBilgi etiket="Rol" deger={detay.user.role || "user"} />
                  <AdminBilgi etiket="Kayıt Tarihi" deger={new Date(detay.user.created_at).toLocaleString("tr-TR")} />
                  <AdminBilgi etiket="Kullanıcı ID" deger={detay.user.id} mono />
                  <AdminBilgi etiket="Şifre (şifreli)" deger={detay.user.password_hash} mono kucuk />
                </div>
                <p className="text-xs text-zinc-600 mt-2">Parolalar bcrypt ile tek yönlü şifrelenir, geri çözülemez. Yeni şifre atamak için aşağıdaki kutuyu kullanın.</p>
              </div>

              {/* Şifre sıfırla + sil aksiyonları */}
              {detay.user.role !== "admin" && (
                <div className="border border-white/10 p-4">
                  <h3 className="overline mb-3 flex items-center gap-2"><KeyRound className="w-3.5 h-3.5" /> YÖNETİM</h3>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input type="text" placeholder="Yeni şifre (min 6)" value={yeniSifre} onChange={e=>setYeniSifre(e.target.value)} className="inp flex-1" data-testid="admin-new-password" />
                    <button onClick={()=>sifreSifirla(detay.user.id)} className="px-4 py-2 bg-[#FF3B30] hover:bg-[#FF5C53] text-white font-bold tracking-widest uppercase text-xs transition-colors" data-testid="admin-reset-password">Şifreyi Sıfırla</button>
                    <button onClick={()=>sil(detay.user.id)} className={`px-4 py-2 font-bold tracking-widest uppercase text-xs transition-colors ${silmeOnay ? "bg-[#FF3B30] text-white animate-pulse" : "border border-[#FF3B30] hover:bg-[#FF3B30]/20 text-[#FF3B30]"}`} data-testid="admin-delete-user">
                      {silmeOnay ? "Emin misin? Tıkla" : "Üyeyi Sil"}
                    </button>
                  </div>
                </div>
              )}

              {/* Planlar */}
              <div>
                <h3 className="overline mb-3">PLANLAR ({detay.plans.length})</h3>
                {detay.plans.length === 0 ? <p className="text-zinc-500 text-sm">Plan yok.</p> : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {detay.plans.map(p => (
                      <div key={p.id} className="border border-white/10 p-3 text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs text-[#FF3B30] uppercase">{p.type.replace("_"," ")}</span>
                          <span className="text-xs text-zinc-500">{new Date(p.created_at).toLocaleString("tr-TR")}</span>
                        </div>
                        <p className="text-zinc-400 text-xs line-clamp-2">{p.content.slice(0, 150)}...</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* İlerleme kayıtları */}
              <div>
                <h3 className="overline mb-3">İLERLEME KAYITLARI ({detay.progress.length})</h3>
                {detay.progress.length === 0 ? <p className="text-zinc-500 text-sm">Kayıt yok.</p> : (
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {detay.progress.map(l => (
                      <div key={l.id} className="border border-white/10 p-2 text-xs flex justify-between">
                        <span className="font-heading uppercase">{l.exercise}</span>
                        <span className="font-mono text-[#FF3B30]">{l.weight}kg × {l.reps} × {l.sets}</span>
                        <span className="text-zinc-500">{l.date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-xs text-zinc-500">Yapay zeka sohbet mesajı: <span className="font-mono text-[#FF3B30]">{detay.chat_count}</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AdminBilgi = ({ etiket, deger, mono, kucuk }) => (
  <div className="bg-[#0A0A0A] border border-white/10 p-3">
    <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">{etiket}</div>
    <div className={`text-white ${mono ? "font-mono" : ""} ${kucuk ? "text-xs break-all" : ""}`}>{deger || "-"}</div>
  </div>
);

// Admin - gelen kutusu (iletişim mesajları)
const AdminMesajlar = () => {
  const [mesajlar, setMesajlar] = useState([]);
  const [filtre, setFiltre] = useState("");
  const [aktif, setAktif] = useState(null);
  const [silmeOnay, setSilmeOnay] = useState(false);

  const yukle = () => {
    const params = filtre ? `?category=${filtre}` : "";
    istemci.get(`/admin/contact${params}`).then(r => setMesajlar(r.data)).catch(()=>{});
  };
  useEffect(() => { yukle(); }, [filtre]);

  const guncelle = async (id, alanlar) => {
    try {
      const params = new URLSearchParams(alanlar).toString();
      await istemci.patch(`/admin/contact/${id}?${params}`);
      yukle();
    } catch { toast.error("Güncellenemedi"); }
  };

  // 2-adımlı silme onayı
  const sil = async (id) => {
    if (!silmeOnay) {
      setSilmeOnay(true);
      toast.warning("Silmek için tekrar tıklayın");
      setTimeout(() => setSilmeOnay(false), 5000);
      return;
    }
    try {
      await istemci.delete(`/admin/contact/${id}`);
      toast.success("Silindi");
      if (aktif?.id === id) setAktif(null);
      setSilmeOnay(false);
      yukle();
    } catch {
      toast.error("Silinemedi");
      setSilmeOnay(false);
    }
  };

  // Kategori filtresi sekmeleri
  const sekmeler = [
    { anahtar: "", etiket: "Tümü" },
    { anahtar: "sikayet", etiket: "Şikayet" },
    { anahtar: "oneri", etiket: "Öneri" },
    { anahtar: "soru", etiket: "Soru" },
    { anahtar: "destek", etiket: "Destek" },
    { anahtar: "diger", etiket: "Diğer" },
  ];

  return (
    <div className="min-h-screen pt-24 pb-16 px-6 lg:px-8 max-w-7xl mx-auto" data-testid="admin-mesajlar-page">
      <div className="mb-8">
        <div className="overline mb-2 flex items-center gap-2"><Inbox className="w-4 h-4" /> GELEN KUTUSU</div>
        <h1 className="font-heading text-5xl uppercase">Kullanıcı <span className="text-[#FF3B30]">mesajları</span></h1>
      </div>

      {/* Kategori sekmeleri */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {sekmeler.map(s => (
          <button key={s.anahtar} onClick={()=>{ setFiltre(s.anahtar); setAktif(null); }} className={`px-4 py-2 text-xs uppercase tracking-widest border whitespace-nowrap transition-colors ${filtre === s.anahtar ? "bg-[#FF3B30] border-[#FF3B30] text-white" : "border-white/20 text-zinc-300 hover:border-white/40"}`} data-testid={`filter-${s.anahtar || "all"}`}>
            {s.etiket}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Sol: mesaj listesi */}
        <div className="lg:col-span-2 bg-[#121212] border border-white/10 max-h-[70vh] overflow-y-auto">
          {mesajlar.length === 0 ? (
            <p className="p-6 text-zinc-500 text-sm">Mesaj yok.</p>
          ) : mesajlar.map(m => (
            <button key={m.id} onClick={()=>{ setAktif(m); if (!m.is_read) guncelle(m.id, {is_read: true}); }} className={`w-full text-left p-4 border-b border-white/5 hover:bg-white/5 transition-colors ${aktif?.id === m.id ? "bg-[#1A1A1A] border-l-2 border-l-[#FF3B30]" : ""}`} data-testid={`admin-message-${m.id}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {!m.is_read && <span className="w-2 h-2 rounded-full bg-[#FF3B30] pulse-dot" />}
                  <span className="font-heading text-base uppercase">{m.name}</span>
                </div>
                <span className="text-[10px] uppercase tracking-widest text-[#FF3B30]">{KATEGORI_ETIKET[m.category] || m.category}</span>
              </div>
              <div className="text-xs text-zinc-400 truncate">{m.subject}</div>
              <div className="text-[10px] text-zinc-600 mt-1">{new Date(m.created_at).toLocaleString("tr-TR")}</div>
            </button>
          ))}
        </div>

        {/* Sağ: mesaj detayı */}
        <div className="lg:col-span-3 bg-[#121212] border border-white/10 p-6 min-h-[500px]">
          {!aktif ? (
            <div className="text-zinc-500 text-sm">Bir mesaj seç.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs uppercase tracking-widest text-[#FF3B30]">{KATEGORI_ETIKET[aktif.category]}</span>
                    {aktif.replied && <span className="text-xs px-2 py-0.5 bg-green-900/40 text-green-400 uppercase tracking-widest">Cevaplandı</span>}
                  </div>
                  <h2 className="font-heading text-3xl uppercase">{aktif.subject}</h2>
                </div>
                <button onClick={()=>sil(aktif.id)} className={`p-2 transition-colors ${silmeOnay ? "text-[#FF3B30] animate-pulse" : "text-zinc-500 hover:text-[#FF3B30]"}`} data-testid="admin-msg-delete" title={silmeOnay ? "Silmek için tekrar tıkla" : "Sil"}><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="border-t border-white/10 pt-4 text-sm">
                <div className="mb-2"><span className="text-zinc-500">Gönderen:</span> <span className="text-white font-medium">{aktif.name}</span></div>
                <div className="mb-2"><span className="text-zinc-500">E-posta:</span> <a href={`mailto:${aktif.email}`} className="text-[#FF3B30] hover:underline">{aktif.email}</a></div>
                <div className="mb-4"><span className="text-zinc-500">Tarih:</span> <span className="text-white">{new Date(aktif.created_at).toLocaleString("tr-TR")}</span></div>
                <div className="bg-[#0A0A0A] border border-white/10 p-4 whitespace-pre-wrap text-zinc-200 leading-relaxed">{aktif.message}</div>
              </div>

              {/* Önceki yanıt (varsa) */}
              {aktif.admin_reply && (
                <div className="border border-[#FF3B30]/30 bg-[#FF3B30]/5 p-4">
                  <div className="overline mb-2 flex items-center gap-2">
                    <Send className="w-3 h-3" /> YANITIN
                    {aktif.replied_at && <span className="text-zinc-500 font-normal normal-case tracking-normal text-xs">· {new Date(aktif.replied_at).toLocaleString("tr-TR")}</span>}
                  </div>
                  <div className="whitespace-pre-wrap text-zinc-200 text-sm leading-relaxed">{aktif.admin_reply}</div>
                </div>
              )}

              {/* Yanıt yazma kutusu */}
              <div className="border border-white/10 p-4">
                <h3 className="overline mb-3">{aktif.admin_reply ? "YANITI GÜNCELLE" : "YANIT YAZ"}</h3>
                <textarea rows="5" value={yanit} onChange={e=>setYanit(e.target.value)} placeholder="Kullanıcıya yanıtınızı buraya yazın..." className="inp mb-3" data-testid="admin-msg-reply-text" />
                <div className="flex flex-wrap gap-2">
                  <button onClick={yanitGonder} disabled={yanitlaniyor} className="px-4 py-2 bg-[#FF3B30] hover:bg-[#FF5C53] disabled:opacity-60 text-white font-bold tracking-widest uppercase text-xs transition-colors flex items-center gap-2" data-testid="admin-msg-reply-send">
                    <Send className="w-3.5 h-3.5" /> {yanitlaniyor ? "Kaydediliyor..." : "Yanıtı Kaydet"}
                  </button>
                  <a href={`mailto:${aktif.email}?subject=${encodeURIComponent("Re: " + aktif.subject)}&body=${encodeURIComponent(yanit)}`} className="px-4 py-2 border border-white/20 hover:border-white text-white font-bold tracking-widest uppercase text-xs transition-colors flex items-center gap-2" data-testid="admin-msg-reply-mail">
                    <Mail className="w-3.5 h-3.5" /> E-posta ile Gönder
                  </a>
                  <button onClick={()=>guncelle(aktif.id, {replied: !aktif.replied})} className="px-4 py-2 border border-white/20 hover:border-white text-white font-bold tracking-widest uppercase text-xs transition-colors" data-testid="admin-msg-toggle">
                    {aktif.replied ? "Cevaplanmadı işaretle" : "Cevaplandı işaretle"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// UYGULAMA KÖKÜ
// ----------------------------------------------------------------------------
// Tüm uygulamayı sarmalayan ana bileşen.
// Oturum sağlayıcısı, üst menü, toast bildirimleri ve rotalar burada kurulur.
// ----------------------------------------------------------------------------
function UygulamaIcerik() {
  const [yanPanelAcik, setYanPanelAcik] = useState(false);
  return (
    <>
      <UstMenu yanPaneliAc={() => setYanPanelAcik(true)} />
      <YanPanel acik={yanPanelAcik} kapat={() => setYanPanelAcik(false)} />
      <Toaster theme="dark" position="top-right" richColors />
      <Routes>
        {/* Herkese açık sayfalar */}
        <Route path="/" element={<AnaSayfa />} />
        <Route path="/giris" element={<Giris />} />
        <Route path="/kayit" element={<Kayit />} />
        <Route path="/iletisim" element={<Iletisim />} />
        <Route path="/sss" element={<Sss />} />
        {/* Sadece giriş yapmış kullanıcılar erişebilir */}
        <Route path="/panel" element={<OzelRota><Panel /></OzelRota>} />
        <Route path="/antrenman" element={<OzelRota><Antrenman /></OzelRota>} />
        <Route path="/beslenme" element={<OzelRota><Beslenme /></OzelRota>} />
        <Route path="/vucut-analizi" element={<OzelRota><VucutAnalizi /></OzelRota>} />
        <Route path="/koc" element={<OzelRota><Koc /></OzelRota>} />
        <Route path="/ilerleme" element={<OzelRota><Ilerleme /></OzelRota>} />
        <Route path="/profil" element={<OzelRota><Profil /></OzelRota>} />
        {/* Sadece adminler erişebilir */}
        <Route path="/admin" element={<OzelRota sadeceAdmin><AdminPanel /></OzelRota>} />
        <Route path="/admin/uyeler" element={<OzelRota sadeceAdmin><AdminUyeler /></OzelRota>} />
        <Route path="/admin/mesajlar" element={<OzelRota sadeceAdmin><AdminMesajlar /></OzelRota>} />
      </Routes>
    </>
  );
}

export default function Uygulama() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <BrowserRouter>
        <OturumSaglayici>
          <UygulamaIcerik />
        </OturumSaglayici>
      </BrowserRouter>
    </div>
  );
}
        <Route path="/vucut-analizi" element={<OzelRota><VucutAnalizi /></OzelRota>} />
        <Route path="/koc" element={<OzelRota><Koc /></OzelRota>} />
        <Route path="/ilerleme" element={<OzelRota><Ilerleme /></OzelRota>} />
        <Route path="/profil" element={<OzelRota><Profil /></OzelRota>} />
        {/* Sadece adminler erişebilir */}
        <Route path="/admin" element={<OzelRota sadeceAdmin><AdminPanel /></OzelRota>} />
        <Route path="/admin/uyeler" element={<OzelRota sadeceAdmin><AdminUyeler /></OzelRota>} />
        <Route path="/admin/mesajlar" element={<OzelRota sadeceAdmin><AdminMesajlar /></OzelRota>} />
      </Routes>
    </>
  );
}

export default function Uygulama() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <BrowserRouter>
        <OturumSaglayici>
          <UygulamaIcerik />
        </OturumSaglayici>
      </BrowserRouter>
    </div>
  );
}
