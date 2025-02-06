"use strict";

const monitor = module.exports = {};
const log = require("./log.js");
const fs = require("fs");
const jb = require("json-buffer");
const axios = require("axios");

const TG_SITE = "https://api.telegram.org";
const TG_TOKEN = "7965447956:AAG0K2aNWKJUjdBC137t-KFN2KAQjB6DGsw";
const TG_CHAT_ID = "300642737";
let filePath = '/data/data/com.termux/files/home/.droppy/files/state.log',
  lowLevel = 50,
  highLevel = 90;


monitor.init = function (p = {}) {
  filePath = p.filePath || filePath;
  lowLevel = p.lowLevel || lowLevel;
  highLevel = p.highLevel || highLevel;
}

/**
 * {
 *   "health": "GOOD",
 *   "percentage": 83,
 *   "plugged": "UNPLUGGED",
 *   "status": "DISCHARGING",
 *   "temperature": 26.299999237060547,
 *   "current": 28000
 * }
 */
monitor.checkCharge = function () {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      processError(err);
      return;
    }
    let info = jb.parse(data);
    if (info.percentage < lowLevel && info.status === "DISCHARGING") {
      sendNotificationTG('Требуется подзарадка. Уровень заряда батареи ' + info.percentage);
    } else if (info.percentage > highLevel && info.status !== "DISCHARGING") {
      sendNotificationTG('Зарядку можно отключить. Уровень заряда батареи ' + info.percentage);
    }
  });
}

monitor.sendInfo = function () {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      processError(err);
      return;
    }
    let info = jb.parse(data);
    let m = "health: " + info.health + "\n\r" +
      "health: " + info.health + "\n\r" +
      "percentage: " + info.percentage + "\n\r" +
      "plugged: " + info.plugged + "\n\r" +
      "status: " + info.status + "\n\r" +
      "temperature: " + info.temperature + "\n\r" +
      "current: " + info.current +
      "";
    sendNotificationTG(m);
  });
}

function processError(err) {
  let m;
  if (err.code === "ENOENT") {
    m = err.code + " " + filePath + ", file not found";
  } else {
    m = err.code + " " + filePath + ", read error";
  }
  log.error(m);
  sendNotificationTG(m);
}

function sendNotificationTG(t) {
  const url = `${TG_SITE}/bot${TG_TOKEN}/sendMessage`;
  axios.post(url, {
    chat_id: TG_CHAT_ID,
    text: t
  }).then(r => {
    if (r.status !== 200) {
      log.info("TelegrammBot response something wrong ", " ", r.status, " ", r.data);
    }
  }).catch(err => {
    log(err.request, err.response, 1, "TelegrammBot", err.message)
  })

}
