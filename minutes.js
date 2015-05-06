"use strict";

this.SpeechRecognition = this.SpeechRecognition || this.webkitSpeechRecognition;
if (! SpeechRecognition) {
    alert("Speech Recognition API is not supported in your browser. " +
          "Please inquire of browser vendor.\n" +
          "You can post message only by text input for now.");
}

Promise.all([DOMContentLoaded(document), initWebSocket()]).then(function(docAndWs) {
    var ws = docAndWs[1];
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
        document.getElementById("recognition").appendChild(p);
    });
    var logger, iconField, nameField, langField, messageField;
    var speechStreams = createSpeechStream(ws).tee();
    logger = document.getElementById("log");
    var logWriter = createSpeechLogger();
    var consoleSpeechLogger = createConsoleSpeechLogger();
    speechStreams[0].pipeTo(logWriter);
    speechStreams[1].pipeTo(consoleSpeechLogger);
    var form = document.querySelector("form");
    iconField = form.querySelector('[name="icon"]');
    nameField = form.querySelector('[name="name"]');
    langField = document.querySelector('[name="lang"]');
    messageField = form.querySelector('[name="speech"]');

    getLogs().then(function appendInitialLogs(logs) {
        var logs = logs[0];
        var timeCol = logs.columns.indexOf("time");
        var nameCol = logs.columns.indexOf("name");
        var speechCol = logs.columns.indexOf("speech");
        logs.points.reverse().forEach(function appendLog(log) {
            var message = {
                time: log[timeCol],
                name: log[nameCol],
                speech: log[speechCol]
            };
            logSpeech(message);
        });
    }).catch(function onerror(error) {
        console.error(error);
    });

    var formSubmitStream = createFormSubmitStream(form);
    formSubmitStream
        .pipeThrough(createSpeechPoster(ws))
        .pipeTo(logWriter);

    if (SpeechRecognition) {
        var recognition = new SpeechRecognition();
        recognition.interimResults = true;
        recognition.continuous = true;
        recognition.maxAlternatives = 1;

        var speechRecognitionStream = createSpeechRecognitionStream(recognition);
        speechRecognitionStream
            .pipeThrough(createSpeechPoster(ws))
            .pipeTo(logWriter);
        var intervalId, listening;
        document.getElementById("start-button").onclick = function startRecognition() {
            recognition.lang = langField.value || "en";
            recognition.start();
            listening = true;
            // TODO: Wait for use of michrophone granted
            if (location.protocol === "https:") {
                recognition.onend = function() {
                    recognition.start();
                    listening = true;
                }
                intervalId = setInterval(function() {
                    recognition.stop();
                    listening = false;
                }, 3000);
            }
        };
        document.getElementById("stop-button").onclick = function stopRecognition() {
            recognition.onend = null;
            if (listening) {
                recognition.stop();
            }
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }

    function logSpeech(message) {
        var li = document.createElement("li");
        li.textContent = "[" +
            (new Date(Number(message.time))).toLocaleString() +
            "]" + message.name +
            ": " + message.speech;
        logger.appendChild(li);
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
                        result = results[i];
                        var alt = result.item(0);
                        if (result.isFinal && alt.confidence > 0.3) {
                            var data = {
                                name: nameField.value,
                                speech: alt.transcript
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

    function createSpeechLogger() {
        return new WritableStream({
            write: logSpeech
        });
    }

    function createConsoleSpeechLogger() {
        return new WritableStream({
            write: function logSpeech(message) {
                console.log("speech", message);
            }
        });
    }

    // TODO: Extract message field handle
    function createSpeechPoster(ws) {
        return new TransformStream({transform: function(data, enqueue, done) {
            ws.emit("speech", data, function onack(message) {
                console.log("ack", message);
                enqueue(message);
                done();
            });
            messageField.value = "";
        }});
    }
}).catch(function(error) {
    console.error(error);
    alert(error);
});

function DOMContentLoaded(doc) {
    return new Promise(function(resolve, reject) {
        if (doc.readyState !== "loading") {
            resolve(doc);
            return;
        }
        function resolveLoaded(event) {
            resolve(doc);
            event.target.removeEventListener(event.type, resolveLoaded);
        };
        doc.addEventListener("DOMContentLoaded", resolveLoaded);
    });
}

function initWebSocket() {
    return new Promise(function(resolve, reject) {
        var ws = io();
        ws.on("connect", function() {
            resolve(ws);
        });
        ws.on("connect_error", function(error) {
            reject(error);
        });
    });
}
