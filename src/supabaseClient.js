const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Supabaseʼdagi haqiqiy sxema bilan tasdiqlangan (id: uuid, arabic, uzbek,
// example_arabic, example_uzbek, usage_note, grammar_note, mudari_form, amr_form, nahy_form).
const WORDS_TABLE = 'lugat_words';
const MISTAKES_TABLE = 'user_mistakes'; // yangi jadval — migration_user_mistakes.sql orqali yaratiladi

/**
 * Bitta so'z guruhidan (masalan, group_number=1) barcha so'zlarni oladi.
 */
async function getWordGroup(groupNumber) {
  const { data, error } = await supabase
    .from(WORDS_TABLE)
    .select('*')
    .eq('group_number', groupNumber)
    .order('position_in_group', { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Foydalanuvchining xato javobini kuzatuv jadvaliga yozadi.
 * Shu jadval keyinchalik "Personal Teacher" funksiyasining asosi bo'ladi.
 */
async function logMistake({ telegramUserId, wordId, mistakeType, userAnswer, correctAnswer }) {
  const { error } = await supabase.from(MISTAKES_TABLE).insert({
    telegram_user_id: telegramUserId,
    word_id: wordId,
    mistake_type: mistakeType, // masalan: 'translation', 'grammar_case', 'conjugation'
    user_answer: userAnswer,
    correct_answer: correctAnswer,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/**
 * Berilgan id'lar bo'yicha to'liq so'z ma'lumotlarini oladi (quiz uchun kerak).
 */
async function getWordsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const { data, error } = await supabase.from(WORDS_TABLE).select('*').in('id', ids);
  if (error) throw error;
  return data;
}

/**
 * Foydalanuvchi eng ko'p xato qilgan so'z/qoidalarni oladi — kunlik "target drilling" uchun.
 * Oxirgi xatolardan noyob so'z id'larini ajratib beradi (bir xil so'z bir necha marta
 * xato qilingan bo'lishi mumkin, shuning uchun kattaroq oyna olib JS tomonda dedupe qilamiz).
 */
async function getTopMistakes(telegramUserId, limit = 5) {
  const { data, error } = await supabase
    .from(MISTAKES_TABLE)
    .select('word_id, mistake_type, correct_answer')
    .eq('telegram_user_id', telegramUserId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  const seen = new Set();
  const unique = [];
  for (const row of data) {
    if (!seen.has(row.word_id)) {
      seen.add(row.word_id);
      unique.push(row);
    }
    if (unique.length >= limit) break;
  }
  return unique;
}

/**
 * Yangi foydalanuvchini ro'yxatga oladi (yoki mavjud bo'lsa hech narsa qilmaydi).
 */
async function registerUser(telegramUserId, firstName) {
  const { error } = await supabase
    .from('bot_users')
    .upsert({ telegram_user_id: telegramUserId, first_name: firstName }, { onConflict: 'telegram_user_id', ignoreDuplicates: true });
  if (error) throw error;
}

/**
 * Jami ro'yxatdan o'tgan foydalanuvchilar sonini qaytaradi.
 */
async function getUserCount() {
  const { count, error } = await supabase
    .from('bot_users')
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count;
}

/**
 * Foydalanuvchining shaxsiy lug'atiga yangi so'z qo'shadi (tarjima yoki AI taklifi).
 */
async function saveUserVocabWord(telegramUserId, { arabic, uzbek, exampleArabic, exampleUzbek, source }) {
  const { error } = await supabase.from('user_vocabulary').insert({
    telegram_user_id: telegramUserId,
    arabic,
    uzbek,
    example_arabic: exampleArabic || null,
    example_uzbek: exampleUzbek || null,
    source: source || 'translation',
  });
  if (error) throw error;
}

/**
 * Foydalanuvchining shaxsiy lug'atida hozircha nechta so'z borligini qaytaradi —
 * bu son AI uchun "daraja" proksisi sifatida ishlatiladi (ko'p so'z = yuqoriroq daraja).
 */
async function getUserVocabCount(telegramUserId) {
  const { count, error } = await supabase
    .from('user_vocabulary')
    .select('*', { count: 'exact', head: true })
    .eq('telegram_user_id', telegramUserId);
  if (error) throw error;
  return count;
}

module.exports = {
  supabase,
  getWordGroup,
  getWordsByIds,
  logMistake,
  getTopMistakes,
  registerUser,
  getUserCount,
  saveUserVocabWord,
  getUserVocabCount,
};
