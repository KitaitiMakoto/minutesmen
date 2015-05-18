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

    var form = document.querySelector("form");

    var logWriter = createSpeechLogger(document.getElementById("log"));
    var speechPoster = createSpeechPoster(ws, form);
    createFormSubmitStream(form)
        .pipeTo(speechPoster.writable);
    if (SpeechRecognition) {
        var comp = new RecognitionComponent(document.getElementById("start-button"), document.getElementById("stop-button"), document.querySelector('[name="lang"]'));
        comp.stream
            .pipeTo(speechPoster.writable);
    }

    [
        createSpeechStream(ws),
        makeReadableArrayPushStream(initialLogs.reverse()),
        speechPoster.readable
    ].forEach(function popeToLogWriter(readableStream) {
        readableStream.pipeTo(logWriter);
    });

    function displayPeerId(id) {
        document.getElementById("peer-id").value = id;
    }

    function createSpeechStream(ws) {
        return new ReadableStream({
            start: function startSpeechStream(controller) {
                ws.on("speech", function(message) {
                    console.log("speech", message);
                    controller.enqueue(message);
                });
            },
            error: function errorSpeechStream() {
                controller.error(new Error("Speech stream error"));
            }
        });
    }

    function createFormSubmitStream(form) {
        var iconField = form.querySelector('[name="icon"]');
        var messageField = form.querySelector('[name="speech"]');
        return new ReadableStream({
            start: function submitSpeech(controller) {
                form.addEventListener("submit", function submit(event) {
                    controller.enqueue(messageField.value);
                    event.preventDefault();
                });
            }
        });
    }

    function createSpeechLogger(logger) {
        return new WritableStream({
            write: function logSpeech(message) {
                var li = document.createElement("li");
                li.textContent = "[" +
                    (new Date(Number(message.time))).toLocaleString() +
                    "]" + message.name +
                    ": " + message.speech;
                logger.appendChild(li);
            }
        });
    }

    // TODO: Extract message field handle
    function createSpeechPoster(ws, form) {
        var nameField = form.querySelector('[name="name"]');
        var messageField = form.querySelector('[name="speech"]');
        return new TransformStream({transform: function(speech, enqueue, done) {
            var data = {
                name: nameField.value,
                speech: speech
            };
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
    error.stack.split("\n").forEach(function(line) {
        console.error(line);
    });
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
        request.ontimeout = function ontimeout(error) {
            resolve([]);
            console.error(error);
        };
        request.onerror = function onerror() {
            reject(new Error(request.statusText));
        };
        request.timeout = 3000;
        request.send();
    });
}

function makeReadableArrayPushStream(array) {
    return new ReadableStream({
        start: function startArrayStream(controller) {
            array.forEach(function pushArrayItem(item) {
                controller.enqueue(item);
            });
        },
        cacnel: function cancelArrayStream() {
            array.length = 0;
        }
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
    this.lang = this.langField.value || "en";
    var recog = this;
    this.langField.addEventListener("change", function setLang(event) {
        recog.lang = event.target.value || "en";
    });

    this.recognition = new SpeechRecognition();
    this.recognition.interimResults = true;
    this.recognition.continuous = true;
    this.recognition.maxAlternatives = 1;

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
    this.recognition.lang = this.lang;
    this.startButton.disabled = true;
    if (! this.usingTls) {
        this.langField.disabled = true;
    }
    this._start("starting").then(function() {
        recog.state = "listening";
        recog.stopButton.disabled = false;
        if (recog.usingTls) {
            recog.intervalId = setInterval(recog.restart.bind(recog), 3000);
        }
    }).catch(function(error) {
        recog.startButton.disabled = false;
        if (! recog.usingTls) {
            recog.langField.disabled = false;
        }
    });
};
RecognitionComponent.prototype.stop = function stopRecognition() {
    // TODO: How should to do when starting
    if (["stopping", "stopped"].indexOf(this.state) !== -1) {
        return;
    }
    var recog = this;
    this.stopButton.disabled = true;
    this._stop("stopping").then(function() {
        recog.state = "stopped";
        recog.startButton.disabled = false;
        if (! recog.usingTls) {
            recog.langField.disabled = false;
        }
        if (recog.intervalId) {
            clearInterval(recog.intervalId);
        }
    }).catch(function(error) {
        recog.stopButton.disabled = false;
    });
};
RecognitionComponent.prototype.restart = function restartRecognition() {
    if (this.state === "restarting") {
        return;
    }
    var recog = this;
    this._stop("restarting").then(function() {
        recog._start("restarting").then(function() {
            recog.state = "listening";
        });
    });
};
RecognitionComponent.prototype._start = function _startRecognition(state) {
    return this._call(state, "start", "onstart");
};
RecognitionComponent.prototype._stop = function _stopRecognition(state) {
    return this._call(state, "stop", "onend");
};
RecognitionComponent.prototype._call = function _callRecognitionFunction(state, funcName, callbackFuncName) {
    var recog = this;
    var prevState = this.state;
    return new Promise(function(resolve, reject) {
        recog.state = state;
        recog.recognition[callbackFuncName] = resolve;
        recog.recognition.onerror = function onerror(error) {
            recog.state = prevState;
            reject(error);
            console.error(error);
            alert(error);
        };
        recog.recognition[funcName]();
    });
};
