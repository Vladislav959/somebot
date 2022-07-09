const { MTProto, getSRPParams } = require('@mtproto/core');
const { session, Telegraf, Scenes } = require("telegraf");
const { Api, TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

const { Keyboard,Key } = require("telegram-keyboard");
const apiId = 19988285;
const apiHash = "86c7f3155fbdd165af8d92332475bfc8";
// fill this later with the value from session.save()

var mysql = require("mysql");
const res = require("express/lib/response");
var connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "00000000",
  database: "newdb",
});

connection.connect();
const backKeyboard = Keyboard.make([
  Key.callback('Назад', 'back'),
]).inline()
const initError =async (error,ctx)=>{
  await ctx.reply(`Ошибка: ${error.message}`)
  await ctx.scene.leave()
  await ctx.reply("Сценарий был прерван по причину ошибки. Возвращаюсь в начало.")
  await ctx.reply("Привет! Выбери действие")
  
}
const goBack = async (ctx,accountName)=>{
  if(accountName){
    connection.query(
      `UPDATE Main SET is_active=FALSE WHERE name='${accountName}';`,
      function (error, results) {
        if (error) {
          return initError(error,ctx)
        }})
  }
  await ctx.deleteMessage()
  await ctx.scene.leave();
  await ctx.reply("Привет! Выбери действие")
}
const addAccountScene = new Scenes.WizardScene(
  "ADD_ACCOUNT_SCENE", // first argument is Scene_ID, same as for BaseScene
  (ctx) => {
    ctx.reply("Введите номер телефона по формату +7123456789",backKeyboard);
    ctx.wizard.state.data = {};
    return ctx.wizard.next();
  },
  async (ctx) => {
    if(!ctx.message) return goBack(ctx);
    ctx.wizard.state.data.phone = ctx.message.text;
    ctx.reply("Отправка кода подтверждения...");
    // This assumes you have already authenticated with .start()
    try {
      const stringSession = new StringSession("");
      const client = new TelegramClient(stringSession, apiId, apiHash, {});
      await client.connect();
      const result = await client.invoke(
        new Api.auth.SendCode({
          phoneNumber: ctx.wizard.state.data.phone,
          apiId,
          apiHash,
          settings: new Api.CodeSettings({
            allowFlashcall: true,
            currentNumber: true,
            allowAppHash: true,
          }),
        })
      );

      ctx.wizard.state.data.phoneCodeHash = result.phoneCodeHash;
      ctx.wizard.state.data.client = client;
    } catch (err) {
      return initError(err,ctx)
    }

    ctx.reply(
      "Введите код авторизации, который был вам отправлен различными способами",backKeyboard
    );
    return ctx.wizard.next();
  },
  (ctx) => {
    if(!ctx.message) return goBack(ctx);
    ctx.wizard.state.data.phoneCode = ctx.message.text;
    ctx.reply("Введите 2FA-пароль (Если имеется)",backKeyboard);
    return ctx.wizard.next();
  },
  (ctx) => {
    
    if(!ctx.message) return goBack(ctx);
    ctx.wizard.state.data.сode2FA = ctx.message.text;
    ctx.reply("Введите название аккаунта",backKeyboard);
    return ctx.wizard.next();
  },
  async (ctx) => {
      if(!ctx.message) return goBack(ctx);
    connection.query(
      `SELECT * FROM Main WHERE name LIKE '${ctx.message.text}' LIMIT 1`,
      async function (error, results) {
        if (error) return initError(error,ctx)
        if (results.length > 0) {
          ctx.reply("Такое имя уже существует.");
          return;
        }
        if(!ctx.message) return goBack(ctx);
        ctx.wizard.state.data.name = ctx.message.text;
    ctx.reply("Производится вход в аккаунт...");
    let sessionKey;
    try {
      await ctx.wizard.state.data.client.start({
        phoneNumber: async () => ctx.wizard.state.data.phone,
        phoneCode: async () => ctx.wizard.state.data.phoneCode,
        onError: (err) => {
          initError(err,ctx)
        },
      });
      sessionKey = ctx.wizard.state.data.client.session.save()
    } catch (err) {
      if(err.message.includes("SESSION_PASSWORD_NEEDED")){
        const auth2FA  = await client.invoke(
          new Api.account.GetPassword({})
        );
        const { srp_id, current_algo, srp_B } = auth2FA;
                        const { salt1, salt2, g, p } = current_algo;
                        const { A, M1 } = await getSRPParams({
                          g,
                          p,
                          salt1,
                          salt2,
                          gB: srp_B,
                          password: ctx.wizard.state.data.code2FA,
                      });
                      const result = await client.invoke(
                        new Api.auth.CheckPassword({
                          password: new Api.InputCheckPasswordSRP({
                            srpId: BigInt("-4156887774564"),
                            a: Buffer.from("arbitrary data here"),
                            m1: Buffer.from("arbitrary data here"),
                          }),
                        })
                      );
                      console.log(result)
      }
      else{
        
      return initError(err,ctx)
      }
    }
      
      connection.query(
        `INSERT into \`Main\` (session, name, invites_count, is_active)
      VALUES ('${ctx.wizard.state.data.client.session.save()}', '${
          ctx.wizard.state.data.name
        }', 0, FALSE)`,
        function (error, results) {
          if (error) {
            return initError(error,ctx)
          }
        }
      );
    
    ctx.reply("Аккаунт добавлен");
    ctx.scene.leave();
    ctx.reply("Привет! Выбери действие")
  
      }
    );}
    
);
const deleteAccountScene = new Scenes.WizardScene(
  "DELETE_ACCOUNT_SCENE", // first argument is Scene_ID, same as for BaseScene
  (ctx) => {
    ctx.reply("Введите имя аккаунта",backKeyboard);
    return ctx.wizard.next();
  },
  (ctx) => {
      if(!ctx.message) return goBack(ctx);
    connection.query(
      `SELECT * FROM Main WHERE name LIKE '${ctx.message.text}' LIMIT 1`,
      function (error, results) {
        if (error) {
          return initError(error,ctx)
        }
        if (results.length === 0) {
          ctx.reply("Такого аккаунта не существует.");
          return;
        } else {
          connection.query(
            `DELETE FROM Main WHERE name = '${ctx.message.text}';`,
            function (error, results) {
              if (error) {
                return initError(error,ctx)
              }
              ctx.reply("Аккаунт удалён");

              ctx.scene.leave();
              ctx.reply("Привет! Выбери действие")
            }
          );
        }
      }
    );
  }
);

