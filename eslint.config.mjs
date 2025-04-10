// eslint.config.mjs - DÜZƏLDİLMİŞ VERSİYA
import eslintConfigPrettier from "eslint-config-prettier";
import js from "@eslint/js"; // ESLint-in JavaScript qaydaları
import globals from "globals"; // Qlobal dəyişənlər üçün (browser, node)

export default [
  // 1. ESLint-in tövsiyə edilən təməl qaydalarını tətbiq et
  js.configs.recommended,

  // 2. Xüsusi ayarlar (sizin seçimlərinizə əsasən)
  {
    files: ["**/*.js"], // .js faylları üçün
    languageOptions: {
      sourceType: "script" // Modul olmayan skriptlər
    }
  },
  {
    // Bütün JavaScript tipli fayllar üçün
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: { // Brauzer və Node qlobal dəyişənlərini tanı
        ...globals.browser,
        ...globals.node
      }
    }
  },

  // 3. ƏN VACİB: Prettier konfiqurasiyasını ƏN SONDA əlavə et
  // Bu, ESLint-in formatlama qaydalarını söndürür ki, Prettier ilə konflikt olmasın.
  eslintConfigPrettier // <<< BU HİSSƏ ƏLAVƏ EDİLDİ!
];