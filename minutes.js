"use strict";

this.SpeechRecognition = this.SpeechRecognition || this.webkitSpeechRecognition;
if (! SpeechRecognition) {
    alert("Speech Recognition API is not supported in your browser. " +
          "Please inquire of browser vendor.\n" +
          "You can post message only by text input for now.");
}


document.addEventListener("DOMContentLoaded", function DOMContentLoaded() {
    var ws = io();
    var peer = new Peer(null, {
        debug: 3,
        host: location.hostname,
        port: location.port,
        path: "/peers"
    });
    peer.on("open", function peerReady(id) {
        var p = document.createElement("p");
        var idLabel = document.createElement("label");
        idLabel.textContent = "Peer ID: ";
        var idField = document.createElement("input");
        idField.readOnly = true;
        idField.value = id;
        idLabel.appendChild(idField);
        p.appendChild(idLabel);
        form.appendChild(p);
    });
    var logger, iconField, nameField, langField, messageField;
    var speechStreams = createSpeechStream(ws).tee();
    logger = document.getElementById("log");
    var logWriter = attachLogger(logger);
    var consoleSpeechLogger = createConsoleSpeechLogger();
    speechStreams[0].pipeTo(logWriter);
    speechStreams[1].pipeTo(consoleSpeechLogger);
    var form = document.querySelector("form");
    iconField = form.querySelector('[name="icon"]');
    nameField = form.querySelector('[name="name"]');
    langField = form.querySelector('[name="lang"]');
    messageField = form.querySelector('[name="speech"]');

    getLogs().then(function appendInitialLogs(logs) {
        var logs = logs[0];
        var timeCol = logs.columns.indexOf("time");
        var nameCol = logs.columns.indexOf("name");
        var speechCol = logs.columns.indexOf("speech");
        logs.points.reverse().forEach(function appendLog(log) {
            var time = log[timeCol];
            var name = log[nameCol];
            var speech = log[speechCol];
            var li = document.createElement("li");
            li.textContent = "[" +
                (new Date(Number(time))).toLocaleString() +
                "]" + name +
                ": " + speech;
            logger.appendChild(li);
        });
    }).catch(function onerror(error) {
        console.error(error);
    });

    var formSubmitStream = createFormSubmitStream(form);
    var speechPoster = createSpeechPoster(ws);
    formSubmitStream.pipeTo(speechPoster);

    if (SpeechRecognition) {
        var recognition = new SpeechRecognition();
        recognition.interimResults = true;
        recognition.continuous = true;
        recognition.maxAlternatives = 1;

        var speechRecognitionStream = createSpeechRecognitionStream(recognition);
        speechRecognitionStream.pipeTo(speechPoster);
        document.getElementById("start-button").onclick = function startRecognition() {
            recognition.lang = langField.value || "en";
            recognition.start();
        };
        document.getElementById("stop-button").onclick = function stopRecognition() {
            recognition.stop();
        };
    }

    function getLogs() {
        return new Promise(function getLogs(resolve, reject) {
            var request = new XMLHttpRequest();
            request.open("GET", "/logs");
            request.setRequestHeader("accept", "application/json");
            request.onload = function onload() {
                if (this.status === 200) {
                    resolve(JSON.parse(this.responseText));
                } else {
                    reject(new Error(request.statusText));
                }
            };
            request.onerror = function onerror() {
                reject(new Error(request.statusText));
            };
            request.send();
        });
    }

    function createSpeechStream(ws) {
        return new ReadableStream({
            start: function startSpeechStream(controller) {
                ws.on("speech", function onSpeech(message) {
                    controller.enqueue(message);
                });
            },
            error: function errorSpeechStream() {
                controller.error(new Error("Speech stream error"));
            }
        });
    }

    function createFormSubmitStream(form) {
        return new ReadableStream({
            start: function submitSpeech(controller) {
                form.addEventListener("submit", function submit(event) {
                    var data = {
                        name: nameField.value,
                        speech: messageField.value
                    };
                    controller.enqueue(data);
                    event.preventDefault();
                });
            }
        });
    }

    function createSpeechRecognitionStream(recognition) {
        return new ReadableStream({
            start: function startSpeechRecognition(controller) {
                recognition.onresult = function postSpeech(event) {
                    var results = event.results;
                    var i = event.resultIndex, l = results.length, result;
                    for (; i < l; i++) {
                        result = results[i].item(0);
                        if (result.confidence > 0.3) {
                            var data = {
                                name: nameField.value,
                                speech: result.transcript
                            }
                            controller.enqueue(data);
                        }
                    }
                };
            },
            cancel: function cancelSpeechRecognition(reason) {
                recognition.stop();
            }
        });
    }

    function attachLogger(loggerElem) {
        return new WritableStream({
            write: function log(message) {
                var li = document.createElement("li");
                li.textContent = "[" +
                    (new Date(Number(message.time))).toLocaleString() +
                    "]" + message.name +
                    ": " + message.speech;
                loggerElem.appendChild(li);
            }
        });
    }

    function createConsoleSpeechLogger() {
        return new WritableStream({
            write: function logSpeech(message) {
                console.log("speech", message);
            }
        });
    }

    // TODO: Extract ack part
    // TODO: Extract message field handle
    function createSpeechPoster(ws) {
        return new WritableStream({
            write: function postSpeech(data) {
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
            }
        });
    }
});
