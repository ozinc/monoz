var request = require('request');
var util = require('util');
var S = require('string');

function http(props, callback) {
  return function(callback) {
    if (!props.url) {
      return callback(new Error('You need to provide a URL.'));
    }
    var url = props.url;
    var options = {
      url: url,
      headers: props.headers,
      body: props.body,
      method: props.method || 'GET',
      timeout: props.timeout || 30000,
    };
    var before = new Date();
    request(options, function (err, res, body) {
      if (err) {
        console.log(util.format('  ERR   %s   -- ms', S(url).padRight(60)));
        return callback(err);
      }

      var diff = new Date() - before;

      // stdout!

      console.log(util.format('  %s   %s   %s ms', S(url).padRight(60), res.statusCode, diff));

      // DataDog!

      // Queue the metric for delivery to DataDog (if a DataDog API key was provided).
      if (options.datadogApiKey) {
        var metric = {
          'metric': 'monoz.response_time',
          'points': [
            [ parseInt(new Date().getTime() / 1000), diff]
          ],
          'type': 'gauge',
          'host': 'oz.com',
          'tags': ['status:' + res.statusCode, 'endpoint:' + endpoint, 'source:' + sourceName]
        };
        datadog.queue(metric);
      }

      // TODO: Do some checking of the body/res/whatever.

      return callback(null);
    });
  }
}

module.exports = http;
