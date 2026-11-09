import { InlineKeyboard } from "grammy";

const ADMIN_ID = 8855596552;
const NFT_ACCOUNT = "https://t.me/DealixGarant";

const users = new Map();
const deals = new Map();
const tickets = new Map();
const states = new Map();

let nextDealId = 1;
let nextTicketId = 1;

function user(id) {
  if (!users.has(id)) {
    users.set(id, {
      balance: 0,
      nfts: [],
      deals: [],
    });
  }
  return users.get(id);
}

function menu(rows) {
  const kb = new InlineKeyboard();

  rows.forEach((row, i) => {
    if (i) kb.row();

    row.forEach((button) => {
      if (button.url) {
        kb.url(button.label, button.url);
      } else {
        kb.text(button.label, button.data);
      }
    });
  });

  return kb;
}

function btn(label, data) {
  return { label, data };
}

function link(label, url) {
  return { label, url };
}

function back(data = "home") {
  return menu([[btn("⬅️ Назад", data)]]);
}

function mainMenu(id) {
  const rows = [
    [btn("🤝 Создать сделку", "deal")],
    [btn("💳 Пополнить баланс", "topup")],
    [btn("📋 Мои сделки", "mydeals")],
    [btn("🔎 Проверить пользователя", "lookup")],
    [
      btn("👤 Профиль", "profile"),
      btn("💬 Поддержка", "support"),
    ],
    [btn("📜 Правила и условия", "rules")],
    [btn("❓ Как работает гарант", "how")],
  ];

  if (id === ADMIN_ID) {
    rows.push([btn("🔐 Админ-панель", "admin")]);
  }

  return menu(rows);
}

const welcome =
  "🛡 Dealix Garant\n\n" +
  "Добро пожаловать в Dealix Garant — " +
  "сервис сопровождения сделок с " +
  "Telegram NFT, Stars и TON.\n\n" +
  "Выберите необходимый раздел:";

async function show(ctx, text, reply_markup) {
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();

    try {
      return await ctx.editMessageText(text, {
        reply_markup,
      });
    } catch (error) {
      // Сообщение могло остаться без изменений.
    }
  }

  return ctx.reply(text, { reply_markup });
}

async function notify(bot, id, text, reply_markup) {
  try {
    await bot.api.sendMessage(id, text, {
      reply_markup,
    });
    return true;
  } catch (error) {
    return false;
  }
}

function inventoryText(id) {
  const nfts = user(id).nfts;

  if (!nfts.length) {
    return (
      "🎁 NFT-инвентарь | Dealix Garant\n\n" +
      "Ваш инвентарь пуст.\n\n" +
      "Для добавления NFT-подарка передайте его " +
      "нашему официальному аккаунту — @DealixGarant.\n\n" +
      "После подтверждения получения NFT " +
      "появится в вашем профиле.\n\n" +
      "Если сделка не состоится, вы сможете " +
      "запросить его возврат."
    );
  }

  return (
    "🎁 NFT-инвентарь | Dealix Garant\n\n" +
    "Доступные NFT-подарки:\n\n" +
    nfts.map((nft, i) => `${i + 1}. ${nft}`).join("\n") +
    "\n\nВыберите подарок для сделки."
  );
}

function inventoryMenu() {
  return menu([
    [link("🎁 Отправить NFT", NFT_ACCOUNT)],
    [btn("🎁 Выбрать NFT", "choose_nft")],
    [btn("🔄 Обновить инвентарь", "refresh_nft")],
    [btn("⬅️ Назад", "deal")],
  ]);
}

function adminMenu() {
  return menu([
    [btn("💰 Начислить баланс", "admin_credit")],
    [btn("🎁 Подтвердить NFT", "admin_nft")],
    [btn("📋 Обращения", "admin_tickets")],
    [btn("⬅️ Назад", "home")],
  ]);
}

