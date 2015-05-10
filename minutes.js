"use strict";

this.SpeechRecognition = this.SpeechRecognition || this.webkitSpeechRecognition;
if (! SpeechRecognition) {
    alert("Speech Recognition API is not supported in your browser. " +
          "Please inquire of browser vendor.\n" +
          "You can post message only by text input for now.");
}

Promise.all([
    DOMContentLoaded(document),
    initWebSocket(),
    initPeer(),
    getLogs()
]).then(function main(initialized) {
    var ws = initialized[1];
    var peerId = initialized[2];
    var initialLogs = initialized[3];

    displayPeerId(peerId);

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

    displayInitialLogs(initialLogs);

    var formSubmitStream = createFormSubmitStream(form);
    formSubmitStream
        .pipeThrough(createSpeechPoster(ws))
        .pipeTo(logWriter);

    if (SpeechRecognition) {
        var comp = new RecognitionComponent(document.getElementById("start-button"), document.getElementById("stop-button"), langField);
        comp.stream
            .pipeThrough(new TransformStream({
                transform: function(data, enqueue, done) {
                    enqueue({
                        name: nameField.value,
                        speech: data
                    });
                }
            }))
            .pipeThrough(createSpeechPoster(ws))
            .pipeTo(logWriter);
    }

    function displayInitialLogs(logs) {
        logs.reverse().forEach(logSpeech);
    }

    function displayPeerId(id) {
        document.getElementById("peer-id").value = id;
    }

    function logSpeech(message) {
        var li = document.createElement("li");
        li.textContent = "[" +
            (new Date(Number(message.time))).toLocaleString() +
            "]" + message.name +
            ": " + message.speech;
        logger.appendChild(li);
    }

    function createSpeechStream(ws) {
        return new ReadableStream({
            start: function startSpeechStream(controller) {
                ws.on("speech", controller.enqueue.bind(controller));
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

function initPeer() {
    return new Promise(function(resolve, reject) {
        var peer = new Peer(null, {
            debug: 3,
            host: location.hostname,
            port: location.port,
            path: "/peers"
        });
        peer.on("open", resolve);
        peer.on("error", reject);
    });
}

function getLogs() {
    return new Promise(function getLogs(resolve, reject) {
        var request = new XMLHttpRequest();
        request.open("GET", "/logs");
        request.setRequestHeader("accept", "application/json");
        request.onload = function onload() {
            if (this.status === 200) {
                var logs = JSON.parse(this.responseText)[0];
                var cols = ["time", "name", "speech"];
                var colNames = cols.reduce(function makeColIndices(indices, col) {
                    indices[logs.columns.indexOf(col)] = col;
                    return indices;
                }, {});
                resolve(
                    logs.points.map(function objectifyRecord(point) {
                        var obj = {};
                        for (var i in colNames) {
                            obj[colNames[i]] = point[i];
                        }
                        return obj;
                    })
                );
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

function RecognitionComponent(startButton, stopButton, langField) {
    this.startButton = startButton;
    this.stopButton = stopButton;
    this.langField = langField;
    this.startButton.addEventListener("click", this.start.bind(this));
    this.stopButton.addEventListener("click", this.stop.bind(this));

    this.state = "stopped";// stopped starting listening stopping restarting
    this.usingTls = location.protocol === "https:";

    this.recognition = new SpeechRecognition();
    this.recognition.interimResults = true;
    this.recognition.continuous = true;
    this.recognition.maxAlternatives = 1;
    this.listening = false;

    var recognition = this.recognition;
    this.stream = new ReadableStream({
        start: function startSpeechRecognition(controller) {
            recognition.onresult = function postSpeech(event) {
                var results = event.results;
                var i = event.resultIndex, l = results.length, result;
                for (; i < l; i++) {
                    result = results[i];
                    var alt = result.item(0);
                    if (result.isFinal && alt.confidence > 0.3) {
                        controller.enqueue(alt.transcript);
                    }
                }
            };
        },
        cancel: function cancelSpeechRecognition(reason) {
            recognition.stop();
        }
    });
}
RecognitionComponent.prototype.start = function startRecognition() {
    // TODO: How should do when stopping
    if (["listening", "starting", "restarting"].indexOf(this.state) !== -1) {
        return;
    }
    var recog = this;
    var prevState = this.state;
    this.recognition.lang = this.langField.value || "en";
    this.startButton.disabled = true;
    this.langField.disabled = true;
    this._start("starting").then(function() {
        recog.state = "listening";
        recog.stopButton.disabled = false;
        if (recog.usingTls) {
            recog.intervalId = setInterval(recog.restart.bind(recog), 3000);
        }
    }).catch(function(error) {
        recog.state = prevState;
        recog.startButton.disabled = false;
        recog.langField.disabled = false;
        console.error(error);
        alert(error);
    });
};
RecognitionComponent.prototype.stop = function stopRecognition() {
    // TODO: How should to do when starting
    if (["stopping", "stopped"].indexOf(this.state) !== -1) {
        return;
    }
    var recog = this;
    var prevState = this.state;
    this.stopButton.disabled = true;
    this._stop("stopping").then(function() {
        recog.state = "stopped";
        recog.startButton.disabled = false;
        recog.langField.disabled = false;
        clearInterval(recog.intervalId);
    }).catch(function(error) {
        recog.state = prevState;
        recog.stopButton.disabled = false;
        console.error(error);
        alert(error);
    });
};
RecognitionComponent.prototype.restart = function restartRecognition() {
    if (this.state === "restarting") {
        return;
    }
    var recog = this;
    var prevState = this.state;
    this._stop("restarting").then(function() {
        recog._start("restarting").then(function() {
            recog.state = "listening";
        }).catch(function(error) {
            recog.state = prevState;
            console.error(error);
            alert(error);
        });
    }).catch(function(error) {
        recog.state = prevState;
        console.error(error);
        alert(error);
    });
};
RecognitionComponent.prototype._start = function _startRecognition(state) {
    var recog = this;
    return new Promise(function(resolve, reject) {
        recog.state = state;
        recog.recognition.onstart = resolve;
        recog.recognition.onerror = reject;
        recog.recognition.start();
    });
};
RecognitionComponent.prototype._stop = function _stopRecognition(state) {
    var recog = this;
    return new Promise(function(resolve, reject) {
        recog.state = state;
        recog.recognition.onend = resolve;
        recog.recognition.onerror = reject;
        recog.recognition.stop();
    });
};
