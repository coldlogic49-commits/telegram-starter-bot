
import { InlineKeyboard } from "grammy";

export function registerCommands(bot) {
  const menu = new InlineKeyboard()
    .text("⭐ Звёзды", "stars")
    .text("💎 Premium", "premium").row()
    .text("🪙 Gram", "gram")
    .text("🛒 Корзина", "cart").row()
    .url("🆘 Поддержка", "https://t.me/MazviroShop");

  const back = new InlineKeyboard().text("⬅️ Назад", "home");
  const carts = new Map();

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "🛍 Добро пожаловать в Mazviro Shop!\n\nВыберите раздел магазина:",
      { reply_markup: menu }
    );
  });

  bot.callbackQuery("home", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("🏠 Главное меню", { reply_markup: menu });
  });

  const categories = {
    stars: [
      ["50 Stars", 70],
      ["100 Stars", 140],
      ["150 Stars", 210]
    ],
    premium: [
      ["1 месяц Premium", 330],
      ["3 месяца Premium", 990]
    ],
    gram: [
      ["1 Gram", 115],
      ["5 Gram", 575]
    ]
  };

  for (const [category, products] of Object.entries(categories)) {
    bot.callbackQuery(category, async (ctx) => {
      await ctx.answerCallbackQuery();
      const kb = new InlineKeyboard();

      products.forEach(([name, price], i) => {
        kb.text(`${name} — ${price} ₽`, `buy_${category}_${i}`).row();
      });

      kb.text("⬅️ Назад", "home");
      await ctx.reply("Выберите товар:", { reply_markup: kb });
    });

    products.forEach(([name, price], i) => {
      bot.callbackQuery(`buy_${category}_${i}`, async (ctx) => {
        await ctx.answerCallbackQuery();
        const id = ctx.from.id;
        const cart = carts.get(id) || [];
        cart.push({ name, price });
        carts.set(id, cart);

        await ctx.reply(`✅ ${name} добавлен в корзину!`, {
          reply_markup: new InlineKeyboard()
            .text("🛒 Корзина", "cart")
            .text("🏠 Меню", "home")
        });
      });
    });
  }

  bot.callbackQuery("cart", async (ctx) => {
    await ctx.answerCallbackQuery();
    const cart = carts.get(ctx.from.id) || [];
    const total = cart.reduce((s, p) => s + p.price, 0);

    const text = cart.length
      ? "🛒 Ваша корзина:\n\n" +
        cart.map(p => `${p.name} — ${p.price} ₽`).join("\n") +
        `\n\nИтого: ${total} ₽`
      : "🛒 Корзина пуста";

    await ctx.reply(text, {
      reply_markup: new InlineKeyboard()
        .text("🧪 Оформить", "order").row()
        .text("🗑 Очистить", "clear")
        .text("⬅️ Назад", "home")
    });
  });

  bot.callbackQuery("clear", async (ctx) => {
    await ctx.answerCallbackQuery();
    carts.delete(ctx.from.id);
    await ctx.reply("✅ Корзина очищена", { reply_markup: back });
  });

  bot.callbackQuery("order", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!(carts.get(ctx.from.id) || []).length) {
      return ctx.reply("Сначала добавьте товар.");
    }
    await ctx.reply("✅ Тестовый заказ создан! Оплата не подключена.");
  });
}

