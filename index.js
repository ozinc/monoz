#!/usr/bin/env node

var request = require('request');
var async = require('async');
var config = require('./config');
var util = require('util');
var S = require('string');
var argv = require('optimist').argv;
var datadog = require('./datadog');

// Help?

if (argv.help || argv.h) {
  usage();
  process.exit(0);
}

// Configuration

var sourceName;
if (argv.s || argv.source) {
  sourceName = argv.s || argv.source;
}

var datadogApiKey = config.datadogApiKey;
var interval = (config.interval || 60) * 1000;
var endpoints = config.endpoints || [];

if (!datadogApiKey) {
  console.log('WARN: You did not provide a DataDog API key so not logging to DataDog.');
}

if (datadogApiKey && !sourceName) {
  console.log('ERR: To be able to send to DataDog you HAVE TO provide a source name, see help.');
  process.exit(-1);
}

if (endpoints.length === 0) {
  console.log('ERR: You need to provide a non-zero list of endpoints in config.json.');
  process.exit(-1);
}

// Helper functions

function usage() {
  console.log();
  console.log('  Usage: ./monos [options]');
  console.log()
  console.log('  Options:');
  console.log();
  console.log('    -h, --help     Shows this help.');
  console.log('    -s, --source   A name identifying this process as a source in DataDog.');
  console.log();
}

// Probes

function simple(endpoint, callback) {
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

      // Log to stdout.
      console.log(util.format('  %s   %s   %s ms', S(endpoint).padRight(60), res.statusCode, diff));

      // Queue the metric for delivery to DataDog  (if some DataDog API key was provided
      // in config.json).
      if (datadogApiKey) {
        var metric = {
          'metric': 'monos.response_time',
          'points': [
            [ parseInt(new Date().getTime() / 1000), diff]
          ],
          'type': 'gauge',
          'host': 'oz.com',
          'tags': ['status:' + res.statusCode, 'endpoint:' + endpoint, 'source:' + sourceName]
        };
        datadog.queue(metric);
      }

      return callback(null);
    });
  };
}

// Runs all of the probes.

function run() {
  console.log('> probing endpoints');
  var fns = [];
  for (var i = 0; i < endpoints.length; i++) {
    fns.push(simple(endpoints[i]));
  }
  async.series(fns, function (err) {
    if (err) {
      console.log('ERROR: test run failed!');
      console.log(err);
    }

    // Deliver the metrics to DataDog (if some DataDog API key was provided in config.json).
    if (datadogApiKey) {
      datadog.send(datadogApiKey, function (err) {
        if (err) {
          console.log('> failed to send stats to DataDog!');
          console.log(err);
        } else {
          console.log('> successfully delivered stats to DataDog.');
          console.log();
        }
      });
    } else {
      console.log();
    }
  });
}

// Run immediately and then regularly after interval ms.
run();
setInterval(run, interval);
