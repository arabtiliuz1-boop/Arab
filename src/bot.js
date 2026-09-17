const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();
const { getWordGroup, getWordsByIds, logMistake, getTopMistakes } = require('./supabaseClient');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Har bir foydalanuvchi uchun vaqtinchalik sessiya holati (xotira ichida — MVP uchun yetarli,
// keyinchalik ko'p foydalanuvchi bo'lsa Supabase'ga yoki Redis'ga ko'chirish kerak bo'ladi)
const sessions = new Map();

function mainMenu() {
  return Markup.keyboard([
    ['📚 Lug\'at', '🗣 AI Speaking'],
    ['📊 Mening progressim'],
  ]).resize();
}

bot.start((ctx) => {
  ctx.reply(
    `Assalomu alaykum, ${ctx.from.first_name}! Men sizning shaxsiy arab tili ustozingizman.\n\nQuyidagilardan birini tanlang:`,
    mainMenu()
  );
});

// ---------- LUG'AT (VOCABULARY) OQIMI ----------

bot.hears("📚 Lug'at", async (ctx) => {
  try {
    const words = await getWordGroup(1); // MVP: 1-guruhdan boshlaymiz
    if (!words || words.length === 0) {
      return ctx.reply("Hozircha so'zlar topilmadi. Supabase jadval nomini tekshiring.");
    }
    sessions.set(ctx.from.id, { words, index: 0, mode: 'study' });
    await sendStudyCard(ctx);
  } catch (err) {
    console.error(err);
    ctx.reply('Xatolik yuz berdi. Supabase ulanishini tekshiring.');
  }
});

async function sendStudyCard(ctx) {
  const session = sessions.get(ctx.from.id);
  const word = session.words[session.index];

  const text =
    `📖 So'z ${session.index + 1}/${session.words.length}\n\n` +
    `${word.arabic}\n` +
    `🇺🇿 ${word.uzbek}\n\n` +
    `Misol: ${word.example_arabic || ''}\n${word.example_uzbek || ''}` +
    (word.usage_note ? `\n\n💡 ${word.usage_note}` : '');

  await ctx.reply(
    text,
    Markup.inlineKeyboard([
      Markup.button.callback('Keyingi ➡️', 'next_word'),
      Markup.button.callback('✅ Testga o\'tish', 'start_quiz'),
    ])
  );
}

bot.action('next_word', async (ctx) => {
  const session = sessions.get(ctx.from.id);
  if (!session) return ctx.answerCbQuery();
  session.index = (session.index + 1) % session.words.length;
  await ctx.answerCbQuery();
  await sendStudyCard(ctx);
});

bot.action('start_quiz', async (ctx) => {
  const session = sessions.get(ctx.from.id);
  if (!session) return ctx.answerCbQuery();
  session.mode = 'quiz';
  session.index = 0;
  session.correctCount = 0;
  await ctx.answerCbQuery();
  await sendQuizQuestion(ctx);
});

async function sendQuizQuestion(ctx) {
  const session = sessions.get(ctx.from.id);
  const word = session.words[session.index];
  const pool = session.distractorPool || session.words;

  // Oddiy MCQ: to'g'ri tarjima + 3 ta tasodifiy noto'g'ri variant (distractor pool'dan)
  const wrongOptions = pool
    .filter((w) => w.id !== word.id)
    .sort(() => 0.5 - Math.random())
    .slice(0, 3)
    .map((w) => w.uzbek);

  const options = [...wrongOptions, word.uzbek].sort(() => 0.5 - Math.random());

  session.currentCorrectAnswer = word.uzbek;
  session.currentWordId = word.id;

  await ctx.reply(
    `"${word.arabic}" so'zining tarjimasini tanlang:`,
    Markup.inlineKeyboard(options.map((opt) => [Markup.button.callback(opt, `answer:${opt}`)]))
  );
}

bot.action(/^answer:(.+)$/, async (ctx) => {
  const session = sessions.get(ctx.from.id);
  if (!session) return ctx.answerCbQuery();

  const chosen = ctx.match[1];
  const correct = chosen === session.currentCorrectAnswer;

  if (correct) {
    session.correctCount += 1;
    await ctx.answerCbQuery('✅ To\'g\'ri!');
  } else {
    await ctx.answerCbQuery('❌ Noto\'g\'ri');
    // Xatoni kuzatuv jadvaliga yozamiz — Personal Teacher shu yerdan boshlanadi
    try {
      await logMistake({
        telegramUserId: ctx.from.id,
        wordId: session.currentWordId,
        mistakeType: 'translation',
        userAnswer: chosen,
        correctAnswer: session.currentCorrectAnswer,
      });
    } catch (err) {
      console.error('Mistake logging failed:', err);
    }
  }

  session.index += 1;
  if (session.index < session.words.length) {
    await sendQuizQuestion(ctx);
  } else {
    await ctx.reply(
      `Test tugadi! Natija: ${session.correctCount}/${session.words.length}`,
      mainMenu()
    );
    sessions.delete(ctx.from.id);
  }
});

// ---------- PERSONAL TEACHER (XATOLAR ASOSIDA TAKRORLASH) ----------

bot.hears('📊 Mening progressim', async (ctx) => {
  try {
    const mistakes = await getTopMistakes(ctx.from.id, 5);
    if (!mistakes || mistakes.length === 0) {
      return ctx.reply("Hali xato qilingan so'zlar yo'q — Lug'at bo'limida test yeching, men xatolaringizni kuzatib boraman.");
    }

    const list = mistakes.map((m, i) => `${i + 1}. ${m.correct_answer}`).join('\n');
    await ctx.reply(
      `🧠 Sizning eng ko'p adashgan so'zlaringiz:\n\n${list}\n\nShu so'zlar ustida maxsus mashq qilamizmi?`,
      Markup.inlineKeyboard([Markup.button.callback('🔁 Shu so\'zlarni mashq qilish', 'drill_mistakes')])
    );
  } catch (err) {
    console.error(err);
    ctx.reply('Xatolik yuz berdi.');
  }
});

bot.action('drill_mistakes', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const mistakes = await getTopMistakes(ctx.from.id, 5);
    const wordIds = mistakes.map((m) => m.word_id).filter(Boolean);
    const mistakeWords = await getWordsByIds(wordIds);

    // Variant tanlash uchun yetarli distractor bo'lishi uchun 1-guruhni ham qo'shib qo'yamiz
    const basePool = await getWordGroup(1);
    const distractorPool = [...mistakeWords, ...basePool.filter((w) => !wordIds.includes(w.id))];

    sessions.set(ctx.from.id, {
      words: mistakeWords,
      distractorPool,
      index: 0,
      mode: 'quiz',
      correctCount: 0,
    });
    await sendQuizQuestion(ctx);
  } catch (err) {
    console.error(err);
    ctx.reply('Xatolik yuz berdi.');
  }
});

