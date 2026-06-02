// ============================================================================
// GİRİŞ NOKTASI
// ============================================================================
// Bu dosya React uygulamasının başlangıç noktasıdır.
// `public/index.html` içindeki <div id="root"> etiketine uygulamayı bağlar.
// Uygulamanın tüm içeriği Uygulama.js dosyasındadır.
// ============================================================================

import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";        // Genel stiller (renkler, fontlar, yardımcı sınıflar)
import Uygulama from "@/Uygulama"; // Ana uygulama bileşeni

// React 18+ kullandığımız için createRoot API'si ile bağlıyoruz
const kok = ReactDOM.createRoot(document.getElementById("root"));

// StrictMode, geliştirme aşamasında olası sorunları erken tespit etmek için kullanılır
kok.render(
  <React.StrictMode>
    <Uygulama />
  </React.StrictMode>
);
