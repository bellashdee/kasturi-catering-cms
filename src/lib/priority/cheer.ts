/** The words of encouragement on the Priority Centre: a new one every day, a saying of a well-known person or a line for the star sign of the person's birthday. */

export type Cheer = { kind: "quote"; text: string; by: string } | { kind: "zodiac"; sign: string; symbol: string; text: string };

const QUOTES: { text: string; by: string }[] = [
  { text: "You may encounter many defeats, but you must not be defeated.", by: "Maya Angelou" },
  { text: "The only way to do great work is to love what you do.", by: "Steve Jobs" },
  { text: "It does not matter how slowly you go as long as you do not stop.", by: "Confucius" },
  { text: "A journey of a thousand miles begins with a single step.", by: "Lao Tzu" },
  { text: "Nothing in life is to be feared, it is only to be understood.", by: "Marie Curie" },
  { text: "One child, one teacher, one book, one pen can change the world.", by: "Malala Yousafzai" },
  { text: "The future belongs to those who believe in the beauty of their dreams.", by: "Eleanor Roosevelt" },
  { text: "Alone we can do so little; together we can do so much.", by: "Helen Keller" },
  { text: "Imagination is more important than knowledge.", by: "Albert Einstein" },
  { text: "It always seems impossible until it's done.", by: "Nelson Mandela" },
  { text: "Education is the most powerful weapon which you can use to change the world.", by: "Nelson Mandela" },
  { text: "I learned that courage was not the absence of fear, but the triumph over it.", by: "Nelson Mandela" },
  { text: "Do what you can, with what you have, where you are.", by: "Theodore Roosevelt" },
  { text: "I attribute my success to this: I never gave or took any excuse.", by: "Florence Nightingale" },
  { text: "Well done is better than well said.", by: "Benjamin Franklin" },
  { text: "Lost time is never found again.", by: "Benjamin Franklin" },
  { text: "If I have seen further, it is by standing on the shoulders of giants.", by: "Isaac Newton" },
  { text: "Genius is one percent inspiration, ninety-nine percent perspiration.", by: "Thomas Edison" },
  { text: "Darkness cannot drive out darkness; only light can do that.", by: "Martin Luther King Jr." },
  { text: "The only thing we have to fear is fear itself.", by: "Franklin D. Roosevelt" },
  { text: "Happiness is not something ready made. It comes from your own actions.", by: "Dalai Lama" },
  { text: "Turn your wounds into wisdom.", by: "Oprah Winfrey" },
  { text: "You miss 100% of the shots you don't take.", by: "Wayne Gretzky" },
  { text: "Perseverance is not a long race; it is many short races one after the other.", by: "Walter Elliot" },
  { text: "Start where you are. Use what you have. Do what you can.", by: "Arthur Ashe" },
  { text: "Dream big and dare to fail.", by: "Norman Vaughan" },
  { text: "Kalau hidup sekadar hidup, babi di hutan juga hidup. Kalau bekerja sekadar bekerja, kera juga bekerja.", by: "Buya Hamka" },
  { text: "The best time to plant a tree was twenty years ago. The second best time is now.", by: "Chinese proverb" },
  { text: "Fall seven times, stand up eight.", by: "Japanese proverb" },
  { text: "Success usually comes to those who are too busy to be looking for it.", by: "Henry David Thoreau" },
];

type SignDef = { name: string; symbol: string; lines: string[] };

