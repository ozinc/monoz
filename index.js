var request = require('request');
var async = require('async');
var config = require('./config');
var util = require('util');
var S = require('string');

var interval = (config.interval || 60) * 1000;
var endpoints = config.endpoints || [];

if (endpoints.length === 0) {
  console.log('ERR: You need to provide a non-zero list of endpoints in config.json');
  process.exit(-1);
}

function probe(endpoint, callback) {
  return function (callback) {
    var options = {
      url: endpoint,
      timeout: 30000 // Timeout of 30s.
    };
    var before = new Date();
    request.get(options, function (err, res, body) {
      if (err) {
        console.log('    err when probing: ' + endpoint);
        console.log(err);
        return callback(null);
      }
      var diff = new Date() - before;
      console.log(util.format('  %s   %s   %s ms', S(endpoint).padRight(60), res.statusCode, diff));
      return callback(null);
    });
  };
}

function runAll() {
  console.log('> probing endpoints');
  var fns = [];
  for (var i = 0; i < endpoints.length; i++) {
    fns.push(probe(endpoints[i]));
  }
  async.series(fns, function () {
    console.log();
  });
}

runAll();
setInterval(runAll, interval);
