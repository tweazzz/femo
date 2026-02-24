
const https = require('https');

const options = {
  hostname: 'portal.femo.kz',
  path: '/api/notifications/', // will change this in loop
  method: 'GET',
  headers: { 'Authorization': 'Bearer dummy_token', 'Accept': 'application/json' }
};

const paths = [
  '/api/notifications/',
  '/api/admin/notifications/',
  '/api/v1/notifications/',
  '/api/users/notifications/'
];

paths.forEach(p => {
  const opt = { ...options, path: p };
  const req = https.request(opt, (res) => {
    console.log(`PATH: ${p} -> STATUS: ${res.statusCode} Location: ${res.headers.location || ''}`);
  });
  req.on('error', (e) => console.error(p, e));
  req.end();
});
