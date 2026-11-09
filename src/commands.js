
import { InlineKeyboard } from "grammy";

const ADMIN_ID = 8855596552;
const users = new Map();
const deals = new Map();
const tickets = new Map();
const states = new Map();

let nextDealId = 1;
let nextTicketId = 1;

function getUser(id) {
  if (!users.has(id)) {
    users.set(id, {
      balance: 0,
      nfts: [],
      deals: [],
    });
  }
  return users.get(id);
}

function keyboard(rows) {
  const kb = new InlineKeyboard();
  rows.forEach((row, index) => {
    if (index > 0) kb.row();
    row.forEach(([label, data]) => kb.text(label, data));
  });
  return kb;
}

function back(target = "home") {
  return keyboard([[["⬅️ Назад", target]]]);
}

function mainKeyboard(id) {
  const rows = [
    [["🤝 Создать сделку", "deal"]],
    [["💳 Пополнить баланс", "topup"]],
    [["📋 Мои сделки", "mydeals"]],
    [["🔎 Проверить пользователя", "lookup"]],
    [
      ["👤 Профиль", "profile"],
      ["💬 Поддержка", "support"],
    ],
    [["📜 Правила и условия", "rules"]],
    [["❓ Как работает гарант", "how"]],
  ];

  if (id === ADMIN_ID) {
    rows.push([["🔐 Админ-панель", "admin"]]);
  }

  return keyboard(rows);
}

const homeText =
  "🛡 Dealix Garant\n\n" +
  "Добро пожаловать в Dealix Garant — " +
  "сервис сопровождения сделок с " +
  "Telegram NFT, Stars и TON.\n\n" +
  "Выберите необходимый раздел:";

async function show(ctx, text, kb) {
  if (ctx.callbackQuery) {
    try {
      await ctx.answerCallbackQuery();
      return await ctx.editMessageText(text, {
        reply_markup: kb,
      });
    } catch (e) {
      // Если сообщение нельзя изменить,
      // отправляем новое.
    }
  }

  return ctx.reply(text, { reply_markup: kb });
}

async function notify(bot, id, text, options = {}) {
  try {
    await bot.api.sendMessage(id, text, options);
    return true;
  } catch (e) {
    return false;
  }
}

