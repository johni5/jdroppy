"use strict";

const monitor = module.exports = {};
const log = require("./log.js");
const jb = require("json-buffer");
const axios = require("axios");
const {exec} = require("node:child_process");

const TG_SITE = "https://api.telegram.org";
let lowLevel, highLevel, tgToken, tgChatId;
//const termuxProcess = spawn("/data/data/com.termux/files/home/battery-monitor.sh");

monitor.init = function (_tgToken, _tgChatId, _lowLevel = 30, _highLevel = 90) {
  tgToken = _tgToken;
  tgChatId = _tgChatId;
  lowLevel = _lowLevel;
  highLevel = _highLevel;
  sendNotificationTG(`Battery monitor started. Low level = ${lowLevel}, high level = ${highLevel}`);
};

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
  readState(info => {
    if (info.capacity < lowLevel && info.status === "Discharging") {
      sendNotificationTG('Требуется подзарадка. Уровень заряда батареи ' + info.capacity);
    } else if (info.capacity > highLevel && info.status !== "Discharging") {
      sendNotificationTG('Зарядку можно отключить. Уровень заряда батареи ' + info.capacity);
    }
  });
};

monitor.sendInfo = function () {
  readState(info => {
    let m = `status=${info.status}, capacity=${info.capacity}`;
    sendNotificationTG(m);
  });
};

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

function readState(cb) {
  exec('"/data/data/com.termux/files/home/battery-monitor.sh"', (error, stdout, stderr) => {
    log.debug('error=', error, 'stdout=', stdout, 'stderr=', stderr);
    if (error) {
      processError(error.message);
      return;
    }
    if (stderr) {
      processError(stderr);
      return;
    }
    if (stdout) {
      log.debug('termux-battery-status', '->', stdout);
      cb(jb.parse(stdout.trim()));
    }
  });
}
