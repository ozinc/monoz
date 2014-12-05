var Promise = require('bluebird');
var request = Promise.promisifyAll(require('request'));
var S = require('string');
var datadog = require('../datadog');
var urlutil = require('url');
var _ = require('lodash');

// Changes the hostname if a replacement host is defined - otherwise returns the uri intact
function replaceHost(url, newHost) {
  if (!url) {
    return url;
  }
  if (newHost) {
    var parsedUrl = urlutil.parse(url);
    parsedUrl.host = newHost;
    url = urlutil.format(parsedUrl);
  }
  return url;
}

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
        [ parseInt(new Date().getTime() / 1000), delta] // FIXME don't we have to use the "start of test run" for this, in case of things hanging?
      ],
      type: 'gauge',
      host: 'oz.com',
      tags: arrTags
    };
  }
//  console.log(metric);
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
      console.log('  - fetched channel in ' + diff + ' ms  ('+ res.statusCode +' url: ' + options.url + ')');

      if (res.statusCode !== 200) {
        return callback(new Error('Probe '+ props.name +' failed when channel from API (http status code '+ res.statusCode +')'));
      }
      var mediaUrls = [];
      var n = 0;

      // Extra assets: Channel still images, both the redirect and asset after redirect (for proper problem pinpointing)
      if (props.stils === true){
            mediaUrls.push({ type: 'still_redirect', url: 'http://playlist.oz.com/still/' + props.channel, expectedHttpResponse: 301, options: {followRedirect: false} });
            mediaUrls.push({ type: 'still_image', url: 'http://playlist.oz.com/still/' + props.channel });
      }

      // Extract URLs from
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
        console.log('  - fetched type ' + media.type +' in ' + diff + ' ms  ('+ res.statusCode +' '+ res.headers['content-length'] +' bytes url: ' +  media.url + ')');
        queueMetric(props, diff, res.statusCode, { "mediatype": media.type, "response_as_expected": (res.statusCode === (media.expectedHttpResponse || 200)) });
        return diff;
      });
    })
    .finally(function () {
      return callback();
    })

  }
}

module.exports = channelmedia;
