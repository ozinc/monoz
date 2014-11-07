var Promise = require('bluebird');
var request = Promise.promisifyAll(require('request'));
var S = require('string');

function vx(props, callback) {
  return function(callback) {
    if (!props.user || !props.pass) {
      return callback(new Error('You need to provide user/pass for token generation.'));
    }

    console.log();
    console.log('  running the vx pipeline');

    // (1) Fetches the token.
    var masterPlaylistUrl;
    var mediaPlaylistUrl;
    var segmentUrl;

    var options = {
      url: 'http://cdn.oz.com/channel/oz/ruv/token',
      auth: { user: props.user, pass: props.pass },
      json: true
    };
    var before = new Date();
    request.getAsync(options)
    .spread(function (res, body) {
      var diff = new Date() - before;
      console.log('  - fetched token in ' + diff + ' ms.');
      masterPlaylistUrl = body.url;
      return masterPlaylistUrl;
    })
    .catch(function (err) {
      console.log('err!!!!');
      return callback(new Error('Failed when fetching token!'));
    })
    .then(function (masterPlaylist) {
      before = new Date();
      return request.getAsync(masterPlaylistUrl);
    })
    .spread(function (res, body) {
      var diff = new Date() - before;
      console.log('  - fetched master playlist in ' + diff + ' ms  (url: ' + masterPlaylistUrl + ')');
      var lines = body.split('\n');
      var mediaPlaylists = [];
      for (var i = 0; i < lines.length; i++) {
        if (S(lines[i]).startsWith('http://cdn.oz.com/channel/')) {
          mediaPlaylists.push(lines[i]);
        }
      }

      mediaPlaylistUrl = mediaPlaylists[0];
      before = new Date();
      return request.getAsync(mediaPlaylistUrl);
    })
    .spread(function (res, body) {
      var diff = new Date() - before;
      console.log('  - fetched media playlist in ' + diff + ' ms   (url: ' + mediaPlaylistUrl + ')');
      var lines = body.split('\n');

      segmentUrl = lines.slice(-2, -1)[0];
      before = new Date();
      return request.getAsync(segmentUrl);
    })
    .spread(function (res, body) {
      var diff = new Date() - before;
      console.log('  - fetched video segment in ' + diff + ' ms  (url: ' + segmentUrl + ')');
    });

  }
}

module.exports = vx;