// ---------- AI SPEAKING (GEMINI ORQALI OVOZ TAHLILI) ----------

bot.hears('🗣 AI Speaking', (ctx) => {
  ctx.reply(
    "Menga arabcha ovozli xabar yuboring — masalan, o'zingiz haqingizda 2-3 gap ayting.\n\nMen uni tinglab, talaffuz, grammatika va so'z boyligingizni tahlil qilaman."
  );
});

bot.on('voice', async (ctx) => {
  try {
    await ctx.reply('⏳ Tahlil qilinmoqda...');

    const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
    const audioResponse = await fetch(fileLink.href);
    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    const feedback = await analyzeSpeech(audioBase64);
    await ctx.reply(feedback);
  } catch (err) {
    console.error('Speech analysis failed:', err);
    ctx.reply("Tahlil qilishda xatolik yuz berdi. GEMINI_API_KEY to'g'ri kiritilganini tekshiring.");
  }
});

async function analyzeSpeech(audioBase64) {
  const prompt = `Siz professional arab tili ustozisiz. Foydalanuvchi arabcha gapirdi (ovozli xabar sifatida).
Vazifangiz:
1. Aytilgan gapni arab yozuvida transkripsiya qiling.
2. Uni o'zbek tiliga tarjima qiling.
3. Talaffuz (imkon qadar), grammatika va so'z boyligi bo'yicha IELTS Speaking uslubida 1-9 shkala bo'yicha baho bering.
4. Asosiy xatolarni aniq ko'rsating va qanday tuzatish kerakligini tushuntiring.
Javobni o'zbek tilida, aniq va tushunarli formatda bering.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'audio/ogg', data: audioBase64 } },
            ],
          },
        ],
      }),
    }
  );

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return (
    data.candidates?.[0]?.content?.parts?.[0]?.text ||
    "Tahlil qaytmadi, qayta urinib ko'ring."
  );
}

bot.launch();
console.log('Bot ishga tushdi...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
