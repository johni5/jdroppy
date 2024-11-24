"use strict";

const bl = module.exports = {};
const fs = require("fs");
const path = require("path");
var axios = require("axios");
const ipcheck = require('ip');

const log = require("./log.js");
const blFile = require("./paths.js").get().blcklist;
const defaults = {meta: {generatedAt: Date.now() - 10}, data: []};
let blacklist, watching, blackIPs = [], whiteIPs = [];

let url;
let apiKey;

bl.load = function (abuseipdbKey, abuseipdbUrl, callback) {
  apiKey = abuseipdbKey;
  url = abuseipdbUrl;
  fs.stat(blFile, err => {
    if (err) {
      if (err.code === "ENOENT") {
        updateBlacklist().then(() => {
          fs.mkdir(path.dirname(blFile), {recursive: true}, err => {
            if (err) return callback(err);
            write();
            callback();
          });
        }).catch((err) => {
          callback(err);
        });
      } else {
        callback(err);
      }
    } else {
      checkForActual(callback);
    }
  });
};

let lastCheck;

function calculateHoursFromDate(date) {
  return Math.floor((Date.now() - date) / (1000 * 60 * 60));
}

function checkForActual(callback) {

  if (!lastCheck || calculateHoursFromDate(lastCheck) > 12) {
    if (lastCheck) log.debug(`Last check hours: ${calculateHoursFromDate(lastCheck)}`);

    lastCheck = Date.now();
    whiteIPs = [];

    bl.parse(err => {
      if (err) return callback(err);

      const hh = calculateHoursFromDate(Date.parse(blacklist.meta.generatedAt));
      if (hh > 24) {
        log.info(`Blacklist is more then ${hh} hours old. Try to get new one`);
        updateBlacklist().then(() => {
          write();
          log.info(`Actual blacklist generated at ${blacklist.meta.generatedAt}`);
          callback();
        }).catch((err) => {
          callback(err);
        });
      } else {
        log.info(`Actual blacklist generated at ${blacklist.meta.generatedAt}`);
        callback();
      }
    });
  } else {
    callback();
  }

}


bl.parse = function (cb) {
  fs.readFile(blFile, "utf8", (err, data) => {
    if (err) return cb(err);

    if (data.trim() !== "") {
      try {
        blacklist = JSON.parse(data);
      } catch (err2) {
        return cb(err2);
      }
    } else {
      blacklist = {};
    }
    blacklist = Object.assign({}, defaults, blacklist);
    cb();
  });
};

bl.isBlack = async function (ip) {

  checkForActual(() => {});

  if (ipcheck.isPrivate(ip) || whiteIPs.includes(ip)) return false;
  if (blackIPs.includes(ip)) return true;

  if (blacklist.data) {
    for (let entry of blacklist.data.entries()) {
      if (entry[1]["ipAddress"] === ip) {
        log.info(`IP [${ip}] is blacklisted`);
        blackIPs.push(ip);
        return true;
      }
    }
  }

  const check = await checkIP(ip);
  if (!check) {
    log.info(`IP [${ip}] is blocked`);
    blackIPs.push(ip);
    return true;
  }

  log.info(`IP [${ip}] is whited`);
  whiteIPs.push(ip);
  return false;
};

async function checkIP(ip) {
  try {
    const response = await axios.get(url + "/check", {
      timeout: 5000,
      params: {
        ipAddress: ip,
        maxAgeInDays: 30
      },
      headers: {
        'Key': apiKey,
        'Accept': 'application/json'
      }
    });
    if (response.data && response.data.data) {
      const score = response.data.data.abuseConfidenceScore;
      log.info(`IP [${response.data.data.ipAddress}] has score ${score}`);
      if (score >= 80) return false;
    }
  } catch (error) {
    log.error(error);
  }
  return true;
}

async function updateBlacklist() {
  try {
    log.info("Get blacklist: ", url);
    const response = await axios.get(url + "/blacklist", {
      params: {
        confidenceMinimum: 50
      },
      headers: {
        'Key': apiKey,
        'Accept': 'application/json'
      }
    });
    if (response.data && response.data.meta) {
      blacklist = response.data
      return response;
    }
  } catch (error) {
    log.error(error);
    throw error;
  }
  throw new Error('No data available');
}

function write() {
  fs.writeFileSync(blFile, JSON.stringify(blacklist));
}
