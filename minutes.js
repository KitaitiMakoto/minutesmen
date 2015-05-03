"use strict";

document.addEventListener("DOMContentLoaded", function DOMContentLoaded() {
    var ws = io();
    var logger = document.getElementById("log");
    var form = document.querySelector("form");
    var iconField = form.querySelector('[name="icon"]');
    var nameField = form.querySelector('[name="name"]');
    var messageField = form.querySelector('[name="speech"]');
    ws.on("connect", function() {
        form.onsubmit = function onsubmit(event) {
            var data = {
                name: nameField.value,
                speech: messageField.value
            };
            ws.emit("speech", data, function onack(message) {
                console.log("ack", message);
                var log = document.createElement("li");
                log.textContent = "[" +
                    (new Date(Number(message.time))).toLocaleString() +
                    "]" + message.name +
                    ": " + message.speech;
                logger.appendChild(log);
            });
            messageField.value = "";
            event.preventDefault();
        };
        ws.on("speech", function onbroadcast(message) {
            console.log("broadcast", message);
            var log = document.createElement("li");
            log.textContent = "[" +
                (new Date(Number(message.time))).toLocaleString() +
                "]" + message.name +
                ": " + message.speech;
            logger.appendChild(log);
        });
    });
});