/** The twelve signs. Each has lines about the strengths the sign is known for. */
const SIGNS: Record<string, SignDef> = {
  capricorn: { name: "Capricorn", symbol: "♑", lines: ["Your steady discipline is your superpower today. Small, patient steps will take you far.", "Capricorns are known for building things that last. What you do today is part of that.", "Trust the careful plan you made: your patience is about to pay off.", "You carry a lot with grace today. Take a moment to be proud of how far you have come."] },
  aquarius: { name: "Aquarius", symbol: "♒", lines: ["Your fresh ideas can make today's work easier for everyone. Share them.", "Aquarians see what others miss. Follow that bright idea today.", "Your independence is a strength: do it your way and do it well.", "A kind word from you can lift the whole team today."] },
  pisces: { name: "Pisces", symbol: "♓", lines: ["Your kind heart and intuition guide you well today. Listen to them.", "Pisces are known for compassion: your care for others is noticed and valued.", "Creative energy is with you. Let a new idea flow.", "Take a calm breath. You are more capable than you think."] },
  aries: { name: "Aries", symbol: "♈", lines: ["Your courage gets things started: take the first step and the rest will follow.", "Aries are known for energy and drive. Aim it at the one task that matters most today.", "Lead by example today: your confidence inspires the people around you.", "Be bold, but be kind to yourself too. A great day is ahead."] },
  taurus: { name: "Taurus", symbol: "♉", lines: ["Steady and reliable: that is you. Keep going at your own good pace today.", "Taurus are known for patience. The work you are doing carefully will show its worth.", "Enjoy one small pleasure today. You have earned it.", "Your determination is your strength. Nothing can shake you today."] },
  gemini: { name: "Gemini", symbol: "♊", lines: ["Your quick mind and good words make the day easier for everyone.", "Gemini are known for curiosity. Learn one new thing today.", "Talk to someone you have not spoken to in a while. It will brighten both days.", "You can juggle a lot today. Pick the most important thing first and enjoy it."] },
  cancer: { name: "Cancer", symbol: "♋", lines: ["Your care for others is a quiet strength. Today, care for yourself too.", "Cancer are known for loyalty. The people around you are lucky to have you.", "Trust your instincts today: they have served you well before.", "A warm word to a colleague will come back to you."] },
  leo: { name: "Leo", symbol: "♌", lines: ["Your warmth lights up the room. Let it shine on today's work.", "Leos are known for generosity and confidence. Share both today.", "You are made to lead: someone is looking up to you right now.", "Be proud of what you have done this week. You deserve the applause."] },
  virgo: { name: "Virgo", symbol: "♍", lines: ["Your attention to detail is a gift. Today it will save the day.", "Virgos are known for being thoughtful and helpful. It is noticed.", "Not everything has to be perfect today. Good and finished is wonderful.", "Your careful work builds trust. Keep going."] },
  libra: { name: "Libra", symbol: "♎", lines: ["Your sense of balance and fairness helps everyone today.", "Libra are known for harmony. A calm word from you can settle a busy day.", "Make one decision today with a light heart. You already know the answer.", "Beauty and order are your strengths. Tidy one corner and feel the difference."] },
  scorpio: { name: "Scorpio", symbol: "♏", lines: ["Your determination is deep and strong. Today it can move mountains.", "Scorpios are known for focus. Give your best attention to one important thing.", "You see what is really going on. Use that wisdom kindly today.", "Quiet strength wins the day. Keep going."] },
  sagittarius: { name: "Sagittarius", symbol: "♐", lines: ["Your optimism is catching. Bring it to the team today.", "Sagittarius are known for adventure. Try a new way of doing an old task.", "Aim high today: your enthusiasm will carry you there.", "Honest and cheerful: that is a wonderful combination. Share it."] },
};

/** The star sign of a birthday (month 1-12, day 1-31). */
export function signOf(month: number, day: number): SignDef {
  // the day each sign starts
  const starts: [number, number, string][] = [
    [1, 20, "aquarius"], [2, 19, "pisces"], [3, 21, "aries"], [4, 20, "taurus"], [5, 21, "gemini"], [6, 21, "cancer"],
    [7, 23, "leo"], [8, 23, "virgo"], [9, 23, "libra"], [10, 23, "scorpio"], [11, 22, "sagittarius"], [12, 22, "capricorn"],
  ];
  for (let i = starts.length - 1; i >= 0; i--) {
    const [m, d, sign] = starts[i];
    if (month > m || (month === m && day >= d)) return SIGNS[sign];
  }
  return SIGNS.capricorn; // 1 to 19 January
}

/**
 * The words for a day (a date as YYYY-MM-DD in Malaysia). Without a birthday it is a saying of a well-known person; with one, the days alternate between
 * a saying and a line for the person's star sign. The same day gives the same words, the next day gives new ones.
 */
export function dailyCheer(today: string, birthDate: string | null): Cheer {
  const day = Math.floor(Date.parse(`${today}T00:00:00Z`) / 86_400_000);
  const quote = () => ({ kind: "quote" as const, ...QUOTES[((day % QUOTES.length) + QUOTES.length) % QUOTES.length] });
  const m = birthDate?.match(/^\d{4}-(\d{2})-(\d{2})/);
  if (!m || day % 2 !== 0) return quote();
  const sign = signOf(Number(m[1]), Number(m[2]));
  return { kind: "zodiac", sign: sign.name, symbol: sign.symbol, text: sign.lines[Math.floor(day / 2) % sign.lines.length] };
}
