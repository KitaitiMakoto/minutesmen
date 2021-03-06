var express = require("express");
var app = express();
var fs = require("fs");
var https = require("https").createServer({
    key: fs.readFileSync("key.pem"),
    cert: fs.readFileSync("cert.pem")
}, app);
var io = require("socket.io")(https);
var db = require("influx")({
    host: "localhost",
    port: 8086,
    database: "minutesmen",
    username: "minutesmen",
    password: "who watches the watchmen?"
});
var peer = require("peer").ExpressPeerServer;

db.getSeriesNames("minutesmen", function(error, seriesNames) {
    if (error) {
        throw error;
    }
});

function getRecentLogs() {
    return new Promise(function(resolve, reject) {
        db.query("select time, name, speech from speech limit 12", function sendLogs(error, logs) {
            if (error) {
                reject(new Error(error));
            } else {
                resolve(logs[0]);
            }
        });
    });
}

app.use(express.static("."));

app.use("/peers", peer(https));

app.get("/", function(req, res) {
    res.sendFile(__dirname + "/minutes.html");
});

app.get("/logs", function(req, res) {
    getRecentLogs().then(function(logs) {
        res.send(logs);
    }).catch(function() {
        console.error("[ERROR]/logs: " + error);
        res.status(500).end();
    });
});

io.on("connection", function(user) {
    var connectionId = user.id;
    console.log("a user " + connectionId + " connected");
    user.on("disconnect", function() {
        console.log("user " + connectionId + " disconnected");
    });
    user.on("speech", function(message, ack) {
        message.connection_id = connectionId;
        message.time = Date.now();
        console.log(message);
        db.writePoint("speech", message, function(error, data) {
            if (error) {
                console.error(connectionId, error);
            }
        });
        user.broadcast.emit("speech", message);
        ack(message);
    });
});

https.listen(3000, function() {
    console.log("linstening on *:3000");
});
