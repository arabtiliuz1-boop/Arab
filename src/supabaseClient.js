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
 * Foydalanuvchi eng ko'p xato qilgan so'z/qoidalarni oladi — kunlik "target drilling" uchun.
 */
async function getTopMistakes(telegramUserId, limit = 5) {
  const { data, error } = await supabase
    .from(MISTAKES_TABLE)
    .select('word_id, mistake_type, correct_answer')
    .eq('telegram_user_id', telegramUserId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

module.exports = { supabase, getWordGroup, logMistake, getTopMistakes };