export function registerCommands(bot) {
  bot.command("start", (ctx) => {
    states.delete(ctx.from.id);
    user(ctx.from.id);

    return ctx.reply(welcome, {
      reply_markup: mainMenu(ctx.from.id),
    });
  });

  bot.callbackQuery("home", (ctx) => {
    states.delete(ctx.from.id);
    return show(ctx, welcome, mainMenu(ctx.from.id));
  });

  // СОЗДАНИЕ СДЕЛКИ

  bot.callbackQuery("deal", (ctx) => {
    states.delete(ctx.from.id);

    return show(
      ctx,
      "🤝 Создание сделки | Dealix Garant\n\n" +
        "Выберите вашу роль:",
      menu([
        [btn("💎 Я продавец", "role_seller")],
        [btn("💳 Я покупатель", "role_buyer")],
        [btn("⬅️ Назад", "home")],
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
          "\n\nВыберите категорию:",
        menu([
          [
            btn(
              "🎁 Telegram NFT-подарки",
              `cat_${role}_nft`
            ),
          ],
          [
            btn(
              "⭐ Telegram Stars",
              `cat_${role}_stars`
            ),
          ],
          [
            btn("🪙 Gram / TON", `cat_${role}_ton`),
          ],
          [btn("⬅️ Назад", "deal")],
        ])
      );
    });

    for (const category of ["nft", "stars", "ton"]) {
      bot.callbackQuery(
        `cat_${role}_${category}`,
        (ctx) => {
          states.set(ctx.from.id, {
            role,
            category,
          });

          if (category === "nft") {
            return show(
              ctx,
              inventoryText(ctx.from.id),
              inventoryMenu()
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

  // NFT-ИНВЕНТАРЬ

  bot.callbackQuery("refresh_nft", async (ctx) => {
    const nfts = user(ctx.from.id).nfts;

    if (!nfts.length) {
      return ctx.answerCallbackQuery({
        text: "Вы не передали NFT-подарок.",
        show_alert: true,
      });
    }

    await ctx.answerCallbackQuery({
      text: `NFT в инвентаре: ${nfts.length}`,
      show_alert: true,
    });

    try {
      await ctx.editMessageText(
        inventoryText(ctx.from.id),
        { reply_markup: inventoryMenu() }
      );
    } catch (error) {}
  });

  bot.callbackQuery("choose_nft", (ctx) => {
    const nfts = user(ctx.from.id).nfts;

    if (!nfts.length) {
      return ctx.answerCallbackQuery({
        text: "Ваш инвентарь пуст. Сначала отправьте NFT.",
        show_alert: true,
      });
    }

    const rows = nfts.slice(0, 20).map((nft, i) => [
      btn(nft.slice(0, 45), `pick_nft_${i}`),
    ]);

    rows.push([btn("⬅️ Назад", "deal")]);

    return show(
      ctx,
      "🎁 Выберите NFT для сделки:",
      menu(rows)
    );
  });

  bot.callbackQuery(/^pick_nft_(\d+)$/, (ctx) => {
    const index = Number(ctx.match[1]);
    const nft = user(ctx.from.id).nfts[index];

    if (!nft) {
      return ctx.answerCallbackQuery({
        text: "NFT не найден.",
        show_alert: true,
      });
    }

    const previous = states.get(ctx.from.id) || {};

    states.set(ctx.from.id, {
      step: "counterparty",
      role: previous.role || "seller",
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

  // ПОПОЛНЕНИЕ

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
      menu([
        [btn("💰 Начислить баланс", "admin_credit")],
        [btn("⬅️ Назад", "home")],
      ])
    );
  });

  // ПРОФИЛЬ

  bot.callbackQuery("profile", (ctx) => {
    const u = user(ctx.from.id);

    return show(
      ctx,
      "👤 Профиль | Dealix Garant\n\n" +
        "Telegram ID: " + ctx.from.id +
        "\nБаланс: " + u.balance + " ₽" +
        "\nNFT в инвентаре: " + u.nfts.length +
        "\nСделок: " + u.deals.length,
      menu([
        [btn("🎁 Мой инвентарь", "inventory")],
        [btn("⬅️ Назад", "home")],
      ])
    );
  });

  bot.callbackQuery("inventory", (ctx) => {
    const nfts = user(ctx.from.id).nfts;

    return show(
      ctx,
      "🎁 Мой NFT-инвентарь\n\n" +
        (nfts.length
          ? nfts
              .map((nft, i) => `${i + 1}. ${nft}`)
              .join("\n")
          : "Ваш инвентарь пуст."),
      menu([
        [link("🎁 Отправить NFT", NFT_ACCOUNT)],
        [btn("🔄 Обновить инвентарь", "refresh_nft")],
        [btn("⬅️ Назад", "profile")],
      ])
    );
  });

  // МОИ СДЕЛКИ

  bot.callbackQuery("mydeals", (ctx) => {
    const list = user(ctx.from.id).deals
      .map((id) => deals.get(id))
      .filter(Boolean);

    return show(
      ctx,
      "📋 Мои сделки | Dealix Garant\n\n" +
        (list.length
          ? list
              .map(
                (d) =>
                  `№${d.id}: ${d.item}\nСтатус: ${d.status}`
              )
              .join("\n\n")
          : "Сделок пока нет."),
      back()
    );
  });

  // ПРОВЕРКА ПОЛЬЗОВАТЕЛЯ

  bot.callbackQuery("lookup", (ctx) => {
    states.set(ctx.from.id, {
      step: "lookup",
    });

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
        "Добро пожаловать в службу поддержки.\n\n" +
        "Если у вас возникли вопросы или проблемы " +
        "при проведении сделки, обратитесь " +
        "к администрации сервиса.\n\n" +
        "Выберите необходимое действие:",
      menu([
        [btn("✉️ Создать обращение", "ticket_new")],
        [btn("📋 Мои обращения", "ticket_list")],
        [btn("⬅️ Назад", "home")],
      ])
    );
  });

  bot.callbackQuery("ticket_new", (ctx) => {
    states.set(ctx.from.id, {
      step: "ticket",
    });

    return show(
      ctx,
      "✉️ Создание обращения\n\n" +
        "Напишите сообщение для поддержки:",
      back("support")
    );
  });

  bot.callbackQuery("ticket_list", (ctx) => {
    const list = [...tickets.values()].filter(
      (t) => t.owner === ctx.from.id
    );

    return show(
      ctx,
      "📋 Мои обращения\n\n" +
        (list.length
          ? list
              .map((t) => `№${t.id} — ${t.status}`)
              .join("\n")
          : "Обращений пока нет."),
      back("support")
    );
  });

  // ПРАВИЛА

  bot.callbackQuery("rules", (ctx) => {
    return show(
      ctx,
      "📜 Правила и условия | Dealix Garant\n\n" +
        "1. Участники указывают достоверные данные.\n" +
        "2. Условия сделки подтверждаются сторонами.\n" +
        "3. Передача NFT и средств производится " +
        "после проверки.\n" +
        "4. Возврат осуществляется по условиям сделки.\n" +
        "5. Никому не передавайте пароли и коды Telegram.",
      back()
    );
  });

  bot.callbackQuery("how", (ctx) => {
    return show(
      ctx,
      "❓ Как работает гарант | Dealix Garant\n\n" +
        "1. Участник создаёт сделку.\n" +
        "2. Продавец передаёт NFT гаранту.\n" +
        "3. Второй участник подтверждает условия.\n" +
        "4. Покупатель оплачивает товар.\n" +
        "5. После проверки гарант передаёт NFT " +
        "покупателю, а средства продавцу.",
      menu([
        [btn("🤝 Создать сделку", "deal")],
        [btn("⬅️ Назад", "home")],
      ])
    );
  });

  // АДМИН-ПАНЕЛЬ

  bot.command("admin", (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
      return ctx.reply("Доступ запрещён.");
    }

    return ctx.reply(
      "🔐 Админ-панель | Dealix Garant",
      { reply_markup: adminMenu() }
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
      adminMenu()
    );
  });

  bot.callbackQuery("admin_credit", (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
      return ctx.answerCallbackQuery({
        text: "Доступ запрещён.",
        show_alert: true,
      });
    }

    states.set(ctx.from.id, {
      step: "admin_credit",
    });

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

    states.set(ctx.from.id, {
      step: "admin_nft",
    });

    return show(
      ctx,
      "🎁 Подтверждение NFT\n\n" +
        "Введите Telegram ID и название " +
        "фактически полученного NFT.\n\n" +
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

    const list = [...tickets.values()].filter(
      (t) => t.status === "Открыто"
    );

    return show(
      ctx,
      "📋 Обращения | Dealix Garant\n\n" +
        (list.length
          ? list
              .map(
                (t) =>
                  `№${t.id}\nПользователь: ${t.owner}\n${t.text}`
              )
              .join("\n\n")
          : "Открытых обращений нет.") +
        "\n\nОтвет: /reply номер текст" +
        "\nЗакрыть: /close номер",
      back("admin")
    );
  });

  // ОБРАБОТКА СООБЩЕНИЙ

  bot.on("message:text", async (ctx) => {
    const id = ctx.from.id;
    const state = states.get(id);

    if (!state) return;

    const text = ctx.message.text.trim();

    // Поиск по ID
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
          ? "👤 Пользователь: " +
              text +
              "\nСделок: " +
              found.deals.length +
              "\nРейтинг не установлен."
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
        item:
          text +
          " " +
          (state.category === "stars" ? "Stars" : "TON"),
      });

      return ctx.reply(
        "Введите Telegram ID второго участника:",
        { reply_markup: back("deal") }
      );
    }

    // Создание сделки
    if (state.step === "counterparty") {
      if (
        !/^\d+$/.test(text) ||
        !Number.isSafeInteger(Number(text)) ||
        Number(text) === id
      ) {
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
      user(id).deals.push(dealId);
      user(otherId).deals.push(dealId);
      states.delete(id);

      const sent = await notify(
        bot,
        otherId,
        "🤝 Приглашение в сделку №" +
          dealId +
          "\n\nТовар: " +
          deal.item +
          "\nУчастник: " +
          id +
          "\n\nПодтвердите участие:",
        menu([
          [btn("✅ Подтвердить", "join_" + dealId)],
          [btn("❌ Отклонить", "reject_" + dealId)],
        ])
      );

      return ctx.reply(
        "🤝 Сделка №" +
          dealId +
          " создана.\n\n" +
          (sent
            ? "Ожидаем подтверждения второго участника."
            : "Приглашение не доставлено. " +
              "Второму участнику необходимо открыть бота.")
      );
    }

    // Обращение в поддержку
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
        "✉️ Обращение №" +
          ticket.id +
          "\n\nПользователь: " +
          id +
          "\n\n" +
          text +
          "\n\nОтветить: /reply " +
          ticket.id +
          " текст\nЗакрыть: /close " +
          ticket.id
      );

      return ctx.reply(
        "✅ Обращение №" +
          ticket.id +
          " отправлено."
      );
    }

    // Начисление баланса
    if (
      state.step === "admin_credit" &&
      id === ADMIN_ID
    ) {
      const match = text.match(
        /^(\d+)\s+(\d+)\s+(\d+)$/
      );

      if (!match) {
        return ctx.reply(
          "Формат: TelegramID сумма номер_сделки"
        );
      }

      const userId = Number(match[1]);
      const amount = Number(match[2]);
      const dealId = Number(match[3]);
      const deal = deals.get(dealId);

      if (
        !Number.isSafeInteger(userId) ||
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        amount > 100000000 ||
        !deal ||
        (deal.owner !== userId &&
          deal.counterparty !== userId)
      ) {
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
          "Пользователь: " +
          userId +
          "\nСумма: " +
          amount +
          " ₽\nСделка: №" +
          dealId +
          "\n\nПосле проверки платежа отправьте " +
          "/confirmcredit или /cancelcredit."
      );
    }

    // Добавление NFT администратором
    if (
      state.step === "admin_nft" &&
      id === ADMIN_ID
    ) {
      const match = text.match(
        /^(\d+)\s+(.{2,100})$/
      );

      if (!match) {
        return ctx.reply(
          "Формат: TelegramID Название NFT"
        );
      }

      const userId = Number(match[1]);

      if (!Number.isSafeInteger(userId)) {
        return ctx.reply("Некорректный Telegram ID.");
      }

      states.set(id, {
        step: "confirm_nft",
        userId,
        nftName: match[2],
      });

      return ctx.reply(
        "🎁 Подтверждение NFT\n\n" +
          "Владелец: " +
          userId +
          "\nNFT: " +
          match[2] +
          "\n\nПроверьте получение подарка.\n" +
          "Подтвердить: /confirmnft\n" +
          "Отменить: /cancelnft"
      );
    }
  });

  // ПОДТВЕРЖДЕНИЕ СДЕЛКИ

  bot.callbackQuery(/^join_(\d+)$/, async (ctx) => {
    const deal = deals.get(Number(ctx.match[1]));

    if (
      !deal ||
      deal.counterparty !== ctx.from.id ||
      deal.status !== "Ожидает подтверждения"
    ) {
      return ctx.answerCallbackQuery({
        text: "Сделка недоступна.",
        show_alert: true,
      });
    }

    deal.status = "Подтверждена участниками";

    await show(
      ctx,
      "✅ Вы подтвердили участие в сделке №" +
        deal.id,
      back()
    );

    await notify(
      bot,
      deal.owner,
      "✅ Второй участник подтвердил сделку №" +
        deal.id
    );
  });

  bot.callbackQuery(/^reject_(\d+)$/, async (ctx) => {
    const deal = deals.get(Number(ctx.match[1]));

    if (
      !deal ||
      deal.counterparty !== ctx.from.id ||
      deal.status !== "Ожидает подтверждения"
    ) {
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
      "❌ Второй участник отклонил сделку №" +
        deal.id
    );
  });

  // КОМАНДЫ АДМИНИСТРАТОРА

  bot.command("confirmcredit", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const state = states.get(ADMIN_ID);

    if (
      !state ||
      state.step !== "confirm_credit"
    ) {
      return ctx.reply(
        "Нет начисления для подтверждения."
      );
    }

    const deal = deals.get(state.dealId);

    if (
      !deal ||
      (deal.owner !== state.userId &&
        deal.counterparty !== state.userId)
    ) {
      return ctx.reply("Сделка не найдена.");
    }

    user(state.userId).balance += state.amount;
    states.delete(ADMIN_ID);

    const message =
      "💰 Пополнение баланса | Dealix Garant\n\n" +
      "Пользователь " +
      state.userId +
      " пополнил баланс на " +
      state.amount +
      " ₽\nСделка №" +
      state.dealId +
      "\nСтатус: Подтверждено";

    await notify(bot, deal.owner, message);

    if (deal.counterparty !== deal.owner) {
      await notify(bot, deal.counterparty, message);
    }

    return ctx.reply(
      "✅ Начисление подтверждено.",
      { reply_markup: adminMenu() }
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

    if (
      !state ||
      state.step !== "confirm_nft"
    ) {
      return ctx.reply(
        "Нет NFT для подтверждения."
      );
    }

    user(state.userId).nfts.push(state.nftName);
    states.delete(ADMIN_ID);

    await notify(
      bot,
      state.userId,
      "🎁 NFT подтверждён и добавлен " +
        "в инвентарь:\n" +
        state.nftName
    );

    return ctx.reply(
      "✅ NFT добавлен в инвентарь.",
      { reply_markup: adminMenu() }
    );
  });

  bot.command("cancelnft", (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    states.delete(ADMIN_ID);

    return ctx.reply(
      "Подтверждение NFT отменено."
    );
  });

  bot.command("reply", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const match = ctx.message.text.match(
      /^\/reply(?:@\w+)?\s+(\d+)\s+([\s\S]+)/
    );

    if (!match) {
      return ctx.reply(
        "Формат: /reply номер текст"
      );
    }

    const ticket = tickets.get(Number(match[1]));

    if (
      !ticket ||
      ticket.status !== "Открыто"
    ) {
      return ctx.reply(
        "Открытое обращение не найдено."
      );
    }

    const sent = await notify(
      bot,
      ticket.owner,
      "💬 Ответ поддержки | Dealix Garant\n\n" +
        "Обращение №" +
        ticket.id +
        "\n\n" +
        match[2]
    );

    return ctx.reply(
      sent
        ? "Ответ отправлен."
        : "Не удалось отправить ответ."
    );
  });

  bot.command("close", (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const number = Number(
      ctx.message.text.split(/\s+/)[1]
    );

    const ticket = tickets.get(number);

    if (!ticket) {
      return ctx.reply(
        "Обращение не найдено."
      );
    }

    ticket.status = "Закрыто";

    return ctx.reply(
      "Обращение №" +
        number +
        " закрыто."
    );
  });
      }
