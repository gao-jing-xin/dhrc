var settings = process.dhrcSettings;

if (!settings.weezHttpURL) {
    settings.weezHttpURL = 'http://' + settings.weez + (settings.port == 80 ? '' : ':' + settings.port) + '/index.html';
}
var express = require('express');
var path = require('path');
var weez = express();
weez.use(express.static(path.join(__dirname, 'weez')));
weez.use(function (req, res, next) {
    res.redirect(settings.weezHttpURL);
});
module.exports = weez;