export function registerCommands(bot) {
  bot.command("start", (ctx) => {
    states.delete(ctx.from.id);
    getUser(ctx.from.id);

    return ctx.reply(homeText, {
      reply_markup: mainKeyboard(ctx.from.id),
    });
  });

  bot.callbackQuery("home", (ctx) => {
    states.delete(ctx.from.id);
    return show(ctx, homeText, mainKeyboard(ctx.from.id));
  });

  // СОЗДАНИЕ СДЕЛКИ

  bot.callbackQuery("deal", (ctx) => {
    return show(
      ctx,
      "🤝 Создание сделки | Dealix Garant\n\n" +
      "В данном разделе вы можете создать " +
      "сделку с участием гаранта.\n\n" +
      "Для продолжения выберите вашу роль:",
      keyboard([
        [["💎 Я продавец", "role_seller"]],
        [["💳 Я покупатель", "role_buyer"]],
        [["⬅️ Назад", "home"]],
      ])
    );
  });

  for (const role of ["seller", "buyer"]) {
    bot.callbackQuery("role_" + role, (ctx) => {
      states.set(ctx.from.id, { role });

      return show(
        ctx,
        "📦 Предмет сделки | Dealix Garant\n\n" +
        "Ваша роль: " +
        (role === "seller" ? "Продавец" : "Покупатель") +
        "\n\nВыберите категорию товара:",
        keyboard([
          [["🎁 Telegram NFT-подарки", "cat_" + role + "_nft"]],
          [["⭐ Telegram Stars", "cat_" + role + "_stars"]],
          [["🪙 Gram / TON", "cat_" + role + "_ton"]],
          [["⬅️ Назад", "deal"]],
        ])
      );
    });

    for (const category of ["nft", "stars", "ton"]) {
      bot.callbackQuery(
        "cat_" + role + "_" + category,
        (ctx) => {
          if (category === "nft") {
            states.set(ctx.from.id, {
              role,
              category,
            });

            return show(
              ctx,
              "🎁 NFT-инвентарь | Dealix Garant\n\n" +
              (
                getUser(ctx.from.id).nfts.length
                  ? "Выберите NFT-подарок из инвентаря."
                  : "Ваш инвентарь пуст.\n\n" +
                    "Для добавления NFT-подарка передайте " +
                    "его нашему официальному аккаунту — " +
                    "@DealixGarant.\n\n" +
                    "После подтверждения получения NFT " +
                    "появится в вашем профиле.\n\n" +
                    "Если сделка не состоится, вы сможете " +
                    "запросить его возврат."
              ),
              keyboard([
                [["🎁 Выбрать NFT", "choose_nft"]],
                [["🔄 Обновить инвентарь", "refresh_nft"]],
                [["⬅️ Назад", "role_" + role]],
              ])
            );
          }

          states.set(ctx.from.id, {
            step: "quantity",
            role,
            category,
          });

          return show(
            ctx,
            "📦 " +
              (category === "stars"
                ? "Telegram Stars"
                : "Gram / TON") +
              "\n\nВведите количество сообщением:",
            back("role_" + role)
          );
        }
      );
    }
  }

  // ОБНОВЛЕНИЕ NFT

  bot.callbackQuery("refresh_nft", async (ctx) => {
    const nfts = getUser(ctx.from.id).nfts;

    if (!nfts.length) {
      return ctx.answerCallbackQuery({
        text: "Вы не передали NFT-подарок.",
        show_alert: true,
      });
    }

    return ctx.answerCallbackQuery({
      text: "NFT в инвентаре: " + nfts.length,
      show_alert: true,
    });
  });

  bot.callbackQuery("choose_nft", (ctx) => {
    const nfts = getUser(ctx.from.id).nfts;

    if (!nfts.length) {
      return ctx.answerCallbackQuery({
        text: "Ваш инвентарь пуст.",
        show_alert: true,
      });
    }

    const rows = nfts.slice(0, 20).map((name, i) => [
      [name.slice(0, 45), "pick_nft_" + i],
    ]);

    rows.push([["⬅️ Назад", "deal"]]);

    return show(
      ctx,
      "🎁 Выберите NFT для сделки:",
      keyboard(rows)
    );
  });

  bot.callbackQuery(/^pick_nft_(\d+)$/, (ctx) => {
    const index = Number(ctx.match[1]);
    const nft = getUser(ctx.from.id).nfts[index];

    if (!nft) {
      return ctx.answerCallbackQuery({
        text: "NFT не найден.",
        show_alert: true,
      });
    }

    const old = states.get(ctx.from.id) || {};

    states.set(ctx.from.id, {
      step: "counterparty",
      role: old.role || "seller",
      category: "nft",
      item: nft,
      nftIndex: index,
    });

    return show(
      ctx,
      "🎁 Выбран NFT: " + nft +
      "\n\nВведите Telegram ID второго участника:",
      back("deal")
    );
  });

  // ПОПОЛНЕНИЕ БАЛАНСА

  bot.callbackQuery("topup", (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
      return ctx.answerCallbackQuery({
        text: "Баланс в вашей стране недоступен.",
        show_alert: true,
      });
    }

    return show(
      ctx,
      "🔐 Управление балансами",
      keyboard([
        [["💰 Начислить баланс", "admin_credit"]],
        [["⬅️ Назад", "home"]],
      ])
    );
  });

  // ПРОФИЛЬ

  bot.callbackQuery("profile", (ctx) => {
    const u = getUser(ctx.from.id);

    return show(
      ctx,
      "👤 Профиль | Dealix Garant\n\n" +
      "Telegram ID: " + ctx.from.id + "\n" +
      "Баланс: " + u.balance + " ₽\n" +
      "NFT в инвентаре: " + u.nfts.length + "\n" +
      "Сделок: " + u.deals.length,
      keyboard([
        [["🎁 Мой инвентарь", "inventory"]],
        [["⬅️ Назад", "home"]],
      ])
    );
  });

  bot.callbackQuery("inventory", (ctx) => {
    const nfts = getUser(ctx.from.id).nfts;

    return show(
      ctx,
      "🎁 Мой NFT-инвентарь\n\n" +
      (
        nfts.length
          ? nfts.map((name, i) => (i + 1) + ". " + name).join("\n")
          : "Ваш инвентарь пуст."
      ),
      back("profile")
    );
  });

  // МОИ СДЕЛКИ

  bot.callbackQuery("mydeals", (ctx) => {
    const ids = getUser(ctx.from.id).deals;

    const lines = ids
      .map((id) => deals.get(id))
      .filter(Boolean)
      .map((d) =>
        "№" + d.id + ": " + d.item + "\n" +
        "Статус: " + d.status
      );

    return show(
      ctx,
      "📋 Мои сделки | Dealix Garant\n\n" +
      (lines.length ? lines.join("\n\n") : "Сделок пока нет."),
      back()
    );
  });

  // ПРОВЕРКА ПОЛЬЗОВАТЕЛЯ

  bot.callbackQuery("lookup", (ctx) => {
    states.set(ctx.from.id, { step: "lookup" });

    return show(
      ctx,
      "🔎 Проверка пользователя | Dealix Garant\n\n" +
      "Введите Telegram ID пользователя:",
      back()
    );
  });

  // ПОДДЕРЖКА

  bot.callbackQuery("support", (ctx) => {
    return show(
      ctx,
      "💬 Поддержка | Dealix Garant\n\n" +
      "Если у вас возникли вопросы или проблемы " +
      "при проведении сделки, обратитесь в поддержку.\n\n" +
      "Выберите необходимое действие:",
      keyboard([
        [["✉️ Создать обращение", "ticket_new"]],
        [["📋 Мои обращения", "ticket_list"]],
        [["⬅️ Назад", "home"]],
      ])
    );
  });

  bot.callbackQuery("ticket_new", (ctx) => {
    states.set(ctx.from.id, { step: "ticket" });

    return show(
      ctx,
      "✉️ Создание обращения\n\n" +
      "Напишите сообщение для службы поддержки:",
      back("support")
    );
  });

  bot.callbackQuery("ticket_list", (ctx) => {
    const list = [...tickets.values()]
      .filter((t) => t.owner === ctx.from.id);

    return show(
      ctx,
      "📋 Мои обращения\n\n" +
      (
        list.length
          ? list.map((t) =>
              "№" + t.id + " — " + t.status
            ).join("\n")
          : "Обращений пока нет."
      ),
      back("support")
    );
  });

  // ПРАВИЛА

  bot.callbackQuery("rules", (ctx) => {
    return show(
      ctx,
      "📜 Правила и условия | Dealix Garant\n\n" +
      "1. Участники обязаны указывать достоверные данные.\n" +
      "2. Условия сделки должны быть подтверждены сторонами.\n" +
      "3. Передача NFT и средств производится после проверки.\n" +
      "4. Возврат осуществляется согласно условиям сделки.\n" +
      "5. Не передавайте пароли и коды входа Telegram.",
      back()
    );
  });

  bot.callbackQuery("how", (ctx) => {
    return show(
      ctx,
      "🛡 Как работает гарант | Dealix Garant\n\n" +
      "1. Один из участников создаёт сделку.\n" +
      "2. Продавец передаёт NFT гаранту.\n" +
      "3. Второй участник подтверждает условия.\n" +
      "4. Покупатель производит оплату.\n" +
      "5. После проверки гарант передаёт NFT " +
      "покупателю, а средства — продавцу.",
      keyboard([
        [["🤝 Создать сделку", "deal"]],
        [["⬅️ Назад", "home"]],
      ])
    );
  });

  // АДМИН-ПАНЕЛЬ

  function adminKeyboard() {
    return keyboard([
      [["💰 Начислить баланс", "admin_credit"]],
      [["🎁 Подтвердить NFT", "admin_nft"]],
      [["📋 Обращения", "admin_tickets"]],
      [["⬅️ Назад", "home"]],
    ]);
  }

  bot.command("admin", (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
      return ctx.reply("Доступ запрещён.");
    }

    return ctx.reply(
      "🔐 Админ-панель | Dealix Garant",
      { reply_markup: adminKeyboard() }
    );
  });

  bot.callbackQuery("admin", (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
      return ctx.answerCallbackQuery({
        text: "Доступ запрещён.",
        show_alert: true,
      });
    }

    return show(
      ctx,
      "🔐 Админ-панель | Dealix Garant",
      adminKeyboard()
    );
  });

  bot.callbackQuery("admin_credit", (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
      return ctx.answerCallbackQuery({
        text: "Доступ запрещён.",
        show_alert: true,
      });
    }

    states.set(ctx.from.id, { step: "admin_credit" });

    return show(
      ctx,
      "💰 Начисление баланса\n\n" +
      "Введите Telegram ID, сумму и номер сделки.\n\n" +
      "Пример:\n123456789 1000 1\n\n" +
      "Подтверждайте только реальные платежи.",
      back("admin")
    );
  });

  bot.callbackQuery("admin_nft", (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
      return ctx.answerCallbackQuery({
        text: "Доступ запрещён.",
        show_alert: true,
      });
    }

    states.set(ctx.from.id, { step: "admin_nft" });

    return show(
      ctx,
      "🎁 Подтверждение NFT\n\n" +
      "Введите Telegram ID и название полученного NFT.\n\n" +
      "Пример:\n123456789 Plush Pepe",
      back("admin")
    );
  });

  bot.callbackQuery("admin_tickets", (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
      return ctx.answerCallbackQuery({
        text: "Доступ запрещён.",
        show_alert: true,
      });
    }

    const list = [...tickets.values()]
      .filter((t) => t.status === "Открыто");

    return show(
      ctx,
      "📋 Обращения | Dealix Garant\n\n" +
      (
        list.length
          ? list.map((t) =>
              "№" + t.id + "\n" +
              "Пользователь: " + t.owner + "\n" +
              t.text
            ).join("\n\n")
          : "Открытых обращений нет."
      ) +
      "\n\nОтвет: /reply номер текст\n" +
      "Закрыть: /close номер",
      back("admin")
    );
  });

  // ОБРАБОТКА СООБЩЕНИЙ

  bot.on("message:text", async (ctx) => {
    const id = ctx.from.id;
    const state = states.get(id);

    if (!state) return;

    const text = ctx.message.text.trim();

    // Поиск пользователя
    if (state.step === "lookup") {
      if (!/^\d+$/.test(text)) {
        return ctx.reply("Введите числовой Telegram ID.");
      }

      states.delete(id);

      if (text === String(ADMIN_ID)) {
        return ctx.reply(
          "👤 Профиль пользователя\n\n" +
          "Telegram ID: 8855596552\n" +
          "Рейтинг: ⭐⭐⭐⭐⭐ 5.0\n" +
          "Успешных сделок: 82\n\n" +
          "Демонстрационные показатели.",
          { reply_markup: back("lookup") }
        );
      }

      const found = users.get(Number(text));

      return ctx.reply(
        found
          ? "👤 Пользователь: " + text + "\n" +
            "Сделок: " + found.deals.length + "\n" +
            "Рейтинг не установлен."
          : "Пользователь не найден в базе сервиса.",
        { reply_markup: back("lookup") }
      );
    }

    // Количество Stars или TON
    if (state.step === "quantity") {
      const amount = Number(text.replace(",", "."));

      if (!Number.isFinite(amount) || amount <= 0) {
        return ctx.reply("Введите положительное количество.");
      }

      states.set(id, {
        ...state,
        step: "counterparty",
        item: text + " " +
          (state.category === "stars" ? "Stars" : "TON"),
      });

      return ctx.reply(
        "Введите Telegram ID второго участника:",
        { reply_markup: back("deal") }
      );
    }

    // Второй участник сделки
    if (state.step === "counterparty") {
      if (!/^\d+$/.test(text) || Number(text) === id) {
        return ctx.reply("Введите корректный Telegram ID.");
      }

      const otherId = Number(text);
      const dealId = nextDealId++;

      const deal = {
        id: dealId,
        owner: id,
        counterparty: otherId,
        item: state.item,
        status: "Ожидает подтверждения",
      };

      deals.set(dealId, deal);
      getUser(id).deals.push(dealId);
      getUser(otherId).deals.push(dealId);
      states.delete(id);

      const sent = await notify(
        bot,
        otherId,
        "🤝 Приглашение в сделку №" + dealId +
        "\n\nТовар: " + deal.item +
        "\nУчастник: " + id +
        "\n\nПодтвердите участие:",
        {
          reply_markup: keyboard([
            [["✅ Подтвердить", "join_" + dealId]],
            [["❌ Отклонить", "reject_" + dealId]],
          ]),
        }
      );

      return ctx.reply(
        "🤝 Сделка №" + dealId + " создана.\n\n" +
        (
          sent
            ? "Ожидаем подтверждения второго участника."
            : "Приглашение не доставлено. " +
              "Второму участнику необходимо открыть бота."
        )
      );
    }

    // Создание обращения
    if (state.step === "ticket") {
      if (text.length > 2000) {
        return ctx.reply("Максимум 2000 символов.");
      }

      const ticket = {
        id: nextTicketId++,
        owner: id,
        text,
        status: "Открыто",
      };

      tickets.set(ticket.id, ticket);
      states.delete(id);

      await notify(
        bot,
        ADMIN_ID,
        "✉️ Обращение №" + ticket.id +
        "\n\nПользователь: " + id +
        "\n\n" + text +
        "\n\nОтветить: /reply " + ticket.id + " текст" +
        "\nЗакрыть: /close " + ticket.id
      );

      return ctx.reply(
        "✅ Обращение №" + ticket.id + " отправлено."
      );
    }

    // Начисление администратором
    if (state.step === "admin_credit" && id === ADMIN_ID) {
      const match = text.match(/^(\d+)\s+(\d+)\s+(\d+)$/);

      if (!match) {
        return ctx.reply(
          "Формат: TelegramID сумма номер_сделки"
        );
      }

      const userId = Number(match[1]);
      const amount = Number(match[2]);
      const dealId = Number(match[3]);
      const deal = deals.get(dealId);

      if (!Number.isSafeInteger(userId) ||
          !Number.isSafeInteger(amount) ||
          amount <= 0 ||
          amount > 100000000 ||
          !deal ||
          (deal.owner !== userId &&
           deal.counterparty !== userId)) {
        return ctx.reply(
          "Проверьте ID, сумму и номер существующей сделки."
        );
      }

      states.set(id, {
        step: "confirm_credit",
        userId,
        amount,
        dealId,
      });

      return ctx.reply(
        "💰 Подтверждение начисления\n\n" +
        "Пользователь: " + userId +
        "\nСумма: " + amount + " ₽" +
        "\nСделка: №" + dealId +
        "\n\nОтправьте /confirmcredit для подтверждения " +
        "реально полученного платежа или /cancelcredit для отмены."
      );
    }

    // Подтверждение NFT
    if (state.step === "admin_nft" && id === ADMIN_ID) {
      const match = text.match(/^(\d+)\s+(.{2,100})$/);

      if (!match) {
        return ctx.reply("Формат: TelegramID Название NFT");
      }

      const userId = Number(match[1]);
      const nftName = match[2];

      if (!Number.isSafeInteger(userId)) {
        return ctx.reply("Некорректный Telegram ID.");
      }

      states.set(id, {
        step: "confirm_nft",
        userId,
        nftName,
      });

      return ctx.reply(
        "🎁 Подтверждение NFT\n\n" +
        "Владелец: " + userId +
        "\nNFT: " + nftName +
        "\n\nПроверьте фактическое получение подарка.\n" +
        "Подтвердить: /confirmnft\n" +
        "Отменить: /cancelnft"
      );
    }
  });

  // ПОДТВЕРЖДЕНИЕ УЧАСТИЯ

  bot.callbackQuery(/^join_(\d+)$/, async (ctx) => {
    const deal = deals.get(Number(ctx.match[1]));

    if (!deal ||
        deal.counterparty !== ctx.from.id ||
        deal.status !== "Ожидает подтверждения") {
      return ctx.answerCallbackQuery({
        text: "Сделка недоступна.",
        show_alert: true,
      });
    }

    deal.status = "Подтверждена участниками";

    await show(
      ctx,
      "✅ Вы подтвердили участие в сделке №" + deal.id,
      back()
    );

    await notify(
      bot,
      deal.owner,
      "✅ Второй участник подтвердил сделку №" + deal.id
    );
  });

  bot.callbackQuery(/^reject_(\d+)$/, async (ctx) => {
    const deal = deals.get(Number(ctx.match[1]));

    if (!deal ||
        deal.counterparty !== ctx.from.id ||
        deal.status !== "Ожидает подтверждения") {
      return ctx.answerCallbackQuery({
        text: "Сделка недоступна.",
        show_alert: true,
      });
    }

    deal.status = "Отклонена";

    await show(
      ctx,
      "❌ Сделка №" + deal.id + " отклонена.",
      back()
    );

    await notify(
      bot,
      deal.owner,
      "❌ Второй участник отклонил сделку №" + deal.id
    );
  });

  // КОМАНДЫ АДМИНИСТРАТОРА

  bot.command("confirmcredit", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const state = states.get(ADMIN_ID);

    if (!state || state.step !== "confirm_credit") {
      return ctx.reply("Нет начисления для подтверждения.");
    }

    const deal = deals.get(state.dealId);

    if (!deal ||
        (deal.owner !== state.userId &&
         deal.counterparty !== state.userId)) {
      return ctx.reply("Сделка не найдена.");
    }

    getUser(state.userId).balance += state.amount;
    states.delete(ADMIN_ID);

    const message =
      "💰 Пополнение баланса | Dealix Garant\n\n" +
      "Пользователь " + state.userId +
      " пополнил баланс на " + state.amount + " ₽\n" +
      "Сделка №" + state.dealId +
      "\nСтатус: Подтверждено";

    await notify(bot, deal.owner, message);

    if (deal.counterparty !== deal.owner) {
      await notify(bot, deal.counterparty, message);
    }

    return ctx.reply(
      "✅ Начисление подтверждено.",
      { reply_markup: adminKeyboard() }
    );
  });

  bot.command("cancelcredit", (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    states.delete(ADMIN_ID);
    return ctx.reply("Начисление отменено.");
  });

  bot.command("confirmnft", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const state = states.get(ADMIN_ID);

    if (!state || state.step !== "confirm_nft") {
      return ctx.reply("Нет NFT для подтверждения.");
    }

    getUser(state.userId).nfts.push(state.nftName);
    states.delete(ADMIN_ID);

    await notify(
      bot,
      state.userId,
      "🎁 NFT получен и добавлен в инвентарь:\n" +
      state.nftName
    );

    return ctx.reply(
      "✅ NFT добавлен в инвентарь.",
      { reply_markup: adminKeyboard() }
    );
  });

  bot.command("cancelnft", (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    states.delete(ADMIN_ID);
    return ctx.reply("Подтверждение NFT отменено.");
  });

  bot.command("reply", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const match = ctx.message.text.match(
      /^\/reply(?:@\w+)?\s+(\d+)\s+([\s\S]+)/
    );

    if (!match) {
      return ctx.reply("Формат: /reply номер текст");
    }

    const ticket = tickets.get(Number(match[1]));

    if (!ticket || ticket.status !== "Открыто") {
      return ctx.reply("Открытое обращение не найдено.");
    }

    const sent = await notify(
      bot,
      ticket.owner,
      "💬 Ответ поддержки | Dealix Garant\n\n" +
      "Обращение №" + ticket.id +
      "\n\n" + match[2]
    );

    return ctx.reply(
      sent ? "Ответ отправлен." : "Не удалось отправить ответ."
    );
  });

  bot.command("close", (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const number = Number(ctx.message.text.split(/\s+/)[1]);
    const ticket = tickets.get(number);

    if (!ticket) {
      return ctx.reply("Обращение не найдено.");
    }

    ticket.status = "Закрыто";

    return ctx.reply(
      "Обращение №" + number + " закрыто."
    );
  });
}

