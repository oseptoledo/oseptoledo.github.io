// Canonical host, case and trailing slash for the OSEP website.
// CloudFront Functions, runtime cloudfront-js-2.0, viewer-request event, attached
// to the distribution's DEFAULT behavior only (never /api/*: a 301 would turn
// the contact form's POST into a GET).
//
// lib/website-stack.ts reads this file at synth time and replaces the
// placeholder string on the CANONICAL_HOST line with config.primaryDomain
// (www.oseptoledo.org). The runtime is not Node: ES5 style, var, no lookbehind.
// Size limit 10 KB; test/canonical-host.test.ts runs this exact file.
//
// Every redirect the edge issues happens here, in ONE hop, so a request never
// chains two 301s:
//   1. Normalize the path. Document paths only: not under /assets/, and the
//      last segment has no dot. Those are lowercased and lose EVERY trailing
//      slash (a loop, so /ES/// lands on /es, not on /es//, then /es/, ...).
//      '/' stays '/'. Everything else passes untouched, because S3 keys are
//      case-sensitive: Vite's hashed /assets/ files, /images/*.webp,
//      /404.html, /sitemap.xml, /llms.txt and friends must reach the bucket
//      exactly as asked, or a lowercased request would 404 into an HTML page
//      served under a script's URL.
//   2. If Host is not exactly the canonical host (the apex, the
//      *.cloudfront.net name, a missing Host), 301 to
//      https://<canonical host> + normalized path + query.
//   3. Else, if normalizing changed the path, 301 to the normalized path.
//   4. Else pass the request through.
// src/paths.ts normalizePath() is the browser-side mirror of rule 1, and the
// tests hold the two together.
//
// The query string is rebuilt from CloudFront's parsed form WITHOUT
// encodeURIComponent: CloudFront hands over values still percent-encoded, so
// re-encoding would double-encode ('+' would become %2B and change campaign
// tags). Keys and values survive byte for byte; repeated keys come out grouped
// (?a=1&b=2&a=3 becomes ?a=1&a=3&b=2) and a bare ?flag becomes ?flag=. Nothing
// on this site reads either distinction.
//
// The 301 carries Strict-Transport-Security itself (same value as the
// response headers policy in website-stack.ts) so the apex's redirect, the
// response HSTS preload checks, has the header whether or not CloudFront
// applies the policy to function-generated responses.

var CANONICAL_HOST = '__CANONICAL_HOST__';
var HSTS = 'max-age=63072000; includeSubDomains; preload';

function normalizePath(uri) {
  var lastSegment = uri.slice(uri.lastIndexOf('/') + 1);
  if (uri.indexOf('/assets/') === 0 || lastSegment.indexOf('.') !== -1) {
    return uri;
  }
  var path = uri.toLowerCase();
  while (path.length > 1 && path.charAt(path.length - 1) === '/') {
    path = path.slice(0, path.length - 1);
  }
  return path;
}

function rebuildQuery(querystring) {
  var parts = [];
  for (var key in querystring) {
    var entry = querystring[key];
    if (entry && entry.multiValue && entry.multiValue.length) {
      for (var i = 0; i < entry.multiValue.length; i++) {
        parts.push(key + '=' + entry.multiValue[i].value);
      }
    } else if (entry && typeof entry.value !== 'undefined') {
      parts.push(key + '=' + entry.value);
    }
  }
  return parts.length ? '?' + parts.join('&') : '';
}

function handler(event) {
  var request = event.request;
  var hostHeader = request.headers.host;
  var host = hostHeader && hostHeader.value ? hostHeader.value.toLowerCase() : '';
  var path = normalizePath(request.uri);

  if (host === CANONICAL_HOST && path === request.uri) {
    return request;
  }

  return {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: {
      location: { value: 'https://' + CANONICAL_HOST + path + rebuildQuery(request.querystring) },
      'strict-transport-security': { value: HSTS }
    }
  };
}
