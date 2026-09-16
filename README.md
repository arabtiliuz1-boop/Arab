# Arabic Tutor Bot — MVP skeleton

## Nima ishlaydi hozir
- `/start` — asosiy menyu
- 📚 Lug'at — Supabase'dagi 1-guruh so'zlarini o'rgatadi (study card) + MCQ test
- Xato javoblar `user_mistakes` jadvaliga yoziladi (Personal Teacher poydevori)
- 🗣 AI Speaking va 📊 Progress — hozircha stub, keyingi bosqichda to'ldiriladi

## O'rnatish
1. `npm install`
2. `.env.example` faylni `.env` ga nusxalab, quyidagilarni to'ldiring:
   - `BOT_TOKEN` — @BotFather'dan
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY` — mavjud arab-kurs loyihangizdan (bir xil baza)
3. Supabase SQL Editor'da `migration_user_mistakes.sql` ni ishga tushiring
4. `src/supabaseClient.js` ichidagi `WORDS_TABLE` nomini haqiqiy jadval nomingiz bilan solishtiring — agar boshqacha bo'lsa, o'zgartiring
5. Lokal test: `npm start`

## Railway'ga deploy (download bot bilan bir xil pattern)
1. Yangi Railway loyiha yarating, shu papkani GitHub orqali ulang
2. Railway'ning "Variables" bo'limiga `.env`dagi 3 ta qiymatni qo'shing
3. Start command: `npm start`
4. Deploy bo'lgach, botga `/start` yozib tekshiring

## Keyingi qadamlar (rejalashtirilgan tartibda)
1. ✅ Lug'at (tayyor — shu skeleton)
2. Personal Teacher: `getTopMistakes()` funksiyasidan foydalanib, kuniga eng ko'p xato qilingan
   so'z/qoidalarni qayta mashq qildiruvchi `/takrorlash` komandasi qo'shish
3. AI Speaking: ovozli xabarni qabul qilish → Whisper API bilan matnga o'girish →
   Claude API bilan grammatika/talaffuz tahlili → foydalanuvchiga baho qaytarish
4. Qolgan funksiyalar (Conversation, Writing Checker, Reader, va h.k.) — MVP tasdiqlangach
