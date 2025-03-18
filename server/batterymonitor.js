"use strict";

const monitor = module.exports = {};
const log = require("./log.js");
const jb = require("json-buffer");
const axios = require("axios");
const {exec} = require("node:child_process");
const util = require("util");
const execPromise = util.promisify(exec);
const TelegramBot = require("node-telegram-bot-api");

const TG_SITE = "https://api.telegram.org";
const TIME_BETWEEN_NOTIFICATIONS_MINUTES = 10;
let lowLevel, highLevel, tgToken, tgChatId, lastNotificationDate;
let bot;

const toText = function (val) {
  if (val && val !== '') {
    return val.trim();
  }
  return 'NAN';
};

const toInt = function (val) {
  if (val && val !== '') {
    try {
      return parseInt(val);
    } catch (e) {
    }
  }
  return 0;
};

const toFloat = function (val) {
  if (val && val !== '') {
    try {
      return parseFloat(val) / 1000000;
    } catch (e) {
    }
  }
  return 0.0;
};

monitor.init = function (_tgToken, _tgChatId, _lowLevel = 30, _highLevel = 90) {
  tgToken = _tgToken;
  tgChatId = _tgChatId;
  lowLevel = _lowLevel;
  highLevel = _highLevel;
  bot = new TelegramBot(tgToken, {polling: true});
  bot.onText(/state/i, (msg) => {
    const chatId = msg.chat.id;
    readState().then(info => {
      bot.sendMessage(chatId, stateMsg(info), {parse_mode: "Markdown"});
    }).catch(error => {
      bot.sendMessage(chatId, error.message, {parse_mode: "Markdown"});
    });
  });
  sendNotificationTG(`Запуск мониторинга.\nLow level = ${lowLevel}\nHigh level = ${highLevel}`);
};

monitor.checkCharge = function () {
  readState().then(info => {
    const now = new Date();
    if (!lastNotificationDate || (now - lastNotificationDate) > TIME_BETWEEN_NOTIFICATIONS_MINUTES * 60 * 1000) {
      if (info.capacity < lowLevel && info.status === "Discharging") {
        sendNotificationTG('Требуется подзарадка. Уровень заряда батареи ' + info.capacity);
        lastNotificationDate = now;
      } else if (info.capacity > highLevel && info.status === "Charging") {
        sendNotificationTG('Зарядку можно отключить. Уровень заряда батареи ' + info.capacity);
        lastNotificationDate = now;
      } else {
        lastNotificationDate = null;
      }
    }
  }).catch(error => {
    processError(error.message);
  });
};

monitor.sendInfo = function () {
  readState().then(info => {
    sendNotificationTG(stateMsg(info));
  }).catch(error => {
    processError(error.message);
  });
};

function stateMsg(info) {
  return `Состояние батареи:\nНапряжение=${info.voltage_V}В\nТок=${info.current_mA}мА\n` +
    `Уровень заряда=${info.capacity}%\nТемпература=${info.temp_G}°\nСостояние=${info.status}`;
}

function processError(err) {
  let m = `Read battery status error: ${err}`;
  log.error(m);
  sendNotificationTG(m);
}

function sendNotificationTG(t) {
  const url = `${TG_SITE}/bot${tgToken}/sendMessage`;
  axios.post(url, {
    chat_id: tgChatId,
    text: t
  }).then(r => {
    if (r.status !== 200) {
      log.info("TelegrammBot response something wrong ", " ", r.status, " ", r.data);
    }
  }).catch(err => {
    log(err.request, err.response, 1, "TelegrammBot", err.message)
  })

}

async function readState() {
  let p = {};
  p.status = await cat('status', toText);
  p.capacity = await cat('capacity', toInt);
  p.current_mA = await cat('current_now', toFloat) * 1000.0;
  p.temp_G = await cat('temp', toInt) * 1.0 / 10;
  p.voltage_V = await cat('voltage_now', toFloat);
  return p;
}

async function cat(val, format) {
  try {
    const {stdout, stderr} = await execPromise(`cat /sys/class/power_supply/battery/${val}`);
    if (stderr) {
      log.error('Read ${val} ERROR:', ' ', stderr);
      return format('');
    }
    log.debug(`Read '${val}':${stdout}`);
    return format(stdout);
  } catch (error) {
    log.error(`Read '${val}' ERROR:`, ' ', error.message);
    return format('');
  }
}
