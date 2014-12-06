var Promise = require('bluebird');
var request = Promise.promisifyAll(require('request'));
var S = require('string');
var datadog = require('../datadog');
var urlutil = require('url');
var _ = require('lodash');
var monozUtils = require('../utils');

function queueMetric(props, step, delta, statusCode, extraTags) {
  if (props.datadogApiKey) {
    var tags = {
      status: statusCode,
      statusGroup: Math.floor(statusCode / 100) + 'xx',
      is200: statusCode === 200,
      probe: props.name,
      channel: props.channel,
      step: step,
      probetype: 'vx',
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
      metric: 'monoz.vx',
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

function vx(props, callback) {
  return function(callback) {
    console.log();
    console.log('  running the vx pipeline for '+ props.name);

    if (!props.user || !props.pass) {
      return callback(new Error('You need to provide user/pass for token generation.'));
    } else if (!props.channel) {
      return callback(new Error('You need to provide the channel to play from.'));
    } else if (!props.tokenUrl && !props.offering) {
      return callback(new Error('You need to provide the offering for the channel to be played.'));
    }

    // (1) Fetches the token.
    var masterPlaylistUrl;
    var mediaPlaylistUrl;
    var segmentUrl;
    var org = props.org || 'oz';
    var keyCount = 0;
    var segmentCount = 0;
    var maxKeys = props.maxKeys || 3;

    var options = {
      url: props.tokenUrl ? props.tokenUrl + props.channel : 'https://api.oz.com/v1/offering/' + org + '/' + props.offering + '/token',
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
      console.log('  - fetched token in ' + diff + ' ms  ('+ res.statusCode +' url: ' + options.url + ')');
      queueMetric(props, 'token', diff, res.statusCode);

      if (res.statusCode !== 200) {
        return callback(new Error('Probe '+ props.name +' failed when fetching token (http status code '+ res.statusCode +')'));
      }

      masterPlaylistUrl = body;
      if (props.tokenUrl === undefined) {
            masterPlaylistUrl = body.url;
      //      console.log('    BODY' + JSON.stringify(body));
            // Use a different host for special test cases
            if (props.channel !== body.asset) {
              console.log(body);
              return callback(new Error('The token provided grants access to channel '+ body.asset +', not the configured channel '+ props.channel +'.'));
            }
      }
      masterPlaylistUrl = monozUtils.replaceHost(masterPlaylistUrl, props.vxPlaylist);
      return masterPlaylistUrl;
    })
    .catch(function (err) {
      console.log('err!!!!');
      return callback(new Error('Failed when fetching token!'));
    })
    .then(function () {
//      console.log(' Fetching master Playlist using '+ masterPlaylist);
      before = new Date();
      return request.getAsync(masterPlaylistUrl);
    })
    // Fetch master playlist
    .spread(function (res, body) {
      var diff = new Date() - before;
      console.log('  - fetched master playlist in ' + diff + ' ms  ('+ res.statusCode +' url: ' + masterPlaylistUrl + ')');
      queueMetric(props, 'master playlist', diff, res.statusCode);

      if (res.statusCode !== 200) {
        return callback(new Error('Probe '+ props.name +' failed when fetching master playlist (http status code '+ res.statusCode +')'));
      }

      var lines = body.split('\n');
      var mediaPlaylists = [];
      for (var i = 0; i < lines.length; i++) {
        if (S(lines[i]).startsWith('http')) {
          mediaPlaylists.push(lines[i]);
        }
      }

      mediaPlaylistUrl = mediaPlaylists[0];
      mediaPlaylistUrl = replaceHost(mediaPlaylistUrl, props.vxPlaylist);
      before = new Date();
      return request.getAsync(mediaPlaylistUrl);
    })
    // Fetch media playlist
    .spread(function (res, body) {
      var diff = new Date() - before;
      console.log('  - fetched media playlist in ' + diff + ' ms   ('+ res.statusCode +' url: ' + mediaPlaylistUrl + ')');
      queueMetric(props, 'media playlist', diff, res.statusCode);

      if (res.statusCode !== 200) {
        return callback(new Error('Probe '+ props.name +' failed when fetching master playlist (http status code '+ res.statusCode +')'));
      }

      var segmentUrls = [];
      var keyUrls = [];
      var n = 0;

      // Process the response
      var lines = body.split('\n');
      _.forEach(lines, function (line) {
        // Keys
        if (S(line).startsWith('#EXT-X-KEY:')) {
          keyUrl = line.split(',')[1].substr(5);
          keyUrl = keyUrl.substr(0, keyUrl.length-1);
//          keyUrl = replaceHost(keyUrl, props.vxPlaylist);
//          console.log('Pushing key '+ keyUrl);
          keyUrls.push({ index: ++keyCount, url: keyUrl });
        }
        // Segments
        else if (S(line).startsWith('http')) {
          segmentUrls.push(line);
        }
      });
      segmentCount = segmentUrls.length;
      segmentUrl = segmentUrls.slice(-1)[0];
      keyUrls = keyUrls.slice(0-maxKeys);
      return keyUrls;
    })
    .each(function (key) {
      before = new Date();
      return request.getAsync(key.url)
      .spread(function (res, body) {
        var diff = new Date() - before;
        console.log('  - fetched key ' + key.index + '/'+ keyCount +' in ' + diff + ' ms  ('+ res.statusCode +' '+ res.headers['content-length'] +' bytes url: ' +  key.url + ')');
        queueMetric(props, 'key', diff, res.statusCode, { "keynum": key.index, "keycount": keyCount, "keyvalid": (res.statusCode === 200 && res.headers['content-length'] === 16) });
        return diff;
      });
    })
    .spread(function (keyResults) {
      before = new Date();
      return request.getAsync(segmentUrl);
    })
    // Fetch video segment from the URL in the Playlist
    .spread(function (res, body) {
      var diff = new Date() - before;
      console.log('  - fetched last video segment in ' + diff + ' ms  ('+ res.statusCode +' url: ' + segmentUrl + ')');
      queueMetric(props, 'video segment', diff, res.statusCode, { "segmentcount": segmentCount });
    })
    .finally(function () {
      return callback();
    })

  }
}

module.exports = vx;
