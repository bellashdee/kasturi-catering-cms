-- Interface language chosen by each user (ms = Bahasa Melayu, en = English, zh = Simplified Chinese, my = Burmese, bn = Bangla).
-- Empty until the person picks one; the app then uses Bahasa Melayu. Each person can already update only their own profile row.
alter table profiles add column language text check (language is null or language in ('ms', 'en', 'zh', 'my', 'bn'));
