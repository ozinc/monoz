/**
 * Changes the hostname if a replacement hostname is defined - otherwise returns the URI intact.
 */
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

/*
 * Exports.
 */
module.exports.replaceHost = replaceHost;
