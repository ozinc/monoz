var Promise = require('bluebird');
var request = Promise.promisifyAll(require('request'));
var S = require('string');
var datadog = require('../datadog');
var URI = require('uri-js');
var _ = require('lodash');

function sendMetric(props, step, delta) {
  if (props.datadogApiKey) {
    var arrTags = [];
    var tags = {
      'probe:': props.name,
      'channel': props.channel,
      'step': step,
      'probetype': 'vx',
      'endpoint': props.name,
      'source': props.sourceName
    }
    _.forEach(_.extend({}, props.ddTags, tags), function (val, key) { arrTags.push(key+':'+val); });
    var metric = {
      'metric': 'monoz.vx',
      'points': [
        [ parseInt(new Date().getTime() / 1000), delta] // FIXME don't we have to use the "start of test run" for this, in case of things hanging?
      ],
      'type': 'gauge',
      'host': 'oz.com',
      'tags': arrTags
    };
  }
  datadog.queue(metric);
}

function vx(props, callback) {
  return function(callback) {
    if (!props.user || !props.pass) {
      return callback(new Error('You need to provide user/pass for token generation.'));
    } else if (!props.channel) {
      return callback(new Error('You need to provide the channel to play from.'));
    } else if (!props.offering) {
      return callback(new Error('You need to provide the offering for the channel to be played.'));
    }

    console.log();
    console.log('  running the vx pipeline for '+ props.name);

    // (1) Fetches the token.
    var masterPlaylistUrl;
    var mediaPlaylistUrl;
    var segmentUrl;

    var options = {
      url: 'https://api.oz.com/v1/offering/oz/' + props.offering + '/token',
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
      console.log('  - fetched token in ' + diff + ' ms  (url: ' + options.url + ')');
      sendMetric(props, 'token', diff);
      masterPlaylistUrl = body.url;
//      console.log('    BODY' + JSON.stringify(body));
      if (props.channel != body.asset) {
        return callback(new Error('The token provided grants access to channel '+ body.asset +', not the configured channel '+ props.channel +'.'));
      }
      return masterPlaylistUrl;
    })
    .catch(function (err) {
      console.log('err!!!!');
      return callback(new Error('Failed when fetching token!'));
    })
    .then(function (masterPlaylist) {
//      console.log(' Fetching master Playlist using '+ masterPlaylist);
      before = new Date();
      return request.getAsync(masterPlaylistUrl);
    })
    // Fetch master playlist
    .spread(function (res, body) {
      var diff = new Date() - before;
      console.log('  - fetched master playlist in ' + diff + ' ms  (url: ' + masterPlaylistUrl + ')');
      sendMetric(props, 'master playlist', diff);
      var lines = body.split('\n');
      var mediaPlaylists = [];
      for (var i = 0; i < lines.length; i++) {
        if (S(lines[i]).startsWith('http')) {
          mediaPlaylists.push(lines[i]);
        }
      }

      mediaPlaylistUrl = mediaPlaylists[0];
      before = new Date();
      return request.getAsync(mediaPlaylistUrl);
    })
    // Fetch media playlist
    .spread(function (res, body) {
      var diff = new Date() - before;
      console.log('  - fetched media playlist in ' + diff + ' ms   (url: ' + mediaPlaylistUrl + ')');
      sendMetric(props, 'media playlist', diff);
      var lines = body.split('\n');

      segmentUrl = lines.slice(-2, -1)[0];

      // Use a different host for special test cases
      if (props.vxSegment) {
        var segmentUrlObj = URI.parse(segmentUrl);
        segmentUrlObj.host = props.vxSegment;
        segmentUrl = URI.serialize(segmentUrlObj);
      }

      before = new Date();
      return request.getAsync(segmentUrl);
    })
    // Fetch video segment from the URL in the Playlist
    .spread(function (res, body) {
      var diff = new Date() - before;
      console.log('  - fetched video segment in ' + diff + ' ms  (url: ' + segmentUrl + ')');
      sendMetric(props, 'video segment', diff);
    })
    .finally(function () {
      return callback();
    })

  }
}

module.exports = vx;
