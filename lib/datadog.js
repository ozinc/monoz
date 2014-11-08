'use strict';

var request = require('request');

var metricQueue = [];

/**
 * Queues metrics for delivery to DataDog. NOTE that the metrics will not be delivered
 * until you call the send() function!
 *
 * This is the format of metrics in the sendMetrics function:
   {
     metric: 'beer.temperature',
     points: [
       [ parseInt(new Date().getTime() / 1000), temperature]
     ],
     type: 'gauge',
     host: 'oz.com',
     tags: ['thermometer:0']
   }
 *
 */
function queue(metric) {
  metricQueue.push(metric);
}

/**
 * Delivers the metrics that have been queued to DataDog's API.
 */
function send(apiKey, callback) {
  if (metricQueue.length === 0) {
    // TODO: Return an error?
    return callback(null);
  }
  var options = {
    url: 'https://app.datadoghq.com/api/v1/series',
    qs: {
      api_key: apiKey
    },
    json: {
      series: metricQueue
    }
  };
  request.post(options, function (err, res, body) {

    // In any case we want to clear the queue now.
    metricQueue = [];

    if (err) {
      return callback(err);
    } else if (res.statusCode < 200 && res.statusCode >= 300) {
      return callback(new Error('Non-2xx response from DataDog API: ' + res.statusCode));
    }
    // Everything went fine!
    return callback(null);
  });
}

/*
 * Exports.
 */
module.exports.queue = queue;
module.exports.send = send;
