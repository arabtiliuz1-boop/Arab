-- Personal Teacher funksiyasi asosi: har bir xato javobni saqlaydi.
-- Buni mavjud Supabase loyihangizda (arab-kurs bazasi) ishga tushiring.

create table if not exists user_mistakes (
  id bigint generated always as identity primary key,
  telegram_user_id bigint not null,
  word_id uuid,
  mistake_type text not null,       -- 'translation', 'grammar_case', 'conjugation', va h.k.
  user_answer text,
  correct_answer text,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_mistakes_user on user_mistakes (telegram_user_id, created_at desc);