const startProcessScene = new Scenes.WizardScene(
  "START_PROCESS_SCENE", // first argument is Scene_ID, same as for BaseScene
  (ctx) => {
    ctx.reply("Введите имя аккаунта",backKeyboard);

    ctx.wizard.state.data = {};
    return ctx.wizard.next();
  },
  (ctx) => {
      if(!ctx.message) return goBack(ctx);
    connection.query(
      `SELECT * FROM Main WHERE name LIKE '${ctx.message.text}' LIMIT 1`,
      function (error, results) {
        if (error) {
          initError(error,ctx)
        }
        if (results.length === 0) {
          ctx.reply("Такого аккаунта не существует.");
         return;
        } else {
          ctx.wizard.state.data.session = results[0].session;

          ctx.wizard.state.data.remaining = 50 - results[0].invites_count;
          ctx.reply(`У этого аккаунта осталось пользователей для добавления: ${ctx.wizard.state.data.remaining}`)
          connection.query(
            `UPDATE Main SET is_active=TRUE WHERE name='${ctx.message.text}';`,
            function (error, results) {
              if (error) {
                return initError(error,ctx)
              }

              if(!ctx.message) return goBack(ctx,ctx.message.text);
              ctx.wizard.state.data.name = ctx.message.text;
              ctx.reply(
                "Введите ссылку на чат, в который нужно добавить людей",backKeyboard
              );
              ctx.wizard.next();
            }
          );
        }
      }
    );
  },
  (ctx) => {
    if(!ctx.message) return goBack(ctx,ctx.wizard.state.data.name);
    ctx.wizard.state.data.channelTo = ctx.message.text;
    ctx.reply(
      `Введите ссылку на чат, из которого нужно взять имена людей (лимит - ${ctx.wizard.state.data.remaining} участников)`,backKeyboard
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if(!ctx.message) return goBack(ctx,ctx.wizard.state.data.name);
    ctx.reply("Добавляю участников...")
    ctx.wizard.state.data.channelFrom = ctx.message.text;

    const stringSession = new StringSession(ctx.wizard.state.data.session);
    const client = new TelegramClient(stringSession, apiId, apiHash, {});
    await client.connect();
    const hash = ctx.wizard.state.data.channelFrom.match(/t.me\/\+(.+)/)[1];
    let fromChat,fromChatId;
    try {
      fromChat = await client.invoke(
        new Api.messages.ImportChatInvite({
          hash,
        })
      );
      fromChatId = fromChat.chats[0].id.value
    } catch (err) {
      if (err.message.includes("USER_ALREADY_PARTICIPANT")) {
        fromChat = await client.invoke(
          new Api.messages.CheckChatInvite({
            hash,
          })
        );
        fromChatId = fromChat.chat.id.value
      } else {
        initError(err,ctx)
      }
    }
    try {
      console.log(fromChat)
      const members = await client.invoke(
        new Api.messages.GetFullChat({
          chatId: fromChatId,
        })
      );
      console.log(members)
      let idsToAdd = members.users.map(obj => obj.id.value)
      idsToAdd = idsToAdd.slice(0,ctx.wizard.state.data.remaining + 1);
      const hash =
        ctx.wizard.state.data.channelTo.match(/t.me\/\+(.+)/)[1];
        let toChat,toChatId;
      try {
      toChat = await client.invoke(
          new Api.messages.ImportChatInvite({
            hash,
          })
        );
      toChatId = toChat.chats[0].id.value
        
      } catch (err) {
        if (err.message.includes("USER_ALREADY_PARTICIPANT")) {
          toChat = await client.invoke(
            new Api.messages.CheckChatInvite({
              hash,
            })
          );
          toChatId = toChat.chat.id.value
        } else {
          initError(err,ctx)
        }
      }
      console.log(toChat)
      const membersTo = await client.invoke(
        new Api.messages.GetFullChat({
          chatId: toChatId,
        })
      );
      console.log(membersTo)
      const idsExisting = membersTo.users.map(obj => obj.id.value)

      const arrayToFindMatches = [idsToAdd,idsExisting]
      const matchingCount = arrayToFindMatches.reduce((p,c) => p.filter(e => c.includes(e))).length
      const addedCount = Math.max(0,idsToAdd.length - matchingCount)
      for(const uid of idsToAdd){
        try{
          await client.invoke(
            new Api.messages.AddChatUser({
              chatId: toChatId,
              userId: uid,
            })
          );
        } catch(err){
          if(err.message.includes("USER_ALREADY_PARTICIPANT")){
ctx.reply(`Пользователь #${uid} уже есть в группе.`)
          }
          else{

          
          ctx.reply(`При попытке добавления пользователя #${uid} произошла следующая ошибка: ${err.message}`)
        }}
      }
      console.log(ctx.message.text)
      connection.query(
        `UPDATE Main SET is_active=FALSE, invites_count=${50 - ctx.wizard.state.data.remaining + addedCount} WHERE name='${ctx.message.text}';`,
        function (error, results) {
          if(error) return initError(error,ctx)
          ctx.reply(`Было всего добавлено ${addedCount} пользователей.`)
          
          ctx.scene.leave();
          ctx.reply("Привет! Выбери действие")
        })
    } catch (err) {
      return initError(err,ctx)
    }
  }
);

const bot = new Telegraf("5490818544:AAEFVvmgJckDQP2jWf13lOJYkfrg8RprIAw");

const stage = new Scenes.Stage([
  addAccountScene,
  deleteAccountScene,
  startProcessScene,
]); // to  be precise, session is not a must have for Scenes to work, but it sure is lonely without one

bot.use(session());
bot.use(stage.middleware());
bot.start((ctx) =>
  ctx.reply(
    "Привет! Выбери действие",
    Keyboard.make([
      ["Добавить аккаунт"],
      ["Удалить аккаунт"],
      ["Начать процесс"], // Second row
    ]).reply()
  )
);
bot.hears("Добавить аккаунт", Scenes.Stage.enter("ADD_ACCOUNT_SCENE"));

bot.hears("Удалить аккаунт", Scenes.Stage.enter("DELETE_ACCOUNT_SCENE"));

bot.hears("Начать процесс", Scenes.Stage.enter("START_PROCESS_SCENE"));
bot.on("message", (ctx) => ctx.reply("Я ниче не понял"));
bot.launch();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
