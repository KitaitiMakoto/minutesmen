var express = require("express");
var app = express();
var http = require("http").Server(app);
var io = require("socket.io")(http);
var db = require("influx")({
    host: "localhost",
    port: 8086,
    database: "minutesmen",
    username: "minutesmen",
    password: "who watches the watchmen?"
});

app.use(express.static("."));

app.get("/", function(req, res) {
    res.sendFile(__dirname + "/minutes.html");
});

io.on("connection", function(user) {
    var connectionId = user.id;
    console.log("a user connected");
    user.on("disconnect", function() {
        console.log("user disconnected");
    });
    user.on("speech", function(message, ack) {
        message.connection_id = connectionId;
        message.time = Date.now();
        console.log(message);
        db.writePoint("speech", message, function(error, data) {
            if (error) {
                console.error(error);
            }
        });
        user.broadcast.emit("speech", message);
        ack(message);
    });
});

http.listen(3000, function() {
    console.log("linstening on *:3000");
});
