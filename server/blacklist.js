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

const url = 'https://api.abuseipdb.com/api/v2';
// const url = 'http://localhost:3000';
let apiKey;

bl.load = function (abuseipdbKey, callback) {
  apiKey = abuseipdbKey;
  console.log(abuseipdbKey);
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

      bl.parse(err => {
        if (err) return callback(err);

        const diffInDays = Math.round((Date.now() - Date.parse(blacklist.meta.generatedAt)) / (1000 * 60 * 60 * 24));
        if (diffInDays > 1) {
          log.info(`Blacklist is more then ${diffInDays} day(s) old. Try to get new one`);
          updateBlacklist().then(() => {
            write();
            callback();
          }).catch((err) => {
            callback(err);
          });
        } else {
          log.info(`Actual blacklist generated at ${blacklist.meta.generatedAt}`);
          callback();
        }
      });
    }
  });
};

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

  if (ipcheck.isPrivate(ip) || whiteIPs.includes(ip)) return false;
  if (blackIPs.includes(ip)) return true;

  if (blacklist.data) {
    for (let entry of blacklist.data.entries()) {
      if (entry[1]["ipAddress"] === ip) {
        log.info(`IP [${ip}] is blocked`);
        blackIPs.push(ip);
        return true;
      }
    }
  }

  const check = await checkIP(ip);
  if (!check) {
    log.info(`IP [${ip}] is blocked`);
    blackIPs.push(ip);
  } else {
    whiteIPs.push(ip);
  }
  return false;
};

async function checkIP(ip) {
  try {
    const response = await axios.get(url + "/check", {
      params: {
        ipAddress: ip,
        maxAgeInDays: 30
      },
      headers: {
        'Key': apiKey,
        'Accept': 'application/json'
      }
    });
    if (response.data) {
      if (response.data.isWhitelisted === 'true') return true;
      if (response.data.abuseConfidenceScore && response.data.abuseConfidenceScore > 90) return false;
    }
  } catch (error) {
    log.error(error);
  }
  log.info(`IP [${ip}] is unable to check`);
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

// TODO: async
function write() {
  watching = false;
  fs.writeFileSync(blFile, JSON.stringify(blacklist));
  // watch the file 1 second after last write
  setTimeout(() => {
    watching = true;
  }, 1000);
}
