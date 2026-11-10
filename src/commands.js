
import { InlineKeyboard } from "grammy";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";

const ADMIN = 8855596552;
const WALLET = "UQCXK7flLG-G_qOzQCGk_NPbvQz4n7lPB4Nr7nOx831hNF8a";
const NFT_ACCOUNT = "https://t.me/DealixGarant";

// Укажи путь к постоянному диску хостинга.
const db = new DatabaseSync(
  process.env.DB_PATH || "./dealix.sqlite"
);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY,
 stars INTEGER NOT NULL DEFAULT 0,
 ton REAL NOT NULL DEFAULT 0,
 gram REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS invoices (
 payload TEXT PRIMARY KEY,
 uid TEXT NOT NULL,
 amount INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS payments (
 charge TEXT PRIMARY KEY,
 payload TEXT NOT NULL UNIQUE,
 uid TEXT NOT NULL,
 amount INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS deposits (
 code TEXT PRIMARY KEY,
 uid TEXT NOT NULL,
 asset TEXT NOT NULL,
 amount REAL NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS nfts (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 uid TEXT NOT NULL,
 name TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'held'
);
CREATE TABLE IF NOT EXISTS deals (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 owner TEXT NOT NULL,
 partner TEXT NOT NULL,
 item TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'invited'
);
CREATE TABLE IF NOT EXISTS tickets (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 uid TEXT NOT NULL,
 message TEXT NOT NULL,
 reply TEXT
);
`);

const states = new Map();
const starsOptions = [50, 100, 250, 500, 1000];

function ensureUser(id) {
  db.prepare(
    "INSERT OR IGNORE INTO users(id) VALUES (?)"
  ).run(String(id));
}

function getUser(id) {
  ensureUser(id);
  return db.prepare(
    "SELECT * FROM users WHERE id=?"
  ).get(String(id));
}

function uniqueCode() {
  return "DG-" + randomBytes(8)
    .toString("hex").toUpperCase();
}

function kb(rows) {
  const k = new InlineKeyboard();
  rows.forEach((row, i) => {
    if (i) k.row();
    for (const x of row) {
      if (x.url) k.url(x.text, x.url);
      else k.text(x.text, x.data);
    }
  });
  return k;
}

const B = (text, data) => ({ text, data });
const U = (text, url) => ({ text, url });

const back = (where = "home") =>
  kb([[B("⬅️ Назад", where)]]);

const mainText =
  "🛡 Dealix Garant\n\n" +
  "Добро пожаловать в Dealix Garant — " +
  "сервис сопровождения сделок с Telegram NFT, " +
  "Stars и TON.\n\n" +
  "Выберите необходимый раздел:";

function mainKeyboard(id) {
  const rows = [
    [B("🤝 Создать сделку", "deal")],
    [B("💳 Пополнить баланс", "topup")],
    [B("📋 Мои сделки", "mydeals")],
    [B("🔎 Проверить пользователя", "lookup")],
    [
      B("👤 Профиль", "profile"),
      B("💬 Поддержка", "support")
    ],
    [B("📜 Правила и условия", "rules")],
    [B("❓ Как работает гарант", "how")]
  ];
  if (id === ADMIN) {
    rows.push([B("🔐 Админ-панель", "admin")]);
  }
  return kb(rows);
}

async function show(ctx, text, keyboard) {
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
    try {
      return await ctx.editMessageText(text, {
        reply_markup: keyboard
      });
    } catch {}
  }
  return ctx.reply(text, { reply_markup: keyboard });
}

async function notify(bot, id, text) {
  try {
    await bot.api.sendMessage(id, text);
    return true;
  } catch {
    return false;
  }
}

function inventoryText(uid) {
  const items = db.prepare(
    "SELECT * FROM nfts WHERE uid=? AND status='held'"
  ).all(String(uid));

  if (!items.length) {
    return (
      "🎁 NFT-инвентарь | Dealix Garant\n\n" +
      "Ваш инвентарь пуст.\n\n" +
      "Для добавления NFT-подарка передайте его " +
      "нашему официальному аккаунту — @DealixGarant.\n\n" +
      "После подтверждения получения NFT " +
      "появится в вашем профиле.\n\n" +
      "Если сделка не состоится, вы сможете " +
      "запросить возврат подарка."
    );
  }

  return (
    "🎁 NFT-инвентарь | Dealix Garant\n\n" +
    items.map(x => `№${x.id} — ${x.name}`).join("\n")
  );
}

function inventoryKeyboard() {
  return kb([
    [U("🎁 Отправить NFT", NFT_ACCOUNT)],
    [B("🎁 Выбрать NFT", "choose_nft")],
    [B("🔄 Обновить инвентарь", "refresh_nft")],
    [B("⬅️ Назад", "deal")]
  ]);
}

function adminKeyboard() {
  return kb([
    [B("💳 Заявки TON / Gram", "admin_deposits")],
    [B("🎁 Добавить NFT", "admin_add_nft")],
    [B("📋 Обращения", "admin_tickets")],
    [B("⬅️ Назад", "home")]
  ]);
}

export function registerCommands(bot) {

  // START

  bot.command("start", ctx => {
    ensureUser(ctx.from.id);
    states.delete(ctx.from.id);
    return ctx.reply(mainText, {
      reply_markup: mainKeyboard(ctx.from.id)
    });
  });

  bot.callbackQuery("home", ctx => {
    states.delete(ctx.from.id);
    return show(ctx, mainText, mainKeyboard(ctx.from.id));
  });

  // ПОПОЛНЕНИЕ

  bot.callbackQuery("topup", ctx =>
    show(
      ctx,
      "💳 Пополнение баланса | Dealix Garant\n\n" +
      "Выберите способ пополнения:",
      kb([
        [B("⭐ Telegram Stars — официально", "stars")],
        [B("🪙 TON", "ton")],
        [B("💎 Gram", "gram")],
        [B("📋 История пополнений", "deposit_history")],
        [B("⬅️ Назад", "home")]
      ])
    )
  );

  bot.callbackQuery("stars", ctx =>
    show(
      ctx,
      "⭐ Telegram Stars | Dealix Garant\n\n" +
      "Официальная оплата через Telegram.\n\n" +
      "Выберите количество звёзд.\n\n" +
      "После успешной оплаты Telegram " +
      "автоматически начислит внутренний баланс.",
      kb([
        [B("⭐ 50", "buy_50"), B("⭐ 100", "buy_100")],
        [B("⭐ 250", "buy_250"), B("⭐ 500", "buy_500")],
        [B("⭐ 1000", "buy_1000")],
        [B("⬅️ Назад", "topup")]
      ])
    )
  );

  // ОФИЦИАЛЬНЫЙ СЧЁТ TELEGRAM STARS

  bot.callbackQuery(/^buy_(\d+)$/, async ctx => {
    const amount = Number(ctx.match[1]);

    if (!starsOptions.includes(amount)) {
      return ctx.answerCallbackQuery({
        text: "❌ Недопустимая сумма.",
        show_alert: true
      });
    }

    await ctx.answerCallbackQuery();

    const payload = uniqueCode();

    db.prepare(
      `INSERT INTO invoices(payload,uid,amount,status)
       VALUES (?,?,?,'pending')`
    ).run(payload, String(ctx.from.id), amount);

    try {
      await ctx.api.sendInvoice(
        ctx.chat.id,
        "⭐ Пополнение Dealix Garant",
        `Пополнение внутреннего баланса на ${amount} Stars`,
        payload,
        "XTR",
        [{ label: `${amount} Stars`, amount }]
      );
    } catch (err) {
      console.error("Invoice error:", err);

      await ctx.reply(
        "❌ Не удалось открыть официальную оплату.\n\n" +
        "Попробуйте позже или обратитесь в поддержку.",
        { reply_markup: back("stars") }
      );
    }
  });

  // TELEGRAM ПРОВЕРЯЕТ СЧЁТ ДО ОПЛАТЫ

  bot.on("pre_checkout_query", async ctx => {
    const q = ctx.preCheckoutQuery;

    const invoice = db.prepare(
      "SELECT * FROM invoices WHERE payload=?"
    ).get(q.invoice_payload);

    const valid =
      invoice &&
      invoice.status === "pending" &&
      invoice.uid === String(q.from.id) &&
      q.currency === "XTR" &&
      invoice.amount === q.total_amount;

    if (!valid) {
      return ctx.answerPreCheckoutQuery(false, {
        error_message:
          "Счёт недействителен. Создайте новый."
      });
    }

    return ctx.answerPreCheckoutQuery(true);
  });

  // ПОДТВЕРЖДЁННЫЙ ПЛАТЁЖ TELEGRAM

  bot.on("message:successful_payment", async ctx => {
    const p = ctx.message.successful_payment;
    const uid = String(ctx.from.id);

    if (p.currency !== "XTR") return;

    const invoice = db.prepare(
      "SELECT * FROM invoices WHERE payload=?"
    ).get(p.invoice_payload);

    if (
      !invoice ||
      invoice.uid !== uid ||
      invoice.amount !== p.total_amount
    ) {
      console.error("Payment mismatch:", p.invoice_payload);
      return ctx.reply(
        "⚠️ Платёж получен, но требуется проверка. " +
        "Обратитесь в поддержку с данными платежа."
      );
    }

    const charge = p.telegram_payment_charge_id;

    try {
      db.exec("BEGIN IMMEDIATE");

      const existing = db.prepare(
        "SELECT charge FROM payments WHERE charge=? OR payload=?"
      ).get(charge, p.invoice_payload);

      const current = db.prepare(
        "SELECT status FROM invoices WHERE payload=?"
      ).get(p.invoice_payload);

      if (existing || current.status !== "pending") {
        db.exec("ROLLBACK");
        return;
      }

      ensureUser(uid);

      db.prepare(
        `INSERT INTO payments(charge,payload,uid,amount)
         VALUES (?,?,?,?)`
      ).run(charge, p.invoice_payload, uid, p.total_amount);

      db.prepare(
        "UPDATE users SET stars=stars+? WHERE id=?"
      ).run(p.total_amount, uid);

      db.prepare(
        "UPDATE invoices SET status='paid' WHERE payload=?"
      ).run(p.invoice_payload);

      db.exec("COMMIT");
    } catch (err) {
      try { db.exec("ROLLBACK"); } catch {}
      console.error("Credit error:", err);

      return ctx.reply(
        "⚠️ Telegram подтвердил оплату, но " +
        "зачисление требует проверки администратора.\n" +
        "Код: " + p.invoice_payload
      );
    }

    const u = getUser(uid);

    await ctx.reply(
      "✅ Оплата успешно завершена!\n\n" +
      `⭐ Начислено: ${p.total_amount} Stars\n` +
      `💰 Ваш баланс: ${u.stars} ⭐\n\n` +
      "Платёж подтверждён Telegram.",
      { reply_markup: mainKeyboard(ctx.from.id) }
    );

    await notify(
      bot,
      ADMIN,
      "⭐ Официальное пополнение\n\n" +
      `ID: ${uid}\n` +
      `Количество: ${p.total_amount} ⭐\n` +
      `Код: ${p.invoice_payload}`
    );
  });

  // TON / GRAM

  for (const asset of ["ton", "gram"]) {
    bot.callbackQuery(asset, ctx => {
      states.set(ctx.from.id, {
        step: "deposit_amount",
        asset
      });

      return show(
        ctx,
        `🪙 Пополнение ${asset.toUpperCase()}\n\n` +
        "Введите количество для пополнения.\n" +
        "Например: 1.5",
        back("topup")
      );
    });
  }

  bot.callbackQuery("deposit_history", ctx => {
    const rows = db.prepare(
      `SELECT * FROM deposits
       WHERE uid=? ORDER BY rowid DESC LIMIT 15`
    ).all(String(ctx.from.id));

    return show(
      ctx,
      "📋 История пополнений\n\n" +
      (rows.length
        ? rows.map(p =>
          `${p.code}\n${p.amount} ${p.asset.toUpperCase()}\n${p.status}`
        ).join("\n\n")
        : "Заявок пока нет."),
      back("topup")
    );
  });

  bot.callbackQuery(/^sent_(DG-[A-F0-9]+)$/, async ctx => {
    const p = db.prepare(
      "SELECT * FROM deposits WHERE code=? AND uid=?"
    ).get(ctx.match[1], String(ctx.from.id));

    if (!p) {
      return ctx.answerCallbackQuery({
        text: "❌ Заявка не найдена.",
        show_alert: true
      });
    }

    if (p.status === "confirmed") {
      return ctx.answerCallbackQuery({
        text: "✅ Платёж подтверждён.",
        show_alert: true
      });
    }

    if (p.status === "rejected") {
      return ctx.answerCallbackQuery({
        text: "❌ Заявка отклонена.",
        show_alert: true
      });
    }

    if (p.status === "pending") {
      db.prepare(
        "UPDATE deposits SET status='review' WHERE code=?"
      ).run(p.code);

      await notify(
        bot,
        ADMIN,
        "🪙 Заявка на проверку\n\n" +
        `Код: ${p.code}\n` +
        `ID: ${p.uid}\n` +
        `Актив: ${p.asset}\n` +
        `Количество: ${p.amount}\n\n` +
        "Подтвердите только после проверки поступления."
      );
    }

    return ctx.answerCallbackQuery({
      text:
        "❌ Оплата пока не подтверждена.\n" +
        "Заявка ожидает проверки.",
      show_alert: true
    });
  });

  // ПРОФИЛЬ

  bot.callbackQuery("profile", ctx => {
    const u = getUser(ctx.from.id);

    const nftCount = db.prepare(
      "SELECT COUNT(*) AS n FROM nfts WHERE uid=? AND status='held'"
    ).get(String(ctx.from.id)).n;

    return show(
      ctx,
      "👤 Профиль | Dealix Garant\n\n" +
      `🆔 Telegram ID: ${ctx.from.id}\n\n` +
      `⭐ Stars: ${u.stars}\n` +
      `🪙 TON: ${u.ton}\n` +
      `💎 Gram: ${u.gram}\n` +
      `🎁 NFT: ${nftCount}`,
      kb([
        [B("🎁 NFT-инвентарь", "inventory")],
        [B("💳 Пополнить баланс", "topup")],
        [B("⬅️ Назад", "home")]
      ])
    );
  });

  // NFT

  bot.callbackQuery("inventory", ctx =>
    show(
      ctx,
      inventoryText(ctx.from.id),
      inventoryKeyboard()
    )
  );

  bot.callbackQuery("refresh_nft", ctx => {
    const n = db.prepare(
      "SELECT COUNT(*) AS n FROM nfts WHERE uid=? AND status='held'"
    ).get(String(ctx.from.id)).n;

    return ctx.answerCallbackQuery({
      text: n
        ? `В инвентаре ${n} NFT.`
        : "Вы не передали NFT-подарок.",
      show_alert: true
    });
  });

  bot.callbackQuery("choose_nft", ctx => {
    const items = db.prepare(
      "SELECT * FROM nfts WHERE uid=? AND status='held'"
    ).all(String(ctx.from.id));

    if (!items.length) {
      return ctx.answerCallbackQuery({
        text: "Ваш инвентарь пуст.",
        show_alert: true
      });
    }

    return show(
      ctx,
      "🎁 Выберите NFT:",
      kb([
        ...items.slice(0, 30).map(x => [
          B(x.name.slice(0, 45), `nft_${x.id}`)
        ]),
        [B("⬅️ Назад", "inventory")]
      ])
    );
  });

  bot.callbackQuery(/^nft_(\d+)$/, ctx => {
    const nft = db.prepare(
      "SELECT * FROM nfts WHERE id=? AND uid=? AND status='held'"
    ).get(Number(ctx.match[1]), String(ctx.from.id));

    if (!nft) {
      return ctx.answerCallbackQuery({
        text: "NFT недоступен.",
        show_alert: true
      });
    }

    states.set(ctx.from.id, {
      step: "partner",
      item: nft.name
    });

    return show(
      ctx,
      `🎁 Выбран: ${nft.name}\n\n` +
      "Введите Telegram ID второго участника:",
      back("deal")
    );
  });

  // СДЕЛКИ

  bot.callbackQuery("deal", ctx =>
    show(
      ctx,
      "🤝 Создать сделку\n\nВыберите роль:",
      kb([
        [B("💎 Я продавец", "role_seller")],
        [B("💳 Я покупатель", "role_buyer")],
        [B("⬅️ Назад", "home")]
      ])
    )
  );

  for (const role of ["seller", "buyer"]) {
    bot.callbackQuery("role_" + role, ctx => {
      states.set(ctx.from.id, { role });

      return show(
        ctx,
        "📦 Выберите предмет сделки:",
        kb([
          [B("🎁 Telegram NFT", `item_${role}_nft`)],
          [B("⭐ Stars", `item_${role}_stars`)],
          [B("🪙 TON", `item_${role}_ton`)],
          [B("💎 Gram", `item_${role}_gram`)],
          [B("⬅️ Назад", "deal")]
        ])
      );
    });

    for (const asset of ["nft", "stars", "ton", "gram"]) {
      bot.callbackQuery(`item_${role}_${asset}`, ctx => {
        if (asset === "nft") {
          states.set(ctx.from.id, { role });
          return show(
            ctx,
            inventoryText(ctx.from.id),
            inventoryKeyboard()
          );
        }

        states.set(ctx.from.id, {
          step: "deal_amount",
          asset,
          role
        });

        return show(
          ctx,
          `Введите количество ${asset.toUpperCase()}:`,
          back("deal")
        );
      });
    }
  }

  bot.callbackQuery("mydeals", ctx => {
    const rows = db.prepare(
      `SELECT * FROM deals
       WHERE owner=? OR partner=?
       ORDER BY id DESC LIMIT 20`
    ).all(String(ctx.from.id), String(ctx.from.id));

    return show(
      ctx,
      "📋 Мои сделки\n\n" +
      (rows.length
        ? rows.map(x =>
          `№${x.id} — ${x.item}\nСтатус: ${x.status}`
        ).join("\n\n")
        : "Сделок пока нет."),
      back()
    );
  });

  bot.callbackQuery(/^accept_(\d+)$/, async ctx => {
    const id = Number(ctx.match[1]);

    const deal = db.prepare(
      "SELECT * FROM deals WHERE id=? AND partner=?"
    ).get(id, String(ctx.from.id));

    if (!deal || deal.status !== "invited") {
      return ctx.answerCallbackQuery({
        text: "Сделка недоступна.",
        show_alert: true
      });
    }

    db.prepare(
      "UPDATE deals SET status='accepted' WHERE id=?"
    ).run(id);

    await notify(
      bot,
      deal.owner,
      `✅ Участник принял сделку №${id}.`
    );

    return show(
      ctx,
      `✅ Вы приняли сделку №${id}.\n\n` +
      "Ожидайте дальнейших инструкций администратора.",
      back()
    );
  });

  bot.callbackQuery(/^reject_(\d+)$/, async ctx => {
    const id = Number(ctx.match[1]);

    const deal = db.prepare(
      "SELECT * FROM deals WHERE id=? AND partner=?"
    ).get(id, String(ctx.from.id));

    if (!deal || deal.status !== "invited") {
      return ctx.answerCallbackQuery({
        text: "Сделка недоступна.",
        show_alert: true
      });
    }

    db.prepare(
      "UPDATE deals SET status='rejected' WHERE id=?"
    ).run(id);

    await notify(
      bot,
      deal.owner,
      `❌ Сделка №${id} отклонена.`
    );

    return show(ctx, "❌ Сделка отклонена.", back());
  });

  // ПРОВЕРКА ПОЛЬЗОВАТЕЛЯ

  bot.callbackQuery("lookup", ctx => {
    states.set(ctx.from.id, { step: "lookup" });

    return show(
      ctx,
      "🔎 Проверка пользователя\n\nВведите Telegram ID:",
      back()
    );
  });

  // ПОДДЕРЖКА

  bot.callbackQuery("support", ctx =>
    show(
      ctx,
      "💬 Поддержка | Dealix Garant\n\n" +
      "Если возникли вопросы или проблемы, " +
      "обратитесь к администрации.",
      kb([
        [B("✉️ Создать обращение", "new_ticket")],
        [B("📋 Мои обращения", "mytickets")],
        [B("⬅️ Назад", "home")]
      ])
    )
  );

  bot.callbackQuery("new_ticket", ctx => {
    states.set(ctx.from.id, { step: "ticket" });

    return show(
      ctx,
      "✉️ Напишите ваше обращение:",
      back("support")
    );
  });

  bot.callbackQuery("mytickets", ctx => {
    const rows = db.prepare(
      "SELECT * FROM tickets WHERE uid=? ORDER BY id DESC LIMIT 20"
    ).all(String(ctx.from.id));

    return show(
      ctx,
      "📋 Мои обращения\n\n" +
      (rows.length
        ? rows.map(t =>
          `№${t.id}\n${t.message}\n` +
          (t.reply || "Ожидает ответа")
        ).join("\n\n")
        : "Обращений нет."),
      back("support")
    );
  });

  bot.callbackQuery("rules", ctx =>
    show(
      ctx,
      "📜 Правила и условия\n\n" +
      "1. Проверяйте реквизиты перед переводом.\n" +
      "2. Не передавайте пароли и коды входа.\n" +
      "3. TON/Gram подтверждаются после проверки.\n" +
      "4. Telegram Stars оплачиваются официально.\n" +
      "5. Нажатие «Я оплатил» не подтверждает перевод.\n" +
      "6. Возвраты и споры рассматриваются поддержкой.",
      back()
    )
  );

  bot.callbackQuery("how", ctx =>
    show(
      ctx,
      "❓ Как работает гарант\n\n" +
      "1. Создаётся сделка.\n" +
      "2. Второй участник подтверждает участие.\n" +
      "3. Стороны согласовывают условия.\n" +
      "4. Администратор проверяет получение актива.\n" +
      "5. После проверки выполняется передача.\n\n" +
      "Бот не переводит NFT автоматически.",
      back()
    )
  );

  // АДМИН-ПАНЕЛЬ

  bot.command("admin", ctx => {
    if (ctx.from.id !== ADMIN) return;

    return ctx.reply(
      "🔐 Админ-панель | Dealix Garant",
      { reply_markup: adminKeyboard() }
    );
  });

  bot.callbackQuery("admin", ctx => {
    if (ctx.from.id !== ADMIN) {
      return ctx.answerCallbackQuery({
        text: "Доступ запрещён.",
        show_alert: true
      });
    }

    return show(
      ctx,
      "🔐 Админ-панель | Dealix Garant",
      adminKeyboard()
    );
  });

  bot.callbackQuery("admin_deposits", ctx => {
    if (ctx.from.id !== ADMIN) {
      return ctx.answerCallbackQuery();
    }

    const rows = db.prepare(
      `SELECT * FROM deposits
       WHERE status='review'
       ORDER BY rowid DESC LIMIT 20`
    ).all();

    return show(
      ctx,
      "💳 Заявки TON / Gram\n\n" +
      (rows.length ? "Выберите заявку:" : "Заявок нет."),
      kb([
        ...rows.map(x => [
          B(
            `${x.code} | ${x.amount} ${x.asset}`,
            `review_${x.code}`
          )
        ]),
        [B("⬅️ Назад", "admin")]
      ])
    );
  });

  bot.callbackQuery(/^review_(DG-[A-F0-9]+)$/, ctx => {
    if (ctx.from.id !== ADMIN) {
      return ctx.answerCallbackQuery();
    }

    const p = db.prepare(
      "SELECT * FROM deposits WHERE code=?"
    ).get(ctx.match[1]);

    if (!p) return ctx.answerCallbackQuery();

    return show(
      ctx,
      `💳 Заявка ${p.code}\n\n` +
      `ID: ${p.uid}\n` +
      `Актив: ${p.asset}\n` +
      `Сумма: ${p.amount}\n` +
      `Статус: ${p.status}\n\n` +
      "Проверьте поступление в кошельке " +
      "и идентификатор транзакции.",
      kb([
        [B("✅ Подтвердить", `approve_${p.code}`)],
        [B("❌ Отклонить", `deny_${p.code}`)],
        [B("⬅️ Назад", "admin_deposits")]
      ])
    );
  });

  bot.callbackQuery(/^approve_(DG-[A-F0-9]+)$/, async ctx => {
    if (ctx.from.id !== ADMIN) {
      return ctx.answerCallbackQuery();
    }

    const code = ctx.match[1];
    const p = db.prepare(
      "SELECT * FROM deposits WHERE code=? AND status='review'"
    ).get(code);

    if (!p) {
      return ctx.answerCallbackQuery({
        text: "Заявка уже обработана.",
        show_alert: true
      });
    }

    try {
      db.exec("BEGIN IMMEDIATE");

      const changed = db.prepare(
        "UPDATE deposits SET status='confirmed' WHERE code=? AND status='review'"
      ).run(code);

      if (changed.changes !== 1) {
        db.exec("ROLLBACK");
        return ctx.answerCallbackQuery();
      }

      ensureUser(p.uid);

      const field = p.asset === "ton" ? "ton" : "gram";

      db.prepare(
        `UPDATE users SET ${field}=${field}+? WHERE id=?`
      ).run(p.amount, p.uid);

      db.exec("COMMIT");
    } catch (err) {
      try { db.exec("ROLLBACK"); } catch {}
      throw err;
    }

    await notify(
      bot,
      p.uid,
      `✅ Пополнение подтверждено!\n\n` +
      `${p.amount} ${p.asset.toUpperCase()}\n` +
      `Код: ${code}`
    );

    return show(
      ctx,
      "✅ Пополнение подтверждено.",
      adminKeyboard()
    );
  });

  bot.callbackQuery(/^deny_(DG-[A-F0-9]+)$/, async ctx => {
    if (ctx.from.id !== ADMIN) {
      return ctx.answerCallbackQuery();
    }

    const code = ctx.match[1];
    const p = db.prepare(
      "SELECT * FROM deposits WHERE code=? AND status='review'"
    ).get(code);

    if (!p) return ctx.answerCallbackQuery();

    db.prepare(
      "UPDATE deposits SET status='rejected' WHERE code=?"
    ).run(code);

    await notify(
      bot,
      p.uid,
      `❌ Пополнение ${code} не подтверждено.\n` +
      "Если средства отправлены, обратитесь в поддержку."
    );

    return show(ctx, "❌ Заявка отклонена.", adminKeyboard());
  });

  bot.callbackQuery("admin_add_nft", ctx => {
    if (ctx.from.id !== ADMIN) {
      return ctx.answerCallbackQuery();
    }

    states.set(ctx.from.id, { step: "admin_nft" });

    return show(
      ctx,
      "🎁 Добавление полученного NFT\n\n" +
      "Введите ID пользователя и название подарка.\n\n" +
      "Пример: 123456789 Plush Pepe\n\n" +
      "Добавляйте только фактически полученные NFT.",
      back("admin")
    );
  });

  bot.callbackQuery("admin_tickets", ctx => {
    if (ctx.from.id !== ADMIN) {
      return ctx.answerCallbackQuery();
    }

    const rows = db.prepare(
      "SELECT * FROM tickets WHERE reply IS NULL ORDER BY id DESC LIMIT 15"
    ).all();

    return show(
      ctx,
      "📋 Обращения\n\n" +
      (rows.length
        ? rows.map(t =>
          `№${t.id} | ID ${t.uid}\n${t.message}`
        ).join("\n\n")
        : "Нет обращений.") +
      "\n\nДля ответа: /reply номер текст",
      back("admin")
    );
  });

  bot.command("reply", async ctx => {
    if (ctx.from.id !== ADMIN) return;

    const match = ctx.message.text.match(
      /^\/reply(?:@\w+)?\s+(\d+)\s+([\s\S]+)$/
    );

    if (!match) {
      return ctx.reply("Формат: /reply номер текст");
    }

    const t = db.prepare(
      "SELECT * FROM tickets WHERE id=?"
    ).get(Number(match[1]));

    if (!t) return ctx.reply("Обращение не найдено.");

    db.prepare(
      "UPDATE tickets SET reply=? WHERE id=?"
    ).run(match[2], t.id);

    await notify(
      bot,
      t.uid,
      `💬 Ответ поддержки на обращение №${t.id}\n\n` +
      match[2]
    );

    return ctx.reply("✅ Ответ отправлен.");
  });

  bot.command("confirmnft", async ctx => {
    if (ctx.from.id !== ADMIN) return;

    const s = states.get(ADMIN);

    if (!s || s.step !== "nft_confirm") {
      return ctx.reply("Нет NFT для подтверждения.");
    }

    db.prepare(
      "INSERT INTO nfts(uid,name) VALUES (?,?)"
    ).run(String(s.uid), s.name);

    states.delete(ADMIN);

    await notify(
      bot,
      s.uid,
      `🎁 NFT добавлен в инвентарь:\n${s.name}`
    );

    return ctx.reply("✅ NFT добавлен.");
  });

  bot.command("cancelnft", ctx => {
    if (ctx.from.id !== ADMIN) return;
    states.delete(ADMIN);
    return ctx.reply("Отменено.");
  });

  // ОБРАБОТКА ВВЕДЁННОГО ТЕКСТА

  bot.on("message:text", async ctx => {
    const uid = ctx.from.id;
    const s = states.get(uid);

    if (!s) return;

    const value = ctx.message.text.trim();

    if (value.startsWith("/")) return;

    if (s.step === "deposit_amount") {
      const amount = Number(value.replace(",", "."));

      if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 1000000
      ) {
        return ctx.reply("❌ Введите корректную сумму.");
      }

      const code = uniqueCode();

      db.prepare(
        `INSERT INTO deposits(code,uid,asset,amount)
         VALUES (?,?,?,?)`
      ).run(code, String(uid), s.asset, amount);

      states.delete(uid);

      return ctx.reply(
        `🪙 Пополнение ${s.asset.toUpperCase()}\n\n` +
        `Количество: ${amount}\n\n` +
        `Адрес кошелька:\n${WALLET}\n\n` +
        `Код заявки:\n${code}\n\n` +
        "Если ваш кошелёк поддерживает комментарии, " +
        "укажите код заявки.\n\n" +
        "Переводите только выбранный актив в сети TON. " +
        "Для Gram проверьте контракт токена и поддержку " +
        "получающим кошельком.\n\n" +
        "После перевода нажмите «Я оплатил».",
        {
          reply_markup: kb([
            [B("✅ Я оплатил", `sent_${code}`)],
            [B("💬 Поддержка", "support")],
            [B("⬅️ Назад", "topup")]
          ])
        }
      );
    }

    if (s.step === "deal_amount") {
      const amount = Number(value.replace(",", "."));

      if (!Number.isFinite(amount) || amount <= 0) {
        return ctx.reply("❌ Некорректное количество.");
      }

      states.set(uid, {
        step: "partner",
        item: `${amount} ${s.asset.toUpperCase()}`
      });

      return ctx.reply(
        "Введите Telegram ID второго участника:"
      );
    }

    if (s.step === "partner") {
      if (!/^\d+$/.test(value) || value === String(uid)) {
        return ctx.reply("❌ Некорректный Telegram ID.");
      }

      const result = db.prepare(
        `INSERT INTO deals(owner,partner,item)
         VALUES (?,?,?)`
      ).run(String(uid), value, s.item);

      states.delete(uid);

      const dealId = Number(result.lastInsertRowid);

      const sent = await notify(
        bot,
        value,
        `🤝 Вас пригласили в сделку №${dealId}.\n` +
        `Предмет: ${s.item}\n` +
        `Инициатор: ${uid}\n\n` +
        "Откройте бота, чтобы принять приглашение."
      );

      if (sent) {
        await bot.api.sendMessage(
          value,
          `Сделка №${dealId}`,
          {
            reply_markup: kb([
              [B("✅ Принять", `accept_${dealId}`)],
              [B("❌ Отклонить", `reject_${dealId}`)]
            ])
          }
        );
      }

      return ctx.reply(
        `🤝 Сделка №${dealId} создана.\n\n` +
        (sent
          ? "Ожидаем подтверждения участника."
          : "Участник должен сначала открыть бота.")
      );
    }

    if (s.step === "lookup") {
      if (!/^\d+$/.test(value)) {
        return ctx.reply("Введите числовой Telegram ID.");
      }

      states.delete(uid);

      if (value === String(ADMIN)) {
        return ctx.reply(
          `👤 Пользователь: ${value}\n` +
          "⭐⭐⭐⭐⭐ 5.0\n" +
          "82 успешные сделки\n\n" +
          "Демонстрационные данные, не подтверждённая статистика."
        );
      }

      const found = db.prepare(
        "SELECT id FROM users WHERE id=?"
      ).get(value);

      return ctx.reply(
        found
          ? `👤 Пользователь ${value}\nРейтинг не установлен.`
          : "Пользователь не найден в базе."
      );
    }

    if (s.step === "ticket") {
      if (value.length > 2000) {
        return ctx.reply("Максимум 2000 символов.");
      }

      const result = db.prepare(
        "INSERT INTO tickets(uid,message) VALUES (?,?)"
      ).run(String(uid), value);

      states.delete(uid);

      const ticketId = Number(result.lastInsertRowid);

      await notify(
        bot,
        ADMIN,
        `✉️ Обращение №${ticketId}\n` +
        `ID: ${uid}\n\n${value}\n\n` +
        `Ответ: /reply ${ticketId} текст`
      );

      return ctx.reply(
        `✅ Обращение №${ticketId} отправлено.`
      );
    }

    if (s.step === "admin_nft" && uid === ADMIN) {
      const match = value.match(/^(\d+)\s+(.{2,100})$/);

      if (!match) {
        return ctx.reply(
          "Формат: TelegramID Название NFT"
        );
      }

      states.set(ADMIN, {
        step: "nft_confirm",
        uid: match[1],
        name: match[2]
      });

      return ctx.reply(
        `🎁 Подтвердите NFT:\n` +
        `ID: ${match[1]}\n` +
        `Подарок: ${match[2]}\n\n` +
        "/confirmnft — подтвердить\n" +
        "/cancelnft — отменить"
      );
    }
  });

  bot.command("paysupport", ctx =>
    ctx.reply(
      "По вопросам платежей обратитесь в поддержку.",
      { reply_markup: back("support") }
    )
  );
}

