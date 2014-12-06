var Promise = require('bluebird');
var request = Promise.promisifyAll(require('request'));
var S = require('string');
var datadog = require('../datadog');
var urlutil = require('url');
var _ = require('lodash');
var util = require('util');

function queueMetric(props, delta, statusCode, extraTags) {
  if (props.datadogApiKey) {
    var tags = {
      status: statusCode,
      statusGroup: Math.floor(statusCode / 100) + 'xx',
      is200: statusCode === 200,
      probe: props.name,
      channel: props.channel,
      probetype: 'channelmedia',
      endpoint: props.name,
      source: props.sourceName
    };
    var arrTags = _.map(_.extend({}, props.ddTags, tags), function (val, key) {
      return key + ':' + val;
    });
    var arrTags = _.map(_.extend({}, extraTags, tags), function (val, key) {
      return key + ':' + val;
    });
    var metric = {
      metric: 'monoz.response_time',
      points: [
        // FIXME don't we have to use the "start of test run" for this, in case of things hanging?
        [ parseInt(new Date().getTime() / 1000), delta]
      ],
      type: 'gauge',
      host: 'oz.com',
      tags: arrTags
    };
  }
  datadog.queue(metric);
}

function channelmedia(props, callback) {
  return function(callback) {
    console.log();
    console.log('  running the channelmedia tests '+ props.name);

    if (!props.user || !props.pass) {
      return callback(new Error('You need to provide user/pass for token generation.'));
    } else if (!props.channel) {
      return callback(new Error('You need to provide the channel to test media for.'));
    } else if (!props.url) {
      return callback(new Error('You need to provide the URL for the API endpoint.'));
    }

    var options = {
      url: props.url,
      auth: { user: props.user, pass: props.pass },
      headers: props.headers,
      json: true
    };
    var before = new Date();
//    console.log(' Fetching token using '+ JSON.stringify(options));
    request.getAsync(options)
    // Fetch token
    .spread(function (res, body) {
      var diff = new Date() - before;

      // Just informational, we don't log these results for the probe
      console.log('  - fetched channel in %d ms (%d url: %s)', diff, res.statusCode, options.url);

      if (res.statusCode !== 200) {
        var errMessage = util.format(
          'Probe %s failed when channel from API (statusCode %d)', props.name, res.statusCode);
        return callback(new Error(errMessage));
      }
      var mediaUrls = [];
      var n = 0;

      // Extra assets: Channel still images, both the redirect and asset after redirect
      // (for proper problem pinpointing)
      if (props.stills) {
        mediaUrls.push({
          type: 'still_redirect',
          url: 'http://playlist.oz.com/still/' + props.channel,
          expectedHttpResponse: 301,
          options: { followRedirect: false }
        });
        mediaUrls.push({
          type: 'still_image',
          url: 'http://playlist.oz.com/still/' + props.channel
        });
      }

      // Extract the media URLs from response.
      _.forEach(body.media, function (val, key) {
        mediaUrls.push({ type: key, url: val });
      });
      return mediaUrls;
    })
    .each(function (media) {
      before = new Date();
      return request.getAsync(_.extend({ url: media.url }, media.options))
      .spread(function (res, body) {
        var diff = new Date() - before;
        console.log(util.format('  - fetched type %s in %d ms (status=%d, bytes=%d, url=%s)',
          media.type, diff, res.statusCode, res.headers['content-length'], media.url));
        queueMetric(props, diff, res.statusCode, {
          mediatype: media.type,
          response_as_expected: (res.statusCode === (media.expectedHttpResponse || 200))
        });
        return diff;
      });
    })
    .finally(function () {
      return callback();
    })

  }
}

module.exports = channelmedia;
