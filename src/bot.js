const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();
const { getWordGroup, logMistake } = require('./supabaseClient');

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

  // Oddiy MCQ: to'g'ri tarjima + 3 ta tasodifiy noto'g'ri variant
  const wrongOptions = session.words
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

// ---------- STUB'LAR — keyingi bosqichda to'ldiriladi ----------

bot.hears('🗣 AI Speaking', (ctx) => {
  ctx.reply("AI Speaking funksiyasi tez orada qo'shiladi (Whisper + AI tahlil).");
});

bot.hears('📊 Mening progressim', (ctx) => {
  ctx.reply("Progress paneli tez orada — user_mistakes jadvali asosida qurilamiz.");
});

bot.launch();
console.log('Bot ishga tushdi...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
