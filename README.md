# MONOZ
> Monitor the client-side experience of your web application!

## How To Use

1. Clone.
2. `npm install`
3. `cp config.json.example config.json` and edit config.json.
4. Run with `./monoz`!

## TODO

* Make it EASILY installable and updatable!
* Datadog Improvements
  - ~~Config property ddTags assigend as tags to metrics submitted to Datadog~~
  - Config property ddTags from template/probe merged, probe config should not completely override template (verify)
  - Support for expectString on probe, for basic output verification
  - ~~Change probes from array to dictionary?~~
  - probe name vs endpoint tag in Datadog - not intuitive
  - ~~Include probe type as a tag?~~
  - Have all report to the same metric? (or default + per-test configurable)
  - Report Remote Server IP address
* HTTP Stubbornness
  - See mail from Tolli to Krummi Fri Nov 7th
* VX Multi CDN
  - ~~Support for host-replacement in Segment URLs (single or array, in which case we try all)~~
  - Stubbornness as well? (lo-pri)
* VX Multi Playlist server instance checkin
  - ~~Support for host-replacement in (master and media) playlist URLs (single or array, in which case we try all)~~
