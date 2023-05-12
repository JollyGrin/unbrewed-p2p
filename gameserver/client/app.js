var app = require('express')();
var server = require('http').Server(app);

server.listen(3000);
// WARNING: app.listen(80) will NOT work here!

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});
