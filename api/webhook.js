/**
 * api/webhook.js
 * Telegram Bot webhook — читает прогресс из PostgreSQL.
 *
 * Переменные окружения:
 *   BOT_TOKEN    — токен от @BotFather
 *   APP_URL      — URL деплоя на Vercel
 *   DATABASE_URL — строка подключения PostgreSQL
 */

import { Pool } from 'pg';

const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL   = process.env.APP_URL || 'https://your-app.vercel.app';
const API_BASE  = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ── DB ────────────────────────────────────────────────────────────────────────
let pool;
function getPool() {
  if (!pool) pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });
  return pool;
}

async function getUserData(userId, keys) {
  const db = getPool();
  const client = await db.connect();
  try {
    const { rows } = await client.query(
      'SELECT key, value FROM user_storage WHERE user_id = $1 AND key = ANY($2)',
      [String(userId), keys]
    );
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  } finally {
    client.release();
  }
}

// ── Telegram API ──────────────────────────────────────────────────────────────
async function callTG(method, body) {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

function sendMessage(chatId, text, extra = {}) {
  return callTG('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}

function webAppBtn(label) {
  return { reply_markup: { inline_keyboard: [[{ text: label, web_app: { url: APP_URL } }]] } };
}

// ── Слово дня ─────────────────────────────────────────────────────────────────
const DAILY_WORDS = [
  { es: 'hola', ru: 'привет', t: 'Приветствия' },
  { es: 'gracias', ru: 'спасибо', t: 'Приветствия' },
  { es: 'el trabajo', ru: 'работа', t: 'Работа' },
  { es: 'viajar', ru: 'путешествовать', t: 'Путешествия' },
  { es: 'la familia', ru: 'семья', t: 'Семья' },
  { es: 'hace calor', ru: 'жарко', t: 'Погода' },
  { es: 'comer', ru: 'есть (кушать)', t: 'Еда' },
  { es: 'aprender', ru: 'учить / узнавать', t: 'Образование' },
  { es: 'hablar', ru: 'говорить', t: 'Глаголы' },
  { es: 'querer', ru: 'хотеть / любить', t: 'Глаголы' },
  { es: 'poder', ru: 'мочь', t: 'Глаголы' },
  { es: '¿cuánto cuesta?', ru: 'сколько стоит?', t: 'Путешествия' },
  { es: 'por favor', ru: 'пожалуйста', t: 'Приветствия' },
  { es: 'lo siento', ru: 'мне жаль / извините', t: 'Фразы' },
  { es: 'no entiendo', ru: 'я не понимаю', t: 'Фразы' },
  { es: 'me duele', ru: 'у меня болит', t: 'Здоровье' },
  { es: 'la ciudad', ru: 'город', t: 'Город' },
  { es: 'reservar', ru: 'бронировать', t: 'Путешествия' },
  { es: 'el desayuno', ru: 'завтрак', t: 'Еда' },
  { es: '¡vamos!', ru: 'пошли!', t: 'Фразы' },
];

function getDailyWord() {
  const day = Math.floor(Date.now() / 86_400_000);
  return DAILY_WORDS[day % DAILY_WORDS.length];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDayWord(n) {
  if (n % 100 >= 11 && n % 100 <= 19) return 'дней';
  const r = n % 10;
  if (r === 1) return 'день';
  if (r >= 2 && r <= 4) return 'дня';
  return 'дней';
}

// ── Handlers ──────────────────────────────────────────────────────────────────
async function handleStart(msg) {
  const name = msg.from.first_name || 'друг';
  return sendMessage(msg.chat.id,
    `🇪🇸 <b>¡Hola, ${name}!</b>\n\nЭто твой тренажёр испанского — 1000 слов уровня A2.\n\nОткрой приложение, чтобы учить слова, проходить квизы и отслеживать прогресс 👇`,
    { reply_markup: { inline_keyboard: [
      [{ text: '📚 Открыть тренажёр', web_app: { url: APP_URL } }],
      [{ text: '📊 Мой прогресс', callback_data: 'stats' }, { text: '📖 Слово дня', callback_data: 'word' }],
    ]}}
  );
}

async function handleStats(msg) {
  const userId = msg.from.id;
  const data = await getUserData(userId, [
    'es_a2_1000_v2', 'es_xp', 'es_player_level', 'es_streak', 'es_levels_v1',
  ]);

  let known = 0, used = 0, total = 0, mastered = 0;
  const xp     = parseInt(data['es_xp'] || '0');
  const level  = parseInt(data['es_player_level'] || '1');
  const streak = parseInt(data['es_streak'] || '0');

  try {
    const s = JSON.parse(data['es_a2_1000_v2'] || '{}');
    total = Object.keys(s).length;
    known = Object.values(s).filter(v => v === 'known').length;
    used  = Object.values(s).filter(v => v === 'used').length;
  } catch(e) {}

  try {
    const lvls = JSON.parse(data['es_levels_v1'] || '{}');
    mastered = Object.values(lvls).filter(v => v >= 5).length;
  } catch(e) {}

  const pct = Math.round((known / 1000) * 100);
  const streakEmoji = streak >= 7 ? '🔥' : streak >= 3 ? '⚡' : '📅';

  return sendMessage(msg.chat.id,
    `📊 <b>Твой прогресс</b>\n\n` +
    `🎓 Уровень: <b>${level}</b> · <b>${xp} XP</b>\n` +
    `${streakEmoji} Стрик: <b>${streak} ${getDayWord(streak)}</b>\n\n` +
    `📖 Изучено слов: <b>${total}</b> из 1000\n` +
    `✅ Знаю: <b>${known}</b> (${pct}%)\n` +
    `📚 Учу: <b>${used}</b>\n` +
    `⭐ Освоено (уровень 5): <b>${mastered}</b>`,
    webAppBtn('📚 Учить сейчас')
  );
}

async function handleWord(msg) {
  const w = getDailyWord();
  return sendMessage(msg.chat.id,
    `📖 <b>Слово дня</b>\n\n🇪🇸 <b>${w.es}</b>\n🇷🇺 ${w.ru}\n🏷 ${w.t}`,
    webAppBtn('📚 Открыть тренажёр')
  );
}

async function handleAdd(msg, args) {
  if (args.length < 2) {
    return sendMessage(msg.chat.id,
      '❌ Формат: <code>/add слово перевод [тема]</code>\n' +
      'Пример: <code>/add hola привет saludos</code>'
    );
  }
  const [es, ru, t = 'mis_palabras'] = args;
  const addUrl = `${APP_URL}?add=${encodeURIComponent(es)}&ru=${encodeURIComponent(ru)}&t=${encodeURIComponent(t)}`;
  return sendMessage(msg.chat.id,
    `➕ <b>Добавить слово</b>\n\n🇪🇸 <b>${es}</b> — ${ru}\n\nНажми кнопку — слово откроется уже заполненным:`,
    { reply_markup: { inline_keyboard: [[{ text: '➕ Добавить', web_app: { url: addUrl } }]] }}
  );
}

async function handleHelp(msg) {
  return sendMessage(msg.chat.id,
    `🇪🇸 <b>Команды</b>\n\n/start — главное меню\n/stats — прогресс\n/word — слово дня\n/add слово перевод — добавить слово\n/help — справка`,
    webAppBtn('📚 Открыть тренажёр')
  );
}

// ── Export ────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  try {
    const update = req.body;

    if (update.callback_query) {
      const cq = update.callback_query;
      const fakeMsg = { chat: { id: cq.message.chat.id }, from: cq.from };
      await callTG('answerCallbackQuery', { callback_query_id: cq.id });
      if (cq.data === 'stats') await handleStats(fakeMsg);
      if (cq.data === 'word')  await handleWord(fakeMsg);
      return res.json({ ok: true });
    }

    const msg = update.message;
    if (!msg?.text) return res.json({ ok: true });

    const [rawCmd, ...args] = msg.text.trim().split(/\s+/);
    const cmd = rawCmd.toLowerCase().replace(/@\w+$/, '');

    if (cmd === '/start')      await handleStart(msg);
    else if (cmd === '/stats') await handleStats(msg);
    else if (cmd === '/word')  await handleWord(msg);
    else if (cmd === '/add')   await handleAdd(msg, args);
    else if (cmd === '/help')  await handleHelp(msg);

  } catch(err) {
    console.error('Webhook error:', err);
  }

  return res.json({ ok: true });
}
